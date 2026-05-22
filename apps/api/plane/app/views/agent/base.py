# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Agent CRUD endpoints.

Slice 1 scope: list, create, retrieve, update, delete agents in a workspace.
On create we auto-mint a `User(is_bot=True)` and a `WorkspaceMember` row so
the agent shows up in the existing assignee dropdown and @mention picker.

BYOK: writes accept a plaintext `api_key` but never echo it back — the
viewset Fernet-encrypts it and persists only the ciphertext. Reads expose
`has_api_key: bool`, never the value. See feedback_ai_byok.md.
"""

import uuid

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers.agent import AgentAutomationSerializer, AgentMemorySerializer, AgentRunSerializer, AgentSerializer
from plane.db.models import Agent, AgentAutomation, AgentMemory, AgentRun, Workspace, WorkspaceMember
from plane.license.utils.encryption import encrypt_data

from ..base import BaseAPIView


User = get_user_model()


# Bots are seated as Guest (the lowest workspace role) so they have the
# minimum privileges needed to read tasks and post comments. If you want
# state changes or settings access, the human owner has to opt in
# explicitly per-agent (not in Slice 1).
_BOT_WORKSPACE_ROLE = 5  # Guest
_TOOL_POLICY_VALUES = {"auto", "ask", "never"}
_AUTOMATION_CONDITION_KEYS = {"project_ids", "priorities", "label_ids", "issue_type_ids"}
_ISSUE_PRIORITY_VALUES = {"urgent", "high", "medium", "low", "none"}


def _normalise_mcp_servers(submitted: list, *, previous: list) -> list:
    """Encrypt plaintext auth headers, validate shape, dedupe by name.

    `submitted` is the raw payload from the client. Each entry must
    have a `name` (used as the tool prefix and the dedup key) and a
    `url` (the JSON-RPC endpoint). Optional fields:
      - `auth_header`:           plaintext token/header; encrypted here
      - `auth_header_encrypted`: pass-through ciphertext (used when the
                                 client is editing a non-auth field
                                 and doesn't want to re-send the token)
      - `enabled`:               default True

    The previous list is consulted to preserve the `auth_header_encrypted`
    of an existing entry whose new payload omits both auth fields —
    this lets the UI patch `enabled` or `url` without forcing the user
    to re-enter the token.
    """
    previous_by_name = {
        (entry.get("name") or "").strip(): entry
        for entry in (previous or [])
        if isinstance(entry, dict)
    }
    seen: set = set()
    normalised: list = []
    for raw in submitted:
        if not isinstance(raw, dict):
            continue
        name = (raw.get("name") or "").strip()
        url = (raw.get("url") or "").strip()
        if not name or not url:
            continue
        if name in seen:
            continue
        seen.add(name)

        previous_entry = previous_by_name.get(name) or {}

        if "auth_header" in raw and raw.get("auth_header"):
            auth_encrypted = encrypt_data(str(raw["auth_header"]))
        elif raw.get("auth_header_encrypted"):
            auth_encrypted = str(raw["auth_header_encrypted"])
        elif "auth_header" in raw and not raw.get("auth_header"):
            # Explicit empty → wipe.
            auth_encrypted = ""
        else:
            auth_encrypted = previous_entry.get("auth_header_encrypted") or ""

        normalised.append(
            {
                "name": name[:64],
                "url": url[:2048],
                "auth_header_encrypted": auth_encrypted,
                "enabled": bool(raw.get("enabled", True)),
            }
        )
    return normalised


def _build_bot_user(workspace_slug: str, agent_name: str) -> "User":
    """Create the `User(is_bot=True)` row that backs an Agent.

    Synthetic, locally-scoped email so it never collides with a real account
    and never gets routed to a real inbox. The User itself is inert — no
    password, no login, no email verification.
    """
    bot_uuid = uuid.uuid4().hex
    safe_name = "".join(c for c in agent_name.lower() if c.isalnum() or c in "-_")[:32] or "agent"
    bot_email = f"agent+{safe_name}-{bot_uuid[:12]}@bots.{workspace_slug}.dragonfruit.local"
    bot_username = f"agent-{safe_name}-{bot_uuid[:12]}"

    user = User(
        email=bot_email,
        username=bot_username,
        first_name=agent_name[:255],
        display_name=agent_name[:255],
        is_bot=True,
        bot_type="AGENT",
        is_active=True,
        is_email_verified=True,
    )
    user.set_unusable_password()
    user.save()
    return user


def _normalise_automation_conditions(raw_conditions: dict) -> dict:
    """Allowlist and normalize rule-builder condition payloads."""
    if not isinstance(raw_conditions, dict):
        return {}

    normalised: dict = {}
    for key in _AUTOMATION_CONDITION_KEYS:
        raw_values = raw_conditions.get(key)
        if not isinstance(raw_values, list):
            continue
        values = [str(value).strip() for value in raw_values if str(value).strip()]
        if key == "priorities":
            values = [value for value in values if value in _ISSUE_PRIORITY_VALUES]
        deduped_values = list(dict.fromkeys(values))
        if deduped_values:
            normalised[key] = deduped_values
    return normalised


class AgentEndpoint(BaseAPIView):
    """List + create agents in a workspace."""

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        agents = (
            Agent.objects.filter(workspace__slug=slug, deleted_at__isnull=True)
            .select_related("bot_user")
            .order_by("-created_at")
        )
        return Response(AgentSerializer(agents, many=True).data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        name = (request.data.get("name") or "").strip()
        if not name:
            return Response({"error": "name is required"}, status=status.HTTP_400_BAD_REQUEST)
        if len(name) > 128:
            return Response({"error": "name must be 128 characters or fewer"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            workspace = Workspace.objects.get(slug=slug)
        except Workspace.DoesNotExist:
            return Response({"error": "workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        plaintext_key = request.data.get("api_key") or ""

        with transaction.atomic():
            bot_user = _build_bot_user(workspace.slug, name)
            WorkspaceMember.objects.create(
                workspace=workspace,
                member=bot_user,
                role=_BOT_WORKSPACE_ROLE,
                is_active=True,
            )
            agent = Agent.objects.create(
                workspace=workspace,
                bot_user=bot_user,
                name=name,
                description=(request.data.get("description") or "").strip(),
                avatar_url=(request.data.get("avatar_url") or "").strip(),
                system_prompt=(request.data.get("system_prompt") or "").strip(),
                provider_model=(request.data.get("provider_model") or "").strip(),
                api_base_url=(request.data.get("api_base_url") or "").strip(),
                api_key_encrypted=encrypt_data(plaintext_key) if plaintext_key else "",
            )

        return Response(AgentSerializer(agent).data, status=status.HTTP_201_CREATED)


class AgentDetailEndpoint(BaseAPIView):
    """Retrieve / partial update / delete a single agent."""

    def _get_agent(self, slug: str, agent_id: str):
        return (
            Agent.objects.filter(workspace__slug=slug, pk=agent_id, deleted_at__isnull=True)
            .select_related("bot_user")
            .first()
        )

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug, agent_id):
        agent = self._get_agent(slug, agent_id)
        if not agent:
            return Response({"error": "agent not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(AgentSerializer(agent).data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def patch(self, request, slug, agent_id):
        agent = self._get_agent(slug, agent_id)
        if not agent:
            return Response({"error": "agent not found"}, status=status.HTTP_404_NOT_FOUND)

        # Mutable, non-secret fields. api_key is handled separately below.
        for field in (
            "name",
            "description",
            "avatar_url",
            "system_prompt",
            "provider_model",
            "api_base_url",
            "is_enabled",
            "draft_mode",
        ):
            if field in request.data:
                value = request.data.get(field)
                if isinstance(value, str):
                    value = value.strip()
                setattr(agent, field, value)

        if "triggers" in request.data and isinstance(request.data["triggers"], dict):
            # Shallow-merge so callers can patch just one flag.
            agent.triggers = {**(agent.triggers or {}), **request.data["triggers"]}

        if "tool_policies" in request.data:
            submitted = request.data.get("tool_policies")
            if not isinstance(submitted, dict):
                return Response({"error": "tool_policies must be an object"}, status=status.HTTP_400_BAD_REQUEST)
            merged = dict(agent.tool_policies or {})
            for key, value in submitted.items():
                tool_name = str(key or "").strip()
                policy = str(value or "").strip().lower()
                if not tool_name:
                    continue
                if policy not in _TOOL_POLICY_VALUES:
                    return Response(
                        {"error": f"invalid policy for {tool_name}: must be auto, ask, or never"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                merged[tool_name] = policy
            agent.tool_policies = merged

        if "max_concurrent_runs" in request.data:
            try:
                agent.max_concurrent_runs = max(1, min(50, int(request.data["max_concurrent_runs"])))
            except (TypeError, ValueError):
                return Response({"error": "max_concurrent_runs must be an integer"}, status=status.HTTP_400_BAD_REQUEST)

        # Rotate the encrypted key. Pass api_key: "" to wipe it.
        if "api_key" in request.data:
            new_key = request.data.get("api_key") or ""
            agent.api_key_encrypted = encrypt_data(new_key) if new_key else ""

        # Bulk-replace the MCP servers list. The client sends the full
        # desired set on each PATCH (it's small — usually 0–3 entries).
        # Plaintext `auth_header` values in the payload are encrypted
        # here and never echoed back; existing rows keep their
        # auth_header_encrypted blob if the new entry omits the field.
        if "mcp_servers_set" in request.data:
            agent.mcp_servers = _normalise_mcp_servers(
                request.data.get("mcp_servers_set") or [],
                previous=agent.mcp_servers or [],
            )

        agent.save()
        return Response(AgentSerializer(agent).data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug, agent_id):
        agent = self._get_agent(slug, agent_id)
        if not agent:
            return Response({"error": "agent not found"}, status=status.HTTP_404_NOT_FOUND)

        # Soft-delete the agent and deactivate the backing bot user.
        # Hard-deleting the User can fail in production due to historical
        # references outside direct CASCADE paths.
        bot_user = agent.bot_user
        with transaction.atomic():
            agent.deleted_at = timezone.now()
            agent.save(update_fields=["deleted_at"])
            bot_user.is_active = False
            bot_user.save(update_fields=["is_active"])
            WorkspaceMember.objects.filter(workspace=agent.workspace, member=bot_user).update(is_active=False)

        return Response(status=status.HTTP_204_NO_CONTENT)


class AgentCostSummaryEndpoint(BaseAPIView):
    """Aggregated cost summary for the workspace's agent runs.

    Powers the home-page cost widget. Returns running totals across
    three time windows (all-time, this month, last 7 days) plus a
    per-agent breakdown for the trailing 30 days.

    Anyone in the workspace can read the summary — agents are a
    workspace-wide feature and seeing what the team is spending isn't
    sensitive. Admin-only is overkill here.
    """

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        from datetime import timedelta
        from django.db.models import Count, Sum
        from django.utils import timezone as dj_timezone

        now = dj_timezone.now()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        week_start = now - timedelta(days=7)
        thirty_days_start = now - timedelta(days=30)

        base = AgentRun.objects.filter(
            agent__workspace__slug=slug,
            deleted_at__isnull=True,
        )

        def aggregate(qs):
            agg = qs.aggregate(runs=Count("id"), cost=Sum("cost_usd"), tokens=Sum("total_tokens"))
            return {
                "runs": agg["runs"] or 0,
                "cost_usd": float(agg["cost"] or 0),
                "total_tokens": agg["tokens"] or 0,
            }

        by_agent = (
            base.filter(created_at__gte=thirty_days_start)
            .values("agent_id", "agent__name")
            .annotate(runs=Count("id"), cost=Sum("cost_usd"), tokens=Sum("total_tokens"))
            .order_by("-cost")[:10]
        )

        return Response(
            {
                "all_time": aggregate(base),
                "this_month": aggregate(base.filter(created_at__gte=month_start)),
                "last_7_days": aggregate(base.filter(created_at__gte=week_start)),
                "by_agent_last_30_days": [
                    {
                        "agent_id": str(row["agent_id"]),
                        "name": row["agent__name"],
                        "runs": row["runs"],
                        "cost_usd": float(row["cost"] or 0),
                        "total_tokens": row["tokens"] or 0,
                    }
                    for row in by_agent
                ],
            },
            status=status.HTTP_200_OK,
        )


class AgentMemoryEndpoint(BaseAPIView):
    """Workspace/agent memory CRUD for retrieval-augmented runs."""

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        agent_id = request.GET.get("agent_id")
        query = (request.GET.get("q") or "").strip()
        limit_raw = request.GET.get("limit", 100)
        try:
            limit = max(1, min(int(limit_raw), 200))
        except (TypeError, ValueError):
            limit = 100

        memories = AgentMemory.objects.filter(
            workspace__slug=slug,
            deleted_at__isnull=True,
        )
        if agent_id:
            memories = memories.filter(agent_id=agent_id)
        if query:
            memories = memories.filter(Q(key__icontains=query) | Q(value__icontains=query))
        memories = memories.order_by("-updated_at")[:limit]
        return Response(AgentMemorySerializer(memories, many=True).data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        key = (request.data.get("key") or "").strip()
        value = (request.data.get("value") or "").strip()
        if not key:
            return Response({"error": "key is required"}, status=status.HTTP_400_BAD_REQUEST)
        if not value:
            return Response({"error": "value is required"}, status=status.HTTP_400_BAD_REQUEST)
        tags = request.data.get("tags") or []
        if not isinstance(tags, list):
            return Response({"error": "tags must be a list"}, status=status.HTTP_400_BAD_REQUEST)
        source = (request.data.get("source") or "").strip()
        agent_id = request.data.get("agent")

        workspace = Workspace.objects.filter(slug=slug).first()
        if not workspace:
            return Response({"error": "workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        memory = AgentMemory.objects.create(
            workspace=workspace,
            agent_id=agent_id if agent_id else None,
            key=key[:160],
            value=value,
            tags=[str(t).strip()[:60] for t in tags if str(t).strip()],
            source=source[:64],
        )
        return Response(AgentMemorySerializer(memory).data, status=status.HTTP_201_CREATED)


class AgentMemoryDetailEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def patch(self, request, slug, memory_id):
        memory = AgentMemory.objects.filter(
            workspace__slug=slug, pk=memory_id, deleted_at__isnull=True
        ).first()
        if not memory:
            return Response({"error": "memory not found"}, status=status.HTTP_404_NOT_FOUND)

        if "key" in request.data:
            key = (request.data.get("key") or "").strip()
            if not key:
                return Response({"error": "key cannot be empty"}, status=status.HTTP_400_BAD_REQUEST)
            memory.key = key[:160]
        if "value" in request.data:
            value = (request.data.get("value") or "").strip()
            if not value:
                return Response({"error": "value cannot be empty"}, status=status.HTTP_400_BAD_REQUEST)
            memory.value = value
        if "source" in request.data:
            memory.source = (request.data.get("source") or "").strip()[:64]
        if "tags" in request.data:
            tags = request.data.get("tags") or []
            if not isinstance(tags, list):
                return Response({"error": "tags must be a list"}, status=status.HTTP_400_BAD_REQUEST)
            memory.tags = [str(t).strip()[:60] for t in tags if str(t).strip()]
        if "agent" in request.data:
            memory.agent_id = request.data.get("agent") or None
        memory.save()
        return Response(AgentMemorySerializer(memory).data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug, memory_id):
        memory = AgentMemory.objects.filter(
            workspace__slug=slug, pk=memory_id, deleted_at__isnull=True
        ).first()
        if not memory:
            return Response({"error": "memory not found"}, status=status.HTTP_404_NOT_FOUND)
        memory.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AgentAutomationEndpoint(BaseAPIView):
    """CRUD for agent automation rules visible in-app."""

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        rows = AgentAutomation.objects.filter(
            workspace__slug=slug,
            deleted_at__isnull=True,
        ).select_related("agent")
        return Response(AgentAutomationSerializer(rows, many=True).data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        name = (request.data.get("name") or "").strip()
        agent_id = request.data.get("agent")
        trigger_event = (request.data.get("trigger_event") or "issue_created").strip()
        conditions = request.data.get("conditions") or {}
        is_enabled = bool(request.data.get("is_enabled", True))

        if not name:
            return Response({"error": "name is required"}, status=status.HTTP_400_BAD_REQUEST)
        if trigger_event not in {"issue_created"}:
            return Response({"error": "unsupported trigger_event"}, status=status.HTTP_400_BAD_REQUEST)
        if not agent_id:
            return Response({"error": "agent is required"}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(conditions, dict):
            return Response({"error": "conditions must be an object"}, status=status.HTTP_400_BAD_REQUEST)
        conditions = _normalise_automation_conditions(conditions)

        workspace = Workspace.objects.filter(slug=slug).first()
        if not workspace:
            return Response({"error": "workspace not found"}, status=status.HTTP_404_NOT_FOUND)
        agent = Agent.objects.filter(
            workspace=workspace,
            pk=agent_id,
            deleted_at__isnull=True,
        ).first()
        if not agent:
            return Response({"error": "agent not found"}, status=status.HTTP_404_NOT_FOUND)

        row = AgentAutomation.objects.create(
            workspace=workspace,
            agent=agent,
            name=name[:180],
            trigger_event=trigger_event,
            conditions=conditions,
            is_enabled=is_enabled,
        )
        return Response(AgentAutomationSerializer(row).data, status=status.HTTP_201_CREATED)


class AgentAutomationDetailEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def patch(self, request, slug, automation_id):
        row = AgentAutomation.objects.filter(
            workspace__slug=slug,
            pk=automation_id,
            deleted_at__isnull=True,
        ).first()
        if not row:
            return Response({"error": "automation not found"}, status=status.HTTP_404_NOT_FOUND)

        if "name" in request.data:
            name = (request.data.get("name") or "").strip()
            if not name:
                return Response({"error": "name cannot be empty"}, status=status.HTTP_400_BAD_REQUEST)
            row.name = name[:180]
        if "is_enabled" in request.data:
            row.is_enabled = bool(request.data.get("is_enabled"))
        if "conditions" in request.data:
            conditions = request.data.get("conditions") or {}
            if not isinstance(conditions, dict):
                return Response({"error": "conditions must be an object"}, status=status.HTTP_400_BAD_REQUEST)
            row.conditions = _normalise_automation_conditions(conditions)
        if "agent" in request.data:
            agent_id = request.data.get("agent")
            agent = Agent.objects.filter(
                workspace=row.workspace,
                pk=agent_id,
                deleted_at__isnull=True,
            ).first()
            if not agent:
                return Response({"error": "agent not found"}, status=status.HTTP_404_NOT_FOUND)
            row.agent = agent

        row.save()
        return Response(AgentAutomationSerializer(row).data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug, automation_id):
        row = AgentAutomation.objects.filter(
            workspace__slug=slug,
            pk=automation_id,
            deleted_at__isnull=True,
        ).first()
        if not row:
            return Response({"error": "automation not found"}, status=status.HTTP_404_NOT_FOUND)
        row.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AgentRunListEndpoint(BaseAPIView):
    """Read-only paginated list of an agent's recent runs.

    Slice 1 only inserts completed rows from the dispatch task. Slice 2 adds
    in-flight runs that the cancel button writes to.
    """

    PAGE_SIZE = 50

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug, agent_id):
        runs = (
            AgentRun.objects.filter(
                agent__workspace__slug=slug,
                agent_id=agent_id,
                deleted_at__isnull=True,
            )
            .order_by("-created_at")[: self.PAGE_SIZE]
        )
        return Response(AgentRunSerializer(runs, many=True).data, status=status.HTTP_200_OK)


class AgentDraftCommentApproveEndpoint(BaseAPIView):
    """Approve a draft comment posted by an agent — flip is_draft to False.

    Distinct paths for issue comments vs page block comments because
    they live in different models. The request shape is identical:
    POST with the comment_id in the URL.

    Idempotent: approving a comment that's already non-draft is a no-op
    that still returns 200.
    """

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug, kind, comment_id):
        if kind == "issue":
            from plane.db.models import IssueComment

            comment = IssueComment.objects.filter(
                pk=comment_id, workspace__slug=slug, deleted_at__isnull=True
            ).first()
        elif kind == "page":
            from plane.db.models import PageBlockComment

            comment = PageBlockComment.objects.filter(
                pk=comment_id, workspace__slug=slug, deleted_at__isnull=True
            ).first()
        else:
            return Response({"error": "kind must be 'issue' or 'page'"}, status=status.HTTP_400_BAD_REQUEST)

        if comment is None:
            return Response({"error": "comment not found"}, status=status.HTTP_404_NOT_FOUND)

        if comment.is_draft:
            comment.is_draft = False
            comment.save(update_fields=["is_draft", "updated_at"])

        return Response({"id": str(comment.id), "is_draft": comment.is_draft}, status=status.HTTP_200_OK)


class AgentDraftCommentDiscardEndpoint(BaseAPIView):
    """Discard a draft comment posted by an agent — soft-delete the row.

    Only operates on rows where is_draft is still True. Refuses to
    delete an already-approved comment (use the normal comment delete
    endpoint for that).
    """

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug, kind, comment_id):
        if kind == "issue":
            from plane.db.models import IssueComment

            comment = IssueComment.objects.filter(
                pk=comment_id, workspace__slug=slug, deleted_at__isnull=True, is_draft=True
            ).first()
        elif kind == "page":
            from plane.db.models import PageBlockComment

            comment = PageBlockComment.objects.filter(
                pk=comment_id, workspace__slug=slug, deleted_at__isnull=True, is_draft=True
            ).first()
        else:
            return Response({"error": "kind must be 'issue' or 'page'"}, status=status.HTTP_400_BAD_REQUEST)

        if comment is None:
            return Response(
                {"error": "draft comment not found (already approved or already discarded)"},
                status=status.HTTP_404_NOT_FOUND,
            )

        comment.delete()  # soft delete via BaseModel
        return Response(status=status.HTTP_204_NO_CONTENT)


class AgentRunCancelEndpoint(BaseAPIView):
    """Cancel a single in-flight AgentRun by flipping cancel_requested.

    Distinct from AgentStopEndpoint, which disables the whole agent AND
    cancels every in-flight run. This is for the narrower case where an
    admin wants to kill one specific runaway run without pausing the
    agent itself.

    Idempotent: cancelling an already-cancelled or terminal run is a
    no-op that returns the current row.
    """

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug, agent_id, run_id):
        run = (
            AgentRun.objects.filter(
                agent__workspace__slug=slug,
                agent_id=agent_id,
                pk=run_id,
                deleted_at__isnull=True,
            )
            .first()
        )
        if run is None:
            return Response({"error": "run not found"}, status=status.HTTP_404_NOT_FOUND)

        if run.status in ("pending", "running") and not run.cancel_requested:
            run.cancel_requested = True
            run.save(update_fields=["cancel_requested", "updated_at"])

        return Response(AgentRunSerializer(run).data, status=status.HTTP_200_OK)


class AgentStopEndpoint(BaseAPIView):
    """Hard-stop an agent: disable it and cancel every in-flight run.

    The Celery loop (`LLMProvider.run`) polls `AgentRun.cancel_requested`
    between turns and bails when it flips True. Setting `is_enabled=False`
    on the agent itself ensures no new dispatches start in the meantime
    — the `IssueAssignee` post_save signal short-circuits on disabled
    agents.

    Idempotent: running it on an already-stopped agent is a no-op and
    returns the same shape.
    """

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug, agent_id):
        agent = (
            Agent.objects.filter(workspace__slug=slug, pk=agent_id, deleted_at__isnull=True)
            .select_related("bot_user")
            .first()
        )
        if not agent:
            return Response({"error": "agent not found"}, status=status.HTTP_404_NOT_FOUND)

        with transaction.atomic():
            agent.is_enabled = False
            agent.save(update_fields=["is_enabled", "updated_at"])

            cancelled = AgentRun.objects.filter(
                agent=agent,
                deleted_at__isnull=True,
                status__in=("pending", "running"),
                cancel_requested=False,
            ).update(cancel_requested=True)

        payload = AgentSerializer(agent).data
        payload["cancelled_runs"] = cancelled
        return Response(payload, status=status.HTTP_200_OK)
