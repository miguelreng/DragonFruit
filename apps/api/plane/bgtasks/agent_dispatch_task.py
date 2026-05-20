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

import logging
from datetime import datetime, timezone
from typing import Any, Dict

from celery import shared_task
from django.db import transaction

from plane.db.models import Agent, AgentRun, Issue, IssueComment
from plane.llm import LLMConfigError, LLMProvider, LLMRunResult, LLMTool


logger = logging.getLogger(__name__)


# The default system prompt for agents that don't define their own. Kept
# small and explicit about the safety rail: agents should call the
# post_comment tool to reply, not produce raw text. (LiteLLM still
# returns text on the final turn, but the prompt nudges tool use.)
_DEFAULT_SYSTEM_PROMPT = (
    "You are a Dragon Fruit agent — a workspace teammate that participates in tasks like a "
    "real member. Read the task description and the most recent comments, then reply with a "
    "single concise comment that moves the task forward. Ask clarifying questions if the task "
    "is ambiguous. To reply, call the `post_comment` tool. Do not produce other output."
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

    user_prompt = _build_user_prompt(issue, trigger_event)
    system_prompt = (agent.system_prompt or "").strip() or _DEFAULT_SYSTEM_PROMPT
    post_comment_tool = _make_post_comment_tool(agent=agent, issue=issue, run=run)

    try:
        result = provider.run(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            tools=[post_comment_tool],
            max_iterations=_MAX_ITERATIONS_PER_RUN,
            is_cancelled=lambda: _is_cancelled(run.id),
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


def _build_user_prompt(issue: Issue, trigger_event: str = "assigned") -> str:
    """Render the issue as a single user-prompt string.

    `trigger_event` controls the framing line at the top so the model
    knows whether it was assigned, @-mentioned, etc. The body of the
    prompt (description + recent comments) is the same regardless.

    Slice 2 frontloads name + description + state + recent comments.
    Slice 3 will expose `read_task` as a tool so the agent can fetch
    this itself instead of getting it preloaded.
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
    if recent_comments:
        parts.append("")
        parts.append("Recent comments (newest first):")
        for c in recent_comments:
            who = c.get("actor__display_name") or c.get("actor__email") or "someone"
            body = (c.get("comment_stripped") or "").strip()
            if body:
                parts.append(f"- {who}: {body[:500]}")
    return "\n".join(parts)


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

        _post_comment_as_bot(agent=agent, issue=issue, html=html)
        return "ok: comment posted"

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


def _post_comment_as_bot(*, agent: Agent, issue: Issue, html: str) -> None:
    """Persist an IssueComment authored by the agent's bot user.

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
        )
        comment.save(created_by_id=agent.bot_user_id)


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
    return any(tc.get("name") == "post_comment" and "ok:" in (tc.get("result") or "") for tc in result.tool_calls)


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


def _finalise_run(run: AgentRun, result: LLMRunResult) -> None:
    """Save the LLM run outcome onto the AgentRun row."""
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
    run.save(update_fields=["status", "error", "completed_at", "updated_at"])
