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
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers.agent import AgentRunSerializer, AgentSerializer
from plane.db.models import Agent, AgentRun, Workspace, WorkspaceMember
from plane.license.utils.encryption import encrypt_data

from ..base import BaseAPIView


User = get_user_model()


# Bots are seated as Guest (the lowest workspace role) so they have the
# minimum privileges needed to read tasks and post comments. If you want
# state changes or settings access, the human owner has to opt in
# explicitly per-agent (not in Slice 1).
_BOT_WORKSPACE_ROLE = 5  # Guest


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

        if "max_concurrent_runs" in request.data:
            try:
                agent.max_concurrent_runs = max(1, min(50, int(request.data["max_concurrent_runs"])))
            except (TypeError, ValueError):
                return Response({"error": "max_concurrent_runs must be an integer"}, status=status.HTTP_400_BAD_REQUEST)

        # Rotate the encrypted key. Pass api_key: "" to wipe it.
        if "api_key" in request.data:
            new_key = request.data.get("api_key") or ""
            agent.api_key_encrypted = encrypt_data(new_key) if new_key else ""

        agent.save()
        return Response(AgentSerializer(agent).data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug, agent_id):
        agent = self._get_agent(slug, agent_id)
        if not agent:
            return Response({"error": "agent not found"}, status=status.HTTP_404_NOT_FOUND)

        # Hard delete the bot User so we don't accumulate orphan bot rows.
        # IssueAssignee + WorkspaceMember rows cascade from the User FK.
        # AgentRun rows cascade from the Agent FK. Agent itself is the
        # last to go.
        bot_user = agent.bot_user
        with transaction.atomic():
            agent.delete()
            bot_user.delete()

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
