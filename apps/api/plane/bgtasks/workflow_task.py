# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Workflow graph engine — dispatch + execution.

`enqueue_workflows_for_issue` is called (synchronously, post-commit) from the
issue-created signal: it finds enabled workflows whose trigger node matches the
event, creates a `WorkflowRun`, and enqueues `run_workflow`.

`run_workflow` (Celery) walks the graph from the trigger node: condition nodes
evaluate their filters and route to the true/false branch; action nodes execute
via a small executor registry. The `ask_atlas` action reuses
`run_agent_on_issue` so the LLM tool-use loop, telemetry, and pause/resume all
carry over, and links the resulting `AgentRun` to the `WorkflowNodeRun`.

Phase 1 executes only `ask_atlas`; other action types record a skipped node run.
"""

import logging
from datetime import datetime, timezone
from decimal import Decimal

from celery import shared_task

logger = logging.getLogger(__name__)

_ISSUE_PRIORITY_VALUES = {"urgent", "high", "medium", "low", "none"}
# Guard against pathological graphs (cycles slip past validation, huge fan-outs).
_MAX_NODES_PER_RUN = 50


def enqueue_workflows_for_issue(issue, event: str, skip_agent_ids=None) -> None:
    """Create a WorkflowRun + enqueue run_workflow for every enabled workflow in
    the issue's workspace whose trigger node matches `event`. `skip_agent_ids`
    lets the caller avoid double-dispatching an agent that already ran via an
    agent-level trigger (mirrors the old AgentAutomation dedup).
    """
    from plane.db.models import WorkflowNode, WorkflowRun

    skip_agent_ids = set(skip_agent_ids or set())

    trigger_nodes = list(
        WorkflowNode.objects.select_related("workflow", "workflow__agent").filter(
            workflow__workspace_id=issue.workspace_id,
            workflow__is_enabled=True,
            workflow__deleted_at__isnull=True,
            kind="trigger",
            config__event=event,
            deleted_at__isnull=True,
        )
    )

    for node in trigger_nodes:
        workflow = node.workflow
        agent_id = str(workflow.agent_id) if workflow.agent_id else None
        if agent_id and agent_id in skip_agent_ids:
            continue
        try:
            run = WorkflowRun.objects.create(
                workflow=workflow,
                trigger_event=event,
                issue=issue,
                status="pending",
            )
            run_workflow.delay(str(run.id))
            if agent_id:
                skip_agent_ids.add(agent_id)
        except Exception:  # noqa: BLE001 — one bad workflow must not block others
            logger.exception(
                "workflow enqueue failed for workflow=%s issue=%s", workflow.id, issue.id
            )


def enqueue_workflows_for_issue_id(issue_id: str, event: str) -> None:
    """Signal-friendly wrapper: load the issue by id, then enqueue matching
    workflows for `event`. Used by the assigned/comment/updated triggers."""
    from plane.db.models import Issue

    try:
        issue = Issue.objects.select_related("project", "workspace", "state").get(pk=issue_id)
    except Issue.DoesNotExist:
        return
    except Exception:  # noqa: BLE001
        logger.exception("workflow enqueue: issue %s fetch failed", issue_id)
        return
    enqueue_workflows_for_issue(issue, event)


def _filters_match_issue(filters: dict, issue) -> bool:
    """Evaluate a condition node's `{filters: {...}}` against an issue. Mirrors
    the legacy AgentAutomation matching (project / priority / label / type),
    so migrated workflows behave identically. Empty filters match everything.
    """
    if not isinstance(filters, dict):
        return True

    project_ids = [str(v).strip() for v in (filters.get("project_ids") or []) if str(v).strip()]
    if project_ids and str(issue.project_id) not in project_ids:
        return False

    priorities = [str(v).strip() for v in (filters.get("priorities") or []) if str(v).strip()]
    valid_priorities = [v for v in priorities if v in _ISSUE_PRIORITY_VALUES]
    if valid_priorities and (issue.priority or "none") not in valid_priorities:
        return False

    issue_type_ids = [str(v).strip() for v in (filters.get("issue_type_ids") or []) if str(v).strip()]
    if issue_type_ids and str(issue.type_id) not in issue_type_ids:
        return False

    label_ids = [str(v).strip() for v in (filters.get("label_ids") or []) if str(v).strip()]
    if label_ids:
        from plane.db.models import IssueLabel

        try:
            has_match = IssueLabel.objects.filter(
                issue_id=issue.id, label_id__in=label_ids, deleted_at__isnull=True
            ).exists()
        except Exception:
            logger.exception("workflow label match failed for issue=%s", issue.id)
            return False
        if not has_match:
            return False

    return True


@shared_task(name="plane.bgtasks.workflow_task.run_workflow")
def run_workflow(workflow_run_id: str, allow_disabled: bool = False) -> None:
    """Walk a workflow graph for one WorkflowRun.

    Event-driven runs re-check the workflow's enabled state at execution time,
    closing the queue race where a workflow is switched off after it enqueues.
    Draft workflows may still be run deliberately through the Test endpoint.
    """
    from plane.db.models import Issue, WorkflowEdge, WorkflowNode, WorkflowNodeRun, WorkflowRun

    try:
        run = WorkflowRun.objects.select_related("workflow", "workflow__agent", "issue").get(
            pk=workflow_run_id
        )
    except WorkflowRun.DoesNotExist:
        logger.warning("run_workflow: run %s not found", workflow_run_id)
        return

    # Idempotency: only a freshly-created pending run should execute.
    if run.status != "pending":
        logger.info("run_workflow: run %s already %s, skipping", run.id, run.status)
        return

    workflow = run.workflow
    issue = run.issue
    if not workflow.is_enabled and not allow_disabled:
        _finish_run(run, "cancelled", error="workflow was disabled before execution")
        return

    run.status = "running"
    run.started_at = datetime.now(timezone.utc)
    run.save(update_fields=["status", "started_at", "updated_at"])

    if issue is None:
        _finish_run(run, "failed", error="workflow run has no issue")
        return

    # Re-fetch the issue with the relations the executors/conditions need.
    try:
        issue = Issue.objects.select_related("project", "workspace", "state").get(pk=issue.id)
    except Issue.DoesNotExist:
        _finish_run(run, "failed", error="issue no longer exists")
        return

    nodes = list(WorkflowNode.objects.filter(workflow=workflow, deleted_at__isnull=True))
    edges = list(WorkflowEdge.objects.filter(workflow=workflow, deleted_at__isnull=True))
    node_by_id = {str(n.id): n for n in nodes}
    out_edges: dict = {}
    for e in edges:
        out_edges.setdefault(str(e.from_node_id), []).append(e)

    trigger = next((n for n in nodes if n.kind == "trigger"), None)
    if trigger is None:
        _finish_run(run, "failed", error="workflow has no trigger node")
        return

    default_agent = workflow.agent
    total_tokens = 0
    total_cost = Decimal("0")
    had_failure = False

    # Iterative walk. Condition nodes pick a single branch; other nodes follow
    # all (unbranched) out-edges. `visited` guards against cycles.
    visited: set = set()
    queue = [str(trigger.id)]
    steps = 0

    while queue and steps < _MAX_NODES_PER_RUN:
        node_id = queue.pop(0)
        if node_id in visited:
            continue
        visited.add(node_id)
        node = node_by_id.get(node_id)
        if node is None:
            continue
        steps += 1

        follow_branch = None  # None → follow all unbranched edges

        if node.kind == "trigger":
            pass  # entry point, nothing to execute

        elif node.kind == "condition":
            filters = (node.config or {}).get("filters", {})
            try:
                matched = _filters_match_issue(filters, issue)
            except Exception:  # noqa: BLE001
                logger.exception("run_workflow: condition eval failed node=%s", node.id)
                matched = False
            WorkflowNodeRun.objects.create(
                run=run, node=node, status="completed", output={"matched": matched}
            )
            follow_branch = "true" if matched else "false"

        elif node.kind == "action":
            tokens, cost, failed = _execute_action(run, node, issue, default_agent)
            total_tokens += tokens
            total_cost += cost
            had_failure = had_failure or failed

        # Enqueue downstream nodes.
        for e in out_edges.get(node_id, []):
            if follow_branch is not None:
                if (e.branch or "") != follow_branch:
                    continue
            else:
                # Non-condition nodes follow only unbranched edges.
                if e.branch:
                    continue
            queue.append(str(e.to_node_id))

    run.total_tokens = total_tokens
    run.cost_usd = total_cost
    _finish_run(run, "failed" if had_failure else "completed")


def _execute_action(run, node, issue, default_agent):
    """Execute one action node. Returns (tokens, cost, failed)."""
    from plane.db.models import Agent, WorkflowNodeRun

    config = node.config or {}
    action_type = config.get("type", "ask_atlas")
    node_run = WorkflowNodeRun.objects.create(run=run, node=node, status="running")

    if action_type == "ask_atlas":
        # Resolve the agent: node param override, else the workflow default.
        agent = default_agent
        param_agent_id = (config.get("params") or {}).get("agent_id")
        if param_agent_id:
            agent = Agent.objects.filter(pk=param_agent_id, deleted_at__isnull=True).first() or default_agent
        if agent is None or not agent.is_enabled:
            node_run.status = "failed"
            node_run.error = "no enabled agent for ask_atlas action"
            node_run.save(update_fields=["status", "error", "updated_at"])
            return 0, Decimal("0"), True

        from plane.bgtasks.agent_dispatch_task import run_agent_on_issue

        try:
            agent_run = run_agent_on_issue(agent, issue, run.trigger_event)
        except Exception as exc:  # noqa: BLE001
            logger.exception("run_workflow: ask_atlas failed node=%s", node.id)
            node_run.status = "failed"
            node_run.error = f"{exc.__class__.__name__}: {exc}"
            node_run.save(update_fields=["status", "error", "updated_at"])
            return 0, Decimal("0"), True

        node_run.agent_run = agent_run
        if agent_run is not None:
            node_run.status = "failed" if agent_run.status == "failed" else "completed"
            node_run.output = {"agent_run_id": str(agent_run.id), "agent_status": agent_run.status}
            node_run.save(update_fields=["agent_run", "status", "output", "updated_at"])
            return (
                int(agent_run.total_tokens or 0),
                Decimal(str(agent_run.cost_usd or 0)),
                agent_run.status == "failed",
            )
        node_run.status = "failed"
        node_run.error = "agent run was not created"
        node_run.save(update_fields=["status", "error", "updated_at"])
        return 0, Decimal("0"), True

    params = config.get("params") or {}

    # Native, no-integration actions.
    if action_type == "webhook":
        return _run_webhook(node_run, params, issue, run)
    if action_type in {"post_comment", "change_state", "add_label"}:
        if default_agent is None or not default_agent.is_enabled:
            return _fail(node_run, f"'{action_type}' needs an enabled Atlas agent to act as")
        return _run_native_action(node_run, action_type, params, issue, default_agent)

    # Integration actions (Slack / email) aren't wired yet — record a skipped
    # node run so the graph stays honest.
    node_run.status = "cancelled"
    node_run.output = {"skipped": True, "reason": f"action '{action_type}' not supported yet"}
    node_run.save(update_fields=["status", "output", "updated_at"])
    return 0, Decimal("0"), False


def _ok(node_run, output):
    node_run.status = "completed"
    node_run.output = output
    node_run.save(update_fields=["status", "output", "updated_at"])
    return 0, Decimal("0"), False


def _fail(node_run, msg):
    node_run.status = "failed"
    node_run.error = msg
    node_run.save(update_fields=["status", "error", "updated_at"])
    return 0, Decimal("0"), True


def _run_native_action(node_run, action_type, params, issue, agent):
    """post_comment / change_state / add_label — reuse the same effects the agent
    tools use, acting as the workflow's Atlas bot user."""
    try:
        if action_type == "post_comment":
            from plane.bgtasks.agent_dispatch_task import _post_comment_as_bot, _wrap_in_paragraph

            text = str(params.get("text") or "").strip()
            if not text:
                return _fail(node_run, "post_comment needs 'text'")
            html = text if text.lstrip().startswith("<") else _wrap_in_paragraph(text)
            comment = _post_comment_as_bot(agent=agent, issue=issue, html=html)
            return _ok(node_run, {"comment_id": str(comment.id)})

        if action_type == "change_state":
            from plane.db.models import State
            from plane.bgtasks.agent_dispatch_task import _emit_state_activity

            wanted = str(params.get("state_name") or "").strip()
            if not wanted:
                return _fail(node_run, "change_state needs 'state_name'")
            matched = State.objects.filter(
                project=issue.project, deleted_at__isnull=True, name__iexact=wanted
            ).first()
            if matched is None:
                candidates = list(
                    State.objects.filter(project=issue.project, deleted_at__isnull=True, name__icontains=wanted)
                )
                matched = candidates[0] if len(candidates) == 1 else None
            if matched is None:
                return _fail(node_run, f"no state '{wanted}' in this task's project")
            if issue.state_id == matched.id:
                return _ok(node_run, {"unchanged": True, "state": matched.name})
            previous_state_id = str(issue.state_id) if issue.state_id else None
            issue.state = matched
            issue.save(created_by_id=agent.bot_user_id, update_fields=["state", "completed_at", "updated_at"])
            _emit_state_activity(
                issue=issue, agent=agent, previous_state_id=previous_state_id, new_state_id=str(matched.id)
            )
            return _ok(node_run, {"state": matched.name})

        if action_type == "add_label":
            from plane.db.models import IssueLabel, Label

            label_ids = [str(x) for x in (params.get("label_ids") or []) if str(x).strip()]
            if not label_ids:
                return _fail(node_run, "add_label needs 'label_ids'")
            added = []
            for lid in label_ids:
                # Labels are project-scoped; only those in the triggered task's project apply.
                label = Label.objects.filter(pk=lid, project=issue.project, deleted_at__isnull=True).first()
                if not label:
                    continue
                if IssueLabel.objects.filter(issue=issue, label=label, deleted_at__isnull=True).exists():
                    continue
                IssueLabel.objects.create(
                    workspace=issue.workspace, project=issue.project, issue=issue, label=label
                )
                added.append(label.name)
            return _ok(node_run, {"added": added})
    except Exception as exc:  # noqa: BLE001
        logger.exception("run_workflow: %s failed node=%s", action_type, node_run.node_id)
        return _fail(node_run, f"{exc.__class__.__name__}: {exc}")

    return _fail(node_run, f"unknown native action '{action_type}'")


def _run_webhook(node_run, params, issue, run):
    """POST a small task payload to a configured URL. No integration required."""
    url = str(params.get("url") or "").strip()
    if not url.startswith(("http://", "https://")):
        return _fail(node_run, "webhook needs a valid http(s) 'url'")
    payload = {
        "event": run.trigger_event,
        "workflow_id": str(run.workflow_id),
        "run_id": str(run.id),
        "issue": {
            "id": str(issue.id),
            "name": issue.name,
            "priority": issue.priority,
            "project_id": str(issue.project_id),
        },
    }
    try:
        import requests

        resp = requests.post(url, json=payload, timeout=10)
        ok = 200 <= resp.status_code < 300
        node_run.status = "completed" if ok else "failed"
        node_run.output = {"status_code": resp.status_code}
        if not ok:
            node_run.error = f"webhook returned {resp.status_code}"
        node_run.save(update_fields=["status", "output", "error", "updated_at"])
        return 0, Decimal("0"), not ok
    except Exception as exc:  # noqa: BLE001
        logger.exception("run_workflow: webhook failed node=%s", node_run.node_id)
        return _fail(node_run, f"webhook error: {exc}")


def _finish_run(run, status: str, error: str = "") -> None:
    run.status = status
    run.error = error or run.error
    run.finished_at = datetime.now(timezone.utc)
    run.save(update_fields=["status", "error", "finished_at", "total_tokens", "cost_usd", "updated_at"])
