# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Per-workspace AI agents.

Each Agent is backed by a real `User(is_bot=True)` row, so agents appear in the
existing assignee dropdowns, @mention pickers, comment activity feeds, and
notification settings with zero new UI elsewhere. The `bot_user` field is the
identity the agent acts as when posting comments or changing state.

BYOK: the LLM provider/key/base_url fields are persisted Fernet-encrypted via
`plane.license.utils.encryption`. The platform itself never holds an LLM
credential — see `~/.claude/projects/.../memory/feedback_ai_byok.md`.

Slice 1 (this commit) wires the model end-to-end with a static comment
dispatcher; the LLM-call fields are present but unused. Slice 2 plugs in the
LiteLLM-based runner and starts reading them.
"""

import logging
import uuid

from django.conf import settings
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver

from .base import BaseModel


logger = logging.getLogger(__name__)


def _default_triggers() -> dict:
    """Default event triggers for a new agent.

    Conservative defaults: react to direct assignment only. @mention and
    state-change require opt-in from the owner so chatty workspaces don't
    accidentally rack up calls.
    """
    return {
        "assigned": True,
        "mentioned": False,
        "state_change": False,
        "comment": False,
    }


class Agent(BaseModel):
    """An AI agent that participates in tasks as a bot workspace member."""

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="agents",
    )
    # The bot User this agent acts as. Auto-created on agent creation; not
    # nullable because every agent needs an identity to post comments under.
    bot_user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="agent_profile",
    )

    name = models.CharField(max_length=128)
    description = models.TextField(blank=True, default="")
    avatar_url = models.URLField(max_length=2048, blank=True, default="")

    # System prompt the agent runs with. Slice 1 ignores it.
    system_prompt = models.TextField(blank=True, default="")

    # BYOK provider config. All persisted encrypted (or empty until Slice 2).
    # The model string follows LiteLLM's "<provider>/<model>" convention so
    # we get vendor-agnostic routing for free. See feedback_ai_byok.md.
    provider_model = models.CharField(max_length=128, blank=True, default="")
    # Fernet-encrypted via plane.license.utils.encryption.encrypt_data.
    # Plaintext keys never hit the DB.
    api_key_encrypted = models.TextField(blank=True, default="")
    # Optional override for self-hosted / proxied endpoints (Ollama, vLLM,
    # OpenRouter, OpenAI-compatible proxies).
    api_base_url = models.URLField(max_length=2048, blank=True, default="")

    # Event triggers the agent reacts to.
    triggers = models.JSONField(default=_default_triggers)

    # Safety rails.
    is_enabled = models.BooleanField(default=True)
    # Per-agent concurrency cap. Slice 1 doesn't enforce it (no LLM calls
    # in flight), but the column is here so Slice 2 can read it.
    max_concurrent_runs = models.PositiveSmallIntegerField(default=3)
    # If true, the agent's comments are posted as drafts requiring human
    # approval before they go live. Slice 3 wires the UI; column is here
    # so the migration is one-shot.
    draft_mode = models.BooleanField(default=False)

    class Meta:
        db_table = "agents"
        verbose_name = "Agent"
        verbose_name_plural = "Agents"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "bot_user"],
                condition=models.Q(deleted_at__isnull=True),
                name="agent_unique_workspace_bot_user_when_deleted_at_null",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.name} <{self.workspace.slug}>"


class AgentRun(BaseModel):
    """A single dispatch of an agent in response to an event.

    One row per (agent, event) pair. In Slice 1 a run is completed
    synchronously inside the Celery task that posts the static comment.
    From Slice 2 onward, status transitions over time as the LLM loop
    executes; the row is also the unit you cancel from the UI.
    """

    STATUS_CHOICES = (
        ("pending", "Pending"),
        ("running", "Running"),
        ("completed", "Completed"),
        ("failed", "Failed"),
        ("cancelled", "Cancelled"),
    )

    TRIGGER_CHOICES = (
        ("assigned", "Assigned"),
        ("mentioned", "Mentioned"),
        ("state_change", "State change"),
        ("comment", "Comment"),
        ("manual", "Manual"),
    )

    agent = models.ForeignKey(Agent, on_delete=models.CASCADE, related_name="runs")
    # The issue this run is acting on. Nullable so future doc-based or
    # workspace-level triggers can reuse the run ledger.
    issue = models.ForeignKey(
        "db.Issue",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="agent_runs",
    )
    trigger_event = models.CharField(max_length=32, choices=TRIGGER_CHOICES)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="pending")
    error = models.TextField(blank=True, default="")
    dispatched_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    # Cancellation flag the loop runner checks between tool calls. Slice 2+.
    cancel_requested = models.BooleanField(default=False)
    # Run telemetry — populated by the dispatcher when the LLM loop
    # finishes. Surfaced in the runs panel so admins can see what each
    # invocation cost and which tools the agent used.
    prompt_tokens = models.PositiveIntegerField(default=0)
    completion_tokens = models.PositiveIntegerField(default=0)
    total_tokens = models.PositiveIntegerField(default=0)
    iterations = models.PositiveIntegerField(default=0)
    # tool_calls is a list of {name, arguments, result} dicts in invocation
    # order. JSONField rather than a related table because we never query
    # it across rows — only read it back per-run for the panel.
    tool_calls = models.JSONField(default=list, blank=True)
    # Dollar cost computed at finalise time using the per-model pricing
    # table in plane.llm.pricing. 6-decimal precision because Gemini Flash
    # and similar low-cost models routinely produce sub-cent run costs.
    cost_usd = models.DecimalField(max_digits=10, decimal_places=6, default=0)

    class Meta:
        db_table = "agent_runs"
        verbose_name = "Agent Run"
        verbose_name_plural = "Agent Runs"
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["agent", "status"]),
            models.Index(fields=["issue", "agent"]),
        ]

    def __str__(self) -> str:
        return f"{self.agent.name} :: {self.trigger_event} :: {self.status}"


# ---------------------------------------------------------------------------
# Signal: dispatch an agent when its bot user is added as an issue assignee.
# ---------------------------------------------------------------------------
#
# We bind on `IssueAssignee.post_save` rather than patching every view that
# mutates assignees. This keeps the wiring decoupled from view code paths
# (issue partial_update, bulk operations, importers, the API client) — any
# code that creates a row triggers the dispatch.
#
# Kept lean: bail fast on the common case (assignee isn't a bot), look up the
# agent only when we have to, enqueue the Celery task and return. The actual
# work (comment posting, future LLM loop) happens in
# `plane.bgtasks.agent_dispatch_task`.


@receiver(post_save, sender="db.IssueAssignee")
def _dispatch_agent_on_assignee_added(sender, instance, created, **kwargs):
    if not created:
        return

    # Most assignees are humans; cheap exit path keeps this near-free.
    if not getattr(instance.assignee, "is_bot", False):
        return

    agent = (
        Agent.objects.select_related("bot_user")
        .filter(
            bot_user_id=instance.assignee_id,
            workspace_id=instance.workspace_id,
            is_enabled=True,
            deleted_at__isnull=True,
        )
        .first()
    )
    if not agent:
        return

    if not (agent.triggers or {}).get("assigned", True):
        return

    # Local import so model import order stays clean (bgtasks imports models).
    from plane.bgtasks.agent_dispatch_task import dispatch_agent_event

    try:
        dispatch_agent_event.delay(str(agent.id), str(instance.issue_id), "assigned")
    except Exception:  # noqa: BLE001 — never let a broker outage break assignment
        logger.exception(
            "agent dispatch enqueue failed for agent=%s issue=%s",
            agent.id,
            instance.issue_id,
        )


# ---------------------------------------------------------------------------
# Signal: dispatch an agent when its bot user is @-mentioned.
# ---------------------------------------------------------------------------
#
# Two surfaces produce mentions today:
#   1. **Issue description** — Plane persists each mention as an
#      `IssueMention` row via `update_mentions_for_issue()` in
#      notification_task. A `post_save` signal on that row catches every
#      description mention regardless of which view wrote it.
#   2. **Issue comments** — Plane does NOT persist comment mentions as
#      rows; they're extracted inline via `extract_comment_mentions()`
#      for subscriber notifications. To trigger an agent on a comment
#      mention we parse the comment HTML in a `post_save` on
#      `IssueComment`.
#
# Pages / docs aren't covered yet — they use a different prosemirror
# document model with its own mention nodes. Slice 3.
#
# Loop guard: when an agent posts a comment that itself @-mentions
# another agent, we'd cascade. The bot-user filter cuts most of it
# (agents don't typically @-mention other bots), but the explicit guard
# below also skips dispatches when the comment's actor is itself a bot.


@receiver(post_save, sender="db.IssueMention")
def _dispatch_agent_on_issue_mention(sender, instance, created, **kwargs):
    if not created:
        return

    mentioned_user = getattr(instance, "mention", None)
    if not getattr(mentioned_user, "is_bot", False):
        return

    agent = (
        Agent.objects.select_related("bot_user")
        .filter(
            bot_user_id=instance.mention_id,
            workspace_id=instance.workspace_id,
            is_enabled=True,
            deleted_at__isnull=True,
        )
        .first()
    )
    if not agent:
        return

    if not (agent.triggers or {}).get("mentioned", True):
        return

    from plane.bgtasks.agent_dispatch_task import dispatch_agent_event

    try:
        dispatch_agent_event.delay(str(agent.id), str(instance.issue_id), "mentioned")
    except Exception:  # noqa: BLE001
        logger.exception(
            "agent dispatch enqueue failed for agent=%s issue=%s (description mention)",
            agent.id,
            instance.issue_id,
        )


@receiver(post_save, sender="db.IssueComment")
def _dispatch_agent_on_comment_mention(sender, instance, created, **kwargs):
    if not created:
        return

    # Loop guard: skip when an agent's own bot user authored the comment.
    # Avoids an agent triggering another agent (or itself) via comment text.
    actor = getattr(instance, "actor", None)
    if actor is not None and getattr(actor, "is_bot", False):
        return

    # Reuse the existing comment-mention parser to avoid duplicating the
    # HTML/mention-component conventions. Import lazily — this module
    # loads at app startup and notification_task pulls in BS4 + the full
    # Issue model graph.
    try:
        from plane.bgtasks.notification_task import extract_comment_mentions
    except Exception:  # noqa: BLE001
        logger.exception("could not import extract_comment_mentions; skipping agent mention dispatch")
        return

    mention_ids = extract_comment_mentions(instance.comment_html or "")
    if not mention_ids:
        return

    # Find any agents in this workspace whose bot user matches one of the
    # mentioned IDs. A single comment can @ multiple agents; we dispatch
    # each. Inner-join via bot_user_id, scoped to the comment's workspace
    # so a mention can't reach an agent in a different workspace.
    matching_agents = list(
        Agent.objects.select_related("bot_user").filter(
            bot_user_id__in=mention_ids,
            workspace_id=instance.workspace_id,
            is_enabled=True,
            deleted_at__isnull=True,
        )
    )
    if not matching_agents:
        return

    from plane.bgtasks.agent_dispatch_task import dispatch_agent_event

    for agent in matching_agents:
        if not (agent.triggers or {}).get("mentioned", True):
            continue
        try:
            dispatch_agent_event.delay(str(agent.id), str(instance.issue_id), "mentioned")
        except Exception:  # noqa: BLE001
            logger.exception(
                "agent dispatch enqueue failed for agent=%s issue=%s (comment mention)",
                agent.id,
                instance.issue_id,
            )


@receiver(post_save, sender="db.PageBlockComment")
def _dispatch_agent_on_page_comment_mention(sender, instance, created, **kwargs):
    """Trigger agents @-mentioned in a page block comment.

    Mirror of the IssueComment signal: parse the comment's HTML for
    user_mention components, match them to bot users with Agents, and
    enqueue the page-comment dispatch task. The loop guard skips when
    the comment's `created_by` is itself a bot user.
    """
    if not created:
        return

    created_by = getattr(instance, "created_by", None)
    if created_by is not None and getattr(created_by, "is_bot", False):
        return

    try:
        from plane.bgtasks.notification_task import extract_comment_mentions
    except Exception:  # noqa: BLE001
        logger.exception("could not import extract_comment_mentions; skipping page-comment dispatch")
        return

    mention_ids = extract_comment_mentions(instance.content or "")
    if not mention_ids:
        return

    matching_agents = list(
        Agent.objects.select_related("bot_user").filter(
            bot_user_id__in=mention_ids,
            workspace_id=instance.workspace_id,
            is_enabled=True,
            deleted_at__isnull=True,
        )
    )
    if not matching_agents:
        return

    from plane.bgtasks.agent_dispatch_task import dispatch_agent_for_page_comment

    for agent in matching_agents:
        if not (agent.triggers or {}).get("mentioned", True):
            continue
        try:
            dispatch_agent_for_page_comment.delay(str(agent.id), str(instance.id), "mentioned")
        except Exception:  # noqa: BLE001
            logger.exception(
                "agent dispatch enqueue failed for agent=%s page_comment=%s",
                agent.id,
                instance.id,
            )
