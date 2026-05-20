# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Agent event dispatcher.

Slice 1: when an `Agent`'s bot user is added as an assignee on an issue,
post a single hardcoded "I'm on it" comment as that bot. No LLM call, no
tool loop — this exists to prove the plumbing: signal → Celery → comment
appears in the activity feed under the bot's name.

Slice 2 will replace the hardcoded body with a LiteLLM-driven loop that
reads the task, decides what to do, and calls back through the existing
Issues / Comments API as the same bot user. The shape of this task (one
AgentRun row per dispatch, status transitions, no view-layer changes
elsewhere) is the contract we'll build on.
"""

import logging
from datetime import datetime, timezone

from celery import shared_task
from django.db import transaction

from plane.db.models import Agent, AgentRun, Issue, IssueComment


logger = logging.getLogger(__name__)


# Slice 1 placeholder reply. Slice 2 replaces this with the LLM output.
_HELLO_COMMENT_HTML = (
    "<p>I've been assigned this task. "
    "I'm a Dragon Fruit agent — once my LLM key is configured I'll start "
    "reading the task and replying with real work.</p>"
)


@shared_task(name="plane.bgtasks.agent_dispatch_task.dispatch_agent_event")
def dispatch_agent_event(agent_id: str, issue_id: str, trigger_event: str) -> None:
    """Run a single agent dispatch for an issue.

    Idempotency: we don't dedupe inside this task; the upstream signal
    fires on `created=True` only and `IssueAssignee` has a partial-unique
    constraint, so duplicate dispatches for the same assignment are not
    expected. If we hit a real problem we'll add a (agent, issue, event,
    created_within_5s) guard.
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
        issue = Issue.objects.select_related("project", "workspace").get(pk=issue_id)
    except Issue.DoesNotExist:
        logger.warning("agent_dispatch: issue %s not found, skipping", issue_id)
        return

    now = datetime.now(timezone.utc)
    with transaction.atomic():
        run = AgentRun.objects.create(
            agent=agent,
            issue=issue,
            trigger_event=trigger_event,
            status="running",
            dispatched_at=now,
        )

        try:
            comment = IssueComment(
                workspace=agent.workspace,
                project=issue.project,
                issue=issue,
                actor=agent.bot_user,
                comment_html=_HELLO_COMMENT_HTML,
                comment_json={},
            )
            # Bypass crum-based auto-attribution — Celery has no request user.
            comment.save(created_by_id=agent.bot_user_id)

            run.status = "completed"
            run.completed_at = datetime.now(timezone.utc)
            run.save(update_fields=["status", "completed_at", "updated_at"])
        except Exception as exc:  # noqa: BLE001 — we want to capture any failure
            logger.exception("agent_dispatch: failed for agent=%s issue=%s", agent_id, issue_id)
            run.status = "failed"
            run.error = f"{exc.__class__.__name__}: {exc}"[:2000]
            run.completed_at = datetime.now(timezone.utc)
            run.save(update_fields=["status", "error", "completed_at", "updated_at"])
            raise
