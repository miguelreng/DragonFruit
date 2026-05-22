# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Agent event dispatcher — Slice 2 (real LLM loop).

When an Agent's bot user is added as an assignee on an issue (or any
future trigger event), this Celery task wakes up, decrypts the agent's
BYOK credentials, and drives a tool-use loop through `LLMProvider` until
the model either posts a comment or hits the iteration cap.

Slice 1 posted a hardcoded "I'm on it" comment with no LLM call. Slice 2
calls the model for real. Slice 3 will add more tools (read_task,
change_state, link_subtask) and the draft-mode approval flow.

Safety rails baked in here (not in the provider) because they're agent-
specific:
  - The loop is capped at `agent.max_concurrent_runs` concurrent runs
    per agent (cheap pre-check; no row lock — duplicate dispatches are
    rare in practice).
  - `AgentRun.cancel_requested` is polled between turns so the workspace
    admin can hard-stop a run mid-flight.
  - If the agent is disabled OR has no BYOK credentials configured, the
    run is marked failed with a friendly message and no LLM call is
    made. The platform never falls back to a Dragon Fruit-owned key (see
    feedback_ai_byok.md).
"""

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from celery import shared_task
from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction
from django.db.models import Q
from django.utils import timezone as dj_timezone

from plane.db.models import (
    Agent,
    AgentMemory,
    AgentRun,
    Issue,
    IssueAttachment,
    IssueComment,
    IssueLabel,
    Label,
    Page,
    PageBlockComment,
    State,
)
from plane.llm import (
    LLMConfigError,
    LLMProvider,
    LLMRunResult,
    LLMTool,
    MCPClientError,
    estimate_cost_usd,
    wrap_mcp_server_as_tools,
)


logger = logging.getLogger(__name__)


# The default system prompt for agents that don't define their own. Kept
# small and explicit about the safety rail: agents should call the
# post_comment tool to reply, not produce raw text. (LiteLLM still
# returns text on the final turn, but the prompt nudges tool use.)
_DEFAULT_SYSTEM_PROMPT = (
    "You are a Dragon Fruit agent — a workspace teammate that participates in tasks like a "
    "real member. Read the task description and the most recent comments, then reply with a "
    "single concise comment that moves the task forward. Ask clarifying questions if the task "
    "is ambiguous. To reply, call the `post_comment` tool. Do not produce other output.\n\n"
    "Execution protocol (mandatory):\n"
    "1) Call `plan_next_steps` first.\n"
    "2) For each meaningful step, call `record_step` with phase=`plan`|`act`|`verify`|`report`.\n"
    "3) Every `record_step` must include `result`, `evidence`, and `next_action`.\n"
    "4) Before finishing, call `record_step` with phase=`report`, then post the final comment."
)

# Trigger-specific framing prepended to the user prompt so the model
# knows *why* it was invoked. Important for naturalness: "you were just
# assigned" vs "someone @-mentioned you in a comment" elicits very
# different replies.
_TRIGGER_FRAMING = {
    "assigned": "You were just assigned to this task. Look at the most recent context and respond.",
    "mentioned": (
        "Someone @-mentioned you in this task. The most recent comment (or the description) "
        "is the message you should respond to."
    ),
    "state_change": "This task just changed state. Decide whether anything needs your attention.",
    "comment": "There is a new comment on a task you're involved in. Respond if appropriate.",
    "manual": "You were invoked manually. Help with whatever the task needs.",
}

_MAX_ITERATIONS_PER_RUN = 6
_DEFAULT_TOOL_POLICY = "auto"


@shared_task(name="plane.bgtasks.agent_dispatch_task.dispatch_agent_event")
def dispatch_agent_event(agent_id: str, issue_id: str, trigger_event: str) -> None:
    """Run a single agent dispatch for an issue.

    Idempotency: the upstream signal fires on `IssueAssignee created=True`
    only, and IssueAssignee has a partial-unique constraint, so duplicate
    dispatches for the same assignment are not expected. We don't add an
    extra dedup guard here.
    """
    try:
        agent = Agent.objects.select_related("workspace", "bot_user").get(
            pk=agent_id, deleted_at__isnull=True
        )
    except Agent.DoesNotExist:
        logger.warning("agent_dispatch: agent %s not found, skipping", agent_id)
        return

    if not agent.is_enabled:
        logger.info("agent_dispatch: agent %s disabled, skipping", agent_id)
        return

    try:
        issue = Issue.objects.select_related("project", "workspace", "state").get(pk=issue_id)
    except Issue.DoesNotExist:
        logger.warning("agent_dispatch: issue %s not found, skipping", issue_id)
        return

    now = datetime.now(timezone.utc)
    run = AgentRun.objects.create(
        agent=agent,
        issue=issue,
        trigger_event=trigger_event,
        status="running",
        dispatched_at=now,
        tool_calls=[{"kind": "lifecycle", "phase": "run_started", "trigger_event": trigger_event}],
    )

    # If the agent has no BYOK config yet (provider_model / api_key), we
    # mark the run failed with a clear message instead of silently
    # posting a hardcoded comment as in Slice 1. The agents settings UI
    # already surfaces a `no key` badge on agents without credentials.
    try:
        provider = LLMProvider.from_agent(agent)
    except LLMConfigError as exc:
        _mark_failed(run, f"not configured: {exc}")
        logger.info("agent_dispatch: agent %s not configured (%s)", agent.id, exc)
        return

    available_states = list(
        State.objects.filter(project=issue.project, deleted_at__isnull=True)
        .order_by("sequence")
        .values_list("name", "group")
    )
    available_labels = list(
        Label.objects.filter(project=issue.project, deleted_at__isnull=True)
        .order_by("name")
        .values_list("name", flat=True)
    )
    memory_context = _build_memory_context(agent=agent, issue=issue)
    user_prompt = _build_user_prompt(issue, trigger_event, available_states, available_labels, memory_context)
    system_prompt = (agent.system_prompt or "").strip() or _DEFAULT_SYSTEM_PROMPT
    base_tools = [
        _make_post_comment_tool(agent=agent, issue=issue, run=run),
        _make_change_state_tool(agent=agent, issue=issue, run=run),
        _make_add_label_tool(agent=agent, issue=issue, run=run),
        _make_search_issues_tool(agent=agent, issue=issue, run=run),
        _make_list_attachments_tool(agent=agent, issue=issue, run=run),
        _make_plan_next_steps_tool(agent=agent, issue=issue, run=run),
        _make_record_step_tool(run=run),
        _make_remember_memory_tool(agent=agent, run=run),
        _make_search_memory_tool(agent=agent, run=run),
    ]
    tools = _apply_tool_policies(agent=agent, tools=base_tools)
    tools.extend(_apply_tool_policies(agent=agent, tools=_load_mcp_tools_for(agent)))

    try:
        result = provider.run(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            tools=tools,
            max_iterations=_MAX_ITERATIONS_PER_RUN,
            is_cancelled=lambda: _is_cancelled(run.id),
            on_tool_call=lambda call: _persist_tool_call_progress(run, call),
        )
    except Exception as exc:  # noqa: BLE001 — record the failure on the run row
        logger.exception("agent_dispatch: provider.run failed for agent=%s issue=%s", agent_id, issue_id)
        _mark_failed(run, f"{exc.__class__.__name__}: {exc}")
        return

    _finalise_run(run, result)

    # If the model produced a final text message but never called
    # post_comment, post the text as a comment ourselves so the agent
    # always leaves something visible on the issue. This is a
    # belt-and-suspenders safety: well-prompted agents will use the
    # tool, but providers occasionally bypass tools and return text.
    if result.final_text and not _run_posted_comment(result):
        _post_comment_as_bot(
            agent=agent,
            issue=issue,
            html=_wrap_in_paragraph(result.final_text),
        )


# ===================================================================== #
# Helpers                                                               #
# ===================================================================== #


def _build_user_prompt(
    issue: Issue,
    trigger_event: str = "assigned",
    available_states=None,
    available_labels=None,
    memory_context: str = "",
) -> str:
    """Render the issue as a single user-prompt string.

    `trigger_event` controls the framing line at the top so the model
    knows whether it was assigned, @-mentioned, etc. `available_states`
    is the project's state palette (name, group pairs) — listing them
    in the prompt is much cheaper than exposing a `list_states` tool.

    Slice 2 frontloads name + description + state + recent comments +
    state palette. Slice 3 will expose `read_task` as a tool so the
    agent can fetch this itself.
    """
    state_name = issue.state.name if issue.state else "(no state)"
    desc = (issue.description_stripped or "").strip()
    recent_comments = list(
        IssueComment.objects.filter(issue=issue, deleted_at__isnull=True)
        .order_by("-created_at")[:5]
        .values("actor__display_name", "actor__email", "comment_stripped")
    )

    framing = _TRIGGER_FRAMING.get(trigger_event, _TRIGGER_FRAMING["assigned"])

    parts = [
        framing,
        "",
        f"Task: {issue.name}",
        f"State: {state_name}",
        f"Project: {issue.project.name}",
        "",
        "Description:",
        desc if desc else "(no description)",
    ]
    if available_states:
        parts.append("")
        parts.append(
            "Available states in this project (use the exact name with `change_state`):"
        )
        for name, group in available_states:
            parts.append(f"- {name} ({group})")
    if available_labels:
        parts.append("")
        parts.append(
            "Available labels in this project (use the exact name with `add_label`):"
        )
        for name in available_labels:
            parts.append(f"- {name}")
    if memory_context:
        parts.append("")
        parts.append("Workspace memory (use this as durable context when relevant):")
        parts.append(memory_context)
    if recent_comments:
        parts.append("")
        parts.append("Recent comments (newest first):")
        for c in recent_comments:
            who = c.get("actor__display_name") or c.get("actor__email") or "someone"
            body = (c.get("comment_stripped") or "").strip()
            if body:
                parts.append(f"- {who}: {body[:500]}")
    return "\n".join(parts)


def _normalise_tool_policy(value: str) -> str:
    policy = (value or "").strip().lower()
    return policy if policy in {"auto", "ask", "never"} else _DEFAULT_TOOL_POLICY


def _apply_tool_policies(*, agent: Agent, tools: list[LLMTool]) -> list[LLMTool]:
    """Apply per-tool autonomy policy (auto | ask | never)."""
    policies = agent.tool_policies or {}
    filtered: list[LLMTool] = []
    for tool in tools:
        policy = _normalise_tool_policy(str(policies.get(tool.name, _DEFAULT_TOOL_POLICY)))
        if policy == "never":
            continue
        if policy == "ask":
            filtered.append(_wrap_tool_with_approval_gate(tool))
            continue
        filtered.append(tool)
    return filtered


def _wrap_tool_with_approval_gate(tool: LLMTool) -> LLMTool:
    """Return a non-executing wrapper for tools that require approval."""

    def handler(args: Dict[str, Any]) -> str:
        return json.dumps(
            {
                "approval_required": True,
                "tool": tool.name,
                "arguments": args,
                "message": (
                    "This tool is configured as ask-only. Stop and request user approval "
                    "before retrying with the same arguments."
                ),
            },
            cls=DjangoJSONEncoder,
        )

    return LLMTool(
        name=tool.name,
        description=f"{tool.description} (requires approval before execution)",
        parameters_schema=tool.parameters_schema,
        handler=handler,
    )


def _build_memory_context(*, agent: Agent, issue: Issue, limit: int = 8) -> str:
    """Retrieve recent memory entries for this workspace + agent scope."""
    rows = (
        AgentMemory.objects.filter(
            workspace=issue.workspace,
            deleted_at__isnull=True,
        )
        .filter(Q(agent__isnull=True) | Q(agent=agent))
        .order_by("-last_accessed_at", "-updated_at")[:limit]
    )
    if not rows:
        return ""

    lines: list[str] = []
    now = datetime.now(timezone.utc)
    for row in rows:
        tags = ", ".join([str(t) for t in (row.tags or [])[:4]])
        tag_part = f" tags=[{tags}]" if tags else ""
        src_part = f" source={row.source}" if row.source else ""
        lines.append(f"- {row.key}: {row.value[:400]}{tag_part}{src_part}")
        row.use_count = int(row.use_count or 0) + 1
        row.last_accessed_at = now
        row.save(update_fields=["use_count", "last_accessed_at", "updated_at"])
    return "\n".join(lines)


def _build_memory_context_for_workspace(*, agent: Agent, workspace, limit: int = 8) -> str:
    rows = (
        AgentMemory.objects.filter(
            workspace=workspace,
            deleted_at__isnull=True,
        )
        .filter(Q(agent__isnull=True) | Q(agent=agent))
        .order_by("-last_accessed_at", "-updated_at")[:limit]
    )
    if not rows:
        return ""

    lines: list[str] = []
    now = datetime.now(timezone.utc)
    for row in rows:
        tags = ", ".join([str(t) for t in (row.tags or [])[:4]])
        tag_part = f" tags=[{tags}]" if tags else ""
        src_part = f" source={row.source}" if row.source else ""
        lines.append(f"- {row.key}: {row.value[:400]}{tag_part}{src_part}")
        row.use_count = int(row.use_count or 0) + 1
        row.last_accessed_at = now
        row.save(update_fields=["use_count", "last_accessed_at", "updated_at"])
    return "\n".join(lines)


def _make_post_comment_tool(*, agent: Agent, issue: Issue, run: AgentRun) -> LLMTool:
    """The single tool exposed in Slice 2.

    The handler captures `agent`, `issue`, and `run` via closure so
    we don't have to pass them through LLMTool's signature. The tool
    returns a short confirmation string back to the model — keeps the
    loop honest (model knows the comment landed) without echoing the
    full body.
    """

    def handler(args: Dict[str, Any]) -> str:
        body = (args.get("comment_html") or args.get("body") or "").strip()
        if not body:
            return "tool_error: comment body was empty; pass `comment_html` with the HTML body"

        if _is_cancelled(run.id):
            return "tool_error: this run was cancelled by an admin; do not retry"

        # Wrap plain text in <p> if the model didn't return any HTML.
        # Cheap heuristic — anything starting with `<` is presumed HTML.
        html = body if body.lstrip().startswith("<") else _wrap_in_paragraph(body)

        comment = _post_comment_as_bot(agent=agent, issue=issue, html=html)
        if comment.is_draft:
            return f"ok: comment posted as draft (id={comment.id}); awaiting admin approval"
        return f"ok: comment posted (id={comment.id})"

    return LLMTool(
        name="post_comment",
        description=(
            "Post a comment on the current task as your reply. Use this to ask clarifying "
            "questions, suggest next steps, or confirm completion. Call this exactly once "
            "per turn and then stop — do not call it repeatedly."
        ),
        parameters_schema={
            "type": "object",
            "properties": {
                "comment_html": {
                    "type": "string",
                    "description": (
                        "The comment body. May be HTML (use <p>, <ul>, <li>, <strong>, "
                        "<em>, <code>, <pre>) or plain text — plain text will be wrapped "
                        "in a paragraph. Keep it under 2000 characters."
                    ),
                },
            },
            "required": ["comment_html"],
        },
        handler=handler,
    )


def _make_change_state_tool(*, agent: Agent, issue: Issue, run: AgentRun) -> LLMTool:
    """Tool that lets the agent move the task between workflow states.

    Slice 2 ships this alongside `post_comment` so the agent can
    actually act on the task, not just chat about it. A well-prompted
    PM bot might triage incoming tasks by moving "needs more info"
    ones to a clarification state and pinging the reporter.

    Safety: only states already defined in the issue's project are
    valid. The handler does a case-insensitive name match (most LLMs
    case-mangle one way or the other) but enforces an exact lookup
    after that. No state creation from the tool.
    """

    def handler(args: Dict[str, Any]) -> str:
        wanted = (args.get("state_name") or args.get("name") or "").strip()
        if not wanted:
            return "tool_error: pass `state_name` with the exact state name (e.g. 'In Progress')"

        if _is_cancelled(run.id):
            return "tool_error: this run was cancelled by an admin; do not retry"

        # Case-insensitive exact match within the issue's project.
        matched = (
            State.objects.filter(
                project=issue.project,
                deleted_at__isnull=True,
                name__iexact=wanted,
            )
            .first()
        )
        if matched is None:
            # Fall back to substring on a single match so "In Prog" still
            # works if the model truncated. If there's more than one
            # candidate, the model has to pick.
            candidates = list(
                State.objects.filter(
                    project=issue.project,
                    deleted_at__isnull=True,
                    name__icontains=wanted,
                )
            )
            if len(candidates) == 1:
                matched = candidates[0]
            else:
                names = ", ".join(
                    s.name
                    for s in State.objects.filter(
                        project=issue.project, deleted_at__isnull=True
                    ).order_by("sequence")
                )
                return (
                    f"tool_error: no state named '{wanted}'. Pick one of: {names}"
                )

        previous = issue.state.name if issue.state else "(no state)"
        previous_state_id = str(issue.state_id) if issue.state_id else None
        if issue.state_id == matched.id:
            return f"ok: state already '{matched.name}', nothing to change"

        # Save the state change as the bot user; Issue.save() picks up
        # the state-id change via ChangeTrackerMixin and syncs
        # completed_at automatically when transitioning to/from the
        # completed group.
        issue.state = matched
        issue.save(created_by_id=agent.bot_user_id, update_fields=["state", "completed_at", "updated_at"])

        # Fire the standard activity entry so the agent's state change
        # shows up in the issue timeline alongside human edits ("Robot-
        # cowork moved this to Done"). Without this, the only visible
        # trace is the agent's reply comment — the state transition
        # itself is silent in the activity feed.
        _emit_state_activity(
            issue=issue,
            agent=agent,
            previous_state_id=previous_state_id,
            new_state_id=str(matched.id),
        )

        return f"ok: changed state from '{previous}' to '{matched.name}'"

    return LLMTool(
        name="change_state",
        description=(
            "Move the current task to a different workflow state (e.g. 'In Progress', "
            "'Done', 'Backlog'). Use this when you've decided the task should advance "
            "or move back. Only states already defined in the project are valid — the "
            "list is provided in the prompt. Call this at most once per turn."
        ),
        parameters_schema={
            "type": "object",
            "properties": {
                "state_name": {
                    "type": "string",
                    "description": (
                        "Exact name of the target state, matching one of the entries "
                        "in 'Available states' in the prompt (case-insensitive)."
                    ),
                },
            },
            "required": ["state_name"],
        },
        handler=handler,
    )


def _load_mcp_tools_for(agent: Agent) -> list:
    """Connect to each enabled MCP server on the agent and return wrapped LLMTools.

    Failures degrade gracefully: a broken or unreachable MCP server
    logs a warning and contributes zero tools, but the rest of the
    run proceeds with whatever built-in + other-MCP tools are
    available. We don't want one flaky server to kill every dispatch.
    """
    from plane.license.utils.encryption import decrypt_data

    servers = agent.mcp_servers or []
    if not servers:
        return []

    out: list = []
    for cfg in servers:
        if not isinstance(cfg, dict):
            continue
        if cfg.get("enabled") is False:
            continue
        try:
            wrapped = wrap_mcp_server_as_tools(cfg, decrypt_auth=decrypt_data)
            out.extend(wrapped)
            logger.info(
                "agent_dispatch: loaded %d tool(s) from MCP server %r",
                len(wrapped),
                cfg.get("name"),
            )
        except MCPClientError as exc:
            logger.warning(
                "agent_dispatch: skipping MCP server %r: %s",
                cfg.get("name"),
                exc,
            )
        except Exception:  # noqa: BLE001 — never let a flaky server kill the dispatch
            logger.exception("agent_dispatch: unexpected error loading MCP server %r", cfg.get("name"))
    return out


def _make_add_label_tool(*, agent: Agent, issue: Issue, run: AgentRun) -> LLMTool:
    """Attach a label to the current task.

    Labels are workspace-wide objects scoped to a project for application.
    Only labels already defined in the project are valid — the prompt
    lists them. No label creation from the tool (we don't want a chatty
    agent inventing a "Maybe" label).

    Idempotent: re-attaching a label that's already on the issue
    returns an "ok: already labelled" string rather than erroring.
    """

    def handler(args: Dict[str, Any]) -> str:
        wanted = (args.get("label_name") or args.get("name") or "").strip()
        if not wanted:
            return "tool_error: pass `label_name` with the exact label name"

        if _is_cancelled(run.id):
            return "tool_error: this run was cancelled by an admin; do not retry"

        label = (
            Label.objects.filter(
                project=issue.project,
                deleted_at__isnull=True,
                name__iexact=wanted,
            ).first()
        )
        if label is None:
            available = ", ".join(
                Label.objects.filter(project=issue.project, deleted_at__isnull=True)
                .order_by("name")
                .values_list("name", flat=True)[:50]
            )
            available_msg = available if available else "no labels defined in this project"
            return f"tool_error: no label named '{wanted}'. Available: {available_msg}"

        existing = IssueLabel.objects.filter(
            issue=issue, label=label, deleted_at__isnull=True
        ).exists()
        if existing:
            return f"ok: task already has label '{label.name}'"

        IssueLabel.objects.create(
            workspace=issue.workspace,
            project=issue.project,
            issue=issue,
            label=label,
        )
        return f"ok: added label '{label.name}'"

    return LLMTool(
        name="add_label",
        description=(
            "Attach a label from the project's label palette to this task. Use this for "
            "triage — e.g. labelling a task as 'bug', 'duplicate', 'needs-info'. Only "
            "labels listed in the prompt are valid; you cannot create new labels."
        ),
        parameters_schema={
            "type": "object",
            "properties": {
                "label_name": {
                    "type": "string",
                    "description": (
                        "Exact name of the label, matching one of the entries in "
                        "'Available labels' (case-insensitive)."
                    ),
                },
            },
            "required": ["label_name"],
        },
        handler=handler,
    )


def _make_search_issues_tool(*, agent: Agent, issue: Issue, run: AgentRun) -> LLMTool:
    """Search issues in the same workspace/project to gather context quickly."""

    def handler(args: Dict[str, Any]) -> str:
        query = (args.get("query") or "").strip()
        limit_raw = args.get("limit", 5)
        try:
            limit = max(1, min(int(limit_raw), 20))
        except Exception:  # noqa: BLE001
            limit = 5

        if not query:
            return "tool_error: pass a non-empty `query`"
        if _is_cancelled(run.id):
            return "tool_error: this run was cancelled by an admin; do not retry"

        rows = (
            Issue.issue_objects.filter(workspace=issue.workspace, project=issue.project)
            .filter(Q(name__icontains=query) | Q(description_stripped__icontains=query))
            .select_related("state")
            .order_by("-updated_at")[:limit]
        )
        payload = [
            {
                "id": str(row.id),
                "name": row.name,
                "state": row.state.name if row.state else "",
                "priority": row.priority,
                "sequence_id": row.sequence_id,
            }
            for row in rows
        ]
        return json.dumps(payload, cls=DjangoJSONEncoder)

    return LLMTool(
        name="search_issues",
        description=(
            "Search tasks in this workspace project by free text query. Use this to find related work "
            "before replying or proposing state/label updates."
        ),
        parameters_schema={
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 20},
            },
            "required": ["query"],
        },
        handler=handler,
    )


def _make_list_attachments_tool(*, agent: Agent, issue: Issue, run: AgentRun) -> LLMTool:
    """List issue attachments so the agent can reference files explicitly."""

    def handler(args: Dict[str, Any]) -> str:
        limit_raw = args.get("limit", 20)
        try:
            limit = max(1, min(int(limit_raw), 50))
        except Exception:  # noqa: BLE001
            limit = 20

        if _is_cancelled(run.id):
            return "tool_error: this run was cancelled by an admin; do not retry"

        rows = (
            IssueAttachment.objects.filter(issue=issue, deleted_at__isnull=True)
            .order_by("-created_at")
            .values("id", "asset", "external_source", "created_at")[:limit]
        )
        payload = [
            {
                "id": str(row["id"]),
                "asset": str(row["asset"]),
                "external_source": row["external_source"],
                "created_at": row["created_at"],
            }
            for row in rows
        ]
        return json.dumps(payload, cls=DjangoJSONEncoder)

    return LLMTool(
        name="list_attachments",
        description="List file attachments on the current task.",
        parameters_schema={
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "minimum": 1, "maximum": 50},
            },
        },
        handler=handler,
    )


def _make_plan_next_steps_tool(*, agent: Agent, issue: Issue, run: AgentRun) -> LLMTool:
    """Generate a deterministic planning scaffold for multi-step execution."""

    def handler(args: Dict[str, Any]) -> str:
        if _is_cancelled(run.id):
            return "tool_error: this run was cancelled by an admin; do not retry"

        objective = (args.get("objective") or issue.name or "").strip()
        constraints = (args.get("constraints") or "").strip()
        checklist = [
            f"Clarify objective: {objective}",
            "Gather dependencies, blockers, and required approvals",
            "Break into 3-5 incremental steps with clear outputs",
            "Define validation criteria and rollback/safety checks",
            "Post status update with next action and owner",
        ]
        if constraints:
            checklist.insert(1, f"Respect constraints: {constraints}")
        return json.dumps({"objective": objective, "checklist": checklist}, cls=DjangoJSONEncoder)

    return LLMTool(
        name="plan_next_steps",
        description="Return a structured multi-step execution checklist for the current task.",
        parameters_schema={
            "type": "object",
            "properties": {
                "objective": {"type": "string"},
                "constraints": {"type": "string"},
            },
        },
        handler=handler,
    )


def _make_record_step_tool(*, run: AgentRun) -> LLMTool:
    """Record a structured plan/act/verify/report step."""

    def handler(args: Dict[str, Any]) -> str:
        phase = (args.get("phase") or "").strip().lower()
        result_text = (args.get("result") or "").strip()
        evidence = (args.get("evidence") or "").strip()
        next_action = (args.get("next_action") or "").strip()

        if _is_cancelled(run.id):
            return "tool_error: this run was cancelled by an admin; do not retry"
        if phase not in {"plan", "act", "verify", "report"}:
            return "tool_error: `phase` must be one of plan|act|verify|report"
        if not result_text:
            return "tool_error: `result` is required"
        if not evidence:
            return "tool_error: `evidence` is required"
        if not next_action:
            return "tool_error: `next_action` is required"

        return json.dumps(
            {
                "ok": True,
                "phase": phase,
                "result": result_text[:1200],
                "evidence": evidence[:1200],
                "next_action": next_action[:1200],
            },
            cls=DjangoJSONEncoder,
        )

    return LLMTool(
        name="record_step",
        description=(
            "Record execution progress as structured steps so runs are resumable and auditable. "
            "Use in order: plan -> act -> verify -> report."
        ),
        parameters_schema={
            "type": "object",
            "properties": {
                "phase": {
                    "type": "string",
                    "enum": ["plan", "act", "verify", "report"],
                },
                "result": {"type": "string"},
                "evidence": {"type": "string"},
                "next_action": {"type": "string"},
            },
            "required": ["phase", "result", "evidence", "next_action"],
        },
        handler=handler,
    )


def _make_remember_memory_tool(*, agent: Agent, run: AgentRun) -> LLMTool:
    """Persist durable memory for future runs."""

    def handler(args: Dict[str, Any]) -> str:
        key = (args.get("key") or "").strip()
        value = (args.get("value") or "").strip()
        source = (args.get("source") or "agent").strip()
        tags = args.get("tags") or []
        if _is_cancelled(run.id):
            return "tool_error: this run was cancelled by an admin; do not retry"
        if not key:
            return "tool_error: `key` is required"
        if not value:
            return "tool_error: `value` is required"
        if not isinstance(tags, list):
            return "tool_error: `tags` must be a list"

        memory, created = AgentMemory.objects.update_or_create(
            workspace=agent.workspace,
            agent=agent,
            key=key[:160],
            defaults={
                "value": value,
                "source": source[:64],
                "tags": [str(t).strip()[:60] for t in tags if str(t).strip()],
            },
        )
        return json.dumps(
            {
                "ok": True,
                "id": str(memory.id),
                "created": created,
                "key": memory.key,
            },
            cls=DjangoJSONEncoder,
        )

    return LLMTool(
        name="remember_memory",
        description="Store a durable memory fact for this agent in this workspace.",
        parameters_schema={
            "type": "object",
            "properties": {
                "key": {"type": "string"},
                "value": {"type": "string"},
                "source": {"type": "string"},
                "tags": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["key", "value"],
        },
        handler=handler,
    )


def _make_search_memory_tool(*, agent: Agent, run: AgentRun) -> LLMTool:
    """Retrieve memory entries from workspace + agent scope."""

    def handler(args: Dict[str, Any]) -> str:
        query = (args.get("query") or "").strip()
        limit_raw = args.get("limit", 6)
        try:
            limit = max(1, min(int(limit_raw), 20))
        except Exception:  # noqa: BLE001
            limit = 6
        if _is_cancelled(run.id):
            return "tool_error: this run was cancelled by an admin; do not retry"
        if not query:
            return "tool_error: `query` is required"

        rows = (
            AgentMemory.objects.filter(workspace=agent.workspace, deleted_at__isnull=True)
            .filter(Q(agent__isnull=True) | Q(agent=agent))
            .filter(Q(key__icontains=query) | Q(value__icontains=query))
            .order_by("-last_accessed_at", "-updated_at")[:limit]
        )
        now = datetime.now(timezone.utc)
        payload = []
        for row in rows:
            payload.append(
                {
                    "id": str(row.id),
                    "key": row.key,
                    "value": row.value,
                    "tags": row.tags or [],
                    "source": row.source or "",
                }
            )
            row.use_count = int(row.use_count or 0) + 1
            row.last_accessed_at = now
            row.save(update_fields=["use_count", "last_accessed_at", "updated_at"])

        return json.dumps(payload, cls=DjangoJSONEncoder)

    return LLMTool(
        name="search_memory",
        description="Search stored workspace/agent memory by free-text query.",
        parameters_schema={
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 20},
            },
            "required": ["query"],
        },
        handler=handler,
    )


def _emit_state_activity(*, issue: Issue, agent: Agent, previous_state_id, new_state_id: str) -> None:
    """Fire the standard issue_activity Celery task for an agent state change.

    Mirrors the call signature used by the issue partial_update view so
    the entry renders identically to a human-initiated state change —
    the only difference is `actor_id` is the bot user's ID, which the
    UI already knows how to render with the bot indicator.
    """
    try:
        from plane.bgtasks.issue_activities_task import issue_activity

        requested_data = json.dumps({"state_id": new_state_id}, cls=DjangoJSONEncoder)
        current_instance = json.dumps(
            {"state_id": previous_state_id},
            cls=DjangoJSONEncoder,
        )
        issue_activity.delay(
            type="issue.activity.updated",
            requested_data=requested_data,
            current_instance=current_instance,
            issue_id=str(issue.id),
            actor_id=str(agent.bot_user_id),
            project_id=str(issue.project_id),
            epoch=int(dj_timezone.now().timestamp()),
            notification=False,  # agent-initiated; don't ping subscribers twice
        )
    except Exception:  # noqa: BLE001
        logger.exception(
            "agent state-change activity enqueue failed for issue=%s",
            issue.id,
        )


def _post_comment_as_bot(*, agent: Agent, issue: Issue, html: str) -> IssueComment:
    """Persist an IssueComment authored by the agent's bot user.

    When `agent.draft_mode` is True the comment is created with
    `is_draft=True`. Drafts are filtered out of the issue's normal
    activity feed and surface only in the agent's runs panel until an
    admin approves them.

    Bypasses crum's auto-attribution by passing `created_by_id` to
    BaseModel.save() — Celery has no current-user context.
    """
    with transaction.atomic():
        comment = IssueComment(
            workspace=agent.workspace,
            project=issue.project,
            issue=issue,
            actor=agent.bot_user,
            comment_html=html,
            comment_json={},
            is_draft=bool(agent.draft_mode),
        )
        comment.save(created_by_id=agent.bot_user_id)
    return comment


def _wrap_in_paragraph(text: str) -> str:
    """Wrap plain text in a <p> so it renders correctly in the rich-text
    activity feed.
    """
    # Crude HTML-escape — the editor sanitises on render too, but no
    # reason to ship `<script>` through.
    escaped = (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
    return f"<p>{escaped}</p>"


def _run_posted_comment(result: LLMRunResult) -> bool:
    """True if the model already used the `post_comment` tool at least once."""
    return any(
        tc.get("name") in {"post_comment", "post_page_comment"} and "ok:" in (tc.get("result") or "")
        for tc in result.tool_calls
    )


def _is_cancelled(run_id) -> bool:
    """Re-read the row to pick up any out-of-band `cancel_requested` flip.

    Reading from the DB on every turn is a few ms — negligible compared
    to model latency. Worth the simplicity.
    """
    return AgentRun.objects.filter(pk=run_id, cancel_requested=True).exists()


def _mark_failed(run: AgentRun, message: str) -> None:
    run.status = "failed"
    run.error = message[:2000]
    run.completed_at = datetime.now(timezone.utc)
    run.save(update_fields=["status", "error", "completed_at", "updated_at"])


def _persist_tool_call_progress(run: AgentRun, tool_call: Dict[str, Any]) -> None:
    """Persist each tool call as it happens for resumable in-flight runs."""
    current = list(run.tool_calls or [])
    current.append(tool_call)
    run.tool_calls = current
    run.iterations = max(int(run.iterations or 0), int(tool_call.get("iteration") or 0))
    run.save(update_fields=["tool_calls", "iterations", "updated_at"])


# =====================================================================
# Page block comment path — analog of the issue dispatcher
# =====================================================================
#
# When an agent is @-mentioned in a PageBlockComment, this task runs.
# The "target" is the comment, not an issue, so the prompt is built
# from the page + the thread the comment lives in, and the reply tool
# posts a child PageBlockComment via the standard parent FK.
#
# AgentRun.issue stays null for these runs; AgentRun.tool_calls still
# captures what happened. The runs panel renders both kinds the same
# way (target-agnostic), with the trigger_event ("mentioned") and
# tool_calls log being enough context for now. A future "target" field
# on AgentRun would let the panel link directly to the page comment.


@shared_task(name="plane.bgtasks.agent_dispatch_task.dispatch_agent_for_page_comment")
def dispatch_agent_for_page_comment(agent_id: str, page_comment_id: str, trigger_event: str) -> None:
    """Run a single agent dispatch for a page block comment mention."""
    try:
        agent = Agent.objects.select_related("workspace", "bot_user").get(
            pk=agent_id, deleted_at__isnull=True
        )
    except Agent.DoesNotExist:
        logger.warning("agent_dispatch (page): agent %s not found", agent_id)
        return

    if not agent.is_enabled:
        return

    page_comment = (
        PageBlockComment.objects.select_related("page", "page__workspace", "parent")
        .filter(pk=page_comment_id, deleted_at__isnull=True)
        .first()
    )
    if page_comment is None:
        logger.warning("agent_dispatch (page): comment %s not found", page_comment_id)
        return

    run = AgentRun.objects.create(
        agent=agent,
        issue=None,
        trigger_event=trigger_event,
        status="running",
        dispatched_at=datetime.now(timezone.utc),
        tool_calls=[{"kind": "lifecycle", "phase": "run_started", "trigger_event": trigger_event}],
    )

    try:
        provider = LLMProvider.from_agent(agent)
    except LLMConfigError as exc:
        _mark_failed(run, f"not configured: {exc}")
        return

    page = page_comment.page
    memory_context = _build_memory_context_for_workspace(agent=agent, workspace=page.workspace)
    user_prompt = _build_page_comment_user_prompt(
        page_comment=page_comment,
        trigger_event=trigger_event,
        memory_context=memory_context,
    )
    system_prompt = (agent.system_prompt or "").strip() or _DEFAULT_PAGE_COMMENT_SYSTEM_PROMPT
    base_tools = [
        _make_post_page_comment_tool(agent=agent, page_comment=page_comment, run=run),
        _make_record_step_tool(run=run),
        _make_remember_memory_tool(agent=agent, run=run),
        _make_search_memory_tool(agent=agent, run=run),
    ]
    tools = _apply_tool_policies(agent=agent, tools=base_tools)

    try:
        result = provider.run(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            tools=tools,
            max_iterations=_MAX_ITERATIONS_PER_RUN,
            is_cancelled=lambda: _is_cancelled(run.id),
            on_tool_call=lambda call: _persist_tool_call_progress(run, call),
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("agent_dispatch (page): provider.run failed for agent=%s comment=%s", agent_id, page_comment_id)
        _mark_failed(run, f"{exc.__class__.__name__}: {exc}")
        return

    _finalise_run(run, result)

    if result.final_text and not _run_posted_comment(result):
        _post_page_comment_as_bot(
            agent=agent,
            parent=page_comment,
            page=page,
            html=_wrap_in_paragraph(result.final_text),
        )


_DEFAULT_PAGE_COMMENT_SYSTEM_PROMPT = (
    "You are a Dragon Fruit agent — a workspace teammate that participates in docs like a "
    "real member. Someone @-mentioned you in a comment on a page. Read the thread and the "
    "page excerpt, then reply with a single concise comment in the same thread. Ask "
    "clarifying questions if the request is ambiguous. To reply, call the "
    "`post_page_comment` tool. Do not produce other output.\n\n"
    "Execution protocol (mandatory): use `record_step` for plan, act, verify, and report; "
    "each entry must include result, evidence, and next_action."
)


def _build_page_comment_user_prompt(*, page_comment: PageBlockComment, trigger_event: str, memory_context: str = "") -> str:
    page = page_comment.page
    framing = (
        "Someone @-mentioned you in a page comment thread. The most recent comment in the "
        "thread is the message you should respond to."
    )

    # Thread context: pull all comments in the same block_id, oldest
    # first. Cap to 10 to keep the prompt cheap.
    thread = list(
        PageBlockComment.objects.filter(
            page=page, block_id=page_comment.block_id, deleted_at__isnull=True
        )
        .order_by("created_at")
        .select_related("created_by")[:10]
    )

    parts = [
        framing,
        "",
        f"Page: {page.name}",
        f"Workspace: {page.workspace.name if page.workspace else '(no workspace)'}",
        "",
        "Page excerpt (first 800 chars):",
        (page.description_stripped or "(empty)")[:800],
        "",
        f"Thread ({len(thread)} comment{'s' if len(thread) != 1 else ''}, newest last):",
    ]
    for c in thread:
        who = (
            (c.created_by.display_name or c.created_by.email)
            if c.created_by
            else "someone"
        )
        body = (c.content or "").strip()
        # Crude HTML strip for the prompt — keeps it readable without a parser.
        import re as _re
        body_plain = _re.sub(r"<[^>]+>", " ", body).strip()
        parts.append(f"- {who}: {body_plain[:500]}")
    if memory_context:
        parts.append("")
        parts.append("Workspace memory (use this as durable context when relevant):")
        parts.append(memory_context)

    return "\n".join(parts)


def _make_post_page_comment_tool(
    *, agent: Agent, page_comment: PageBlockComment, run: AgentRun
) -> LLMTool:
    """Reply tool for page-comment-triggered runs.

    Posts a new PageBlockComment as a child of the mentioning comment.
    Inherits the parent's block_id so the reply lands in the same
    thread. Respects agent.draft_mode (sets is_draft on the row).
    """

    def handler(args: Dict[str, Any]) -> str:
        body = (args.get("comment_html") or args.get("body") or "").strip()
        if not body:
            return "tool_error: comment body was empty; pass `comment_html`"

        if _is_cancelled(run.id):
            return "tool_error: this run was cancelled by an admin; do not retry"

        html = body if body.lstrip().startswith("<") else _wrap_in_paragraph(body)

        new_comment = _post_page_comment_as_bot(
            agent=agent,
            parent=page_comment,
            page=page_comment.page,
            html=html,
        )
        if new_comment.is_draft:
            return f"ok: page comment posted as draft (id={new_comment.id}); awaiting admin approval"
        return f"ok: page comment posted (id={new_comment.id})"

    return LLMTool(
        name="post_page_comment",
        description=(
            "Reply to the page comment thread you were mentioned in. The reply will appear "
            "as a child of the mentioning comment. Use this once per turn and then stop."
        ),
        parameters_schema={
            "type": "object",
            "properties": {
                "comment_html": {
                    "type": "string",
                    "description": (
                        "The reply body. May be HTML or plain text. Plain text is wrapped "
                        "in a paragraph automatically. Keep it under 2000 characters."
                    ),
                },
            },
            "required": ["comment_html"],
        },
        handler=handler,
    )


def _post_page_comment_as_bot(
    *,
    agent: Agent,
    parent: PageBlockComment,
    page: Page,
    html: str,
) -> PageBlockComment:
    """Create a child PageBlockComment under `parent` authored by the bot."""
    with transaction.atomic():
        comment = PageBlockComment(
            workspace=page.workspace,
            page=page,
            block_id=parent.block_id,  # inherit thread anchor
            parent=parent,
            content=html,
            is_draft=bool(agent.draft_mode),
        )
        comment.save(created_by_id=agent.bot_user_id)
    return comment


def _finalise_run(run: AgentRun, result: LLMRunResult) -> None:
    """Save the LLM run outcome + telemetry onto the AgentRun row."""
    if result.cancelled:
        run.status = "cancelled"
    elif result.stopped_reason == "max_iterations":
        run.status = "failed"
        run.error = f"hit iteration cap ({result.iterations})"
    elif result.stopped_reason == "error":
        run.status = "failed"
        # The error message was already set by _mark_failed if we got here
        # via that path; only set a fallback if it wasn't.
        if not run.error:
            run.error = "provider error"
    else:
        run.status = "completed"

    run.completed_at = datetime.now(timezone.utc)
    run.iterations = result.iterations
    run.prompt_tokens = result.prompt_tokens
    run.completion_tokens = result.completion_tokens
    run.total_tokens = result.total_tokens
    existing_calls = list(run.tool_calls or [])
    lifecycle_entries = [entry for entry in existing_calls if isinstance(entry, dict) and entry.get("kind") == "lifecycle"]
    run.tool_calls = lifecycle_entries + result.tool_calls
    # Compute dollar cost from the per-model pricing table. Unknown
    # models fall back to 0 — better than showing a guessed number.
    run.cost_usd = estimate_cost_usd(
        run.agent.provider_model,
        result.prompt_tokens,
        result.completion_tokens,
    )
    run.save(
        update_fields=[
            "status",
            "error",
            "completed_at",
            "iterations",
            "prompt_tokens",
            "completion_tokens",
            "total_tokens",
            "tool_calls",
            "cost_usd",
            "updated_at",
        ]
    )
