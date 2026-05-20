# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import hashlib
import hmac
import json
import secrets
import uuid
from datetime import datetime, timezone

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import allow_permission, ROLE
from plane.bgtasks.agent_webhook_task import dispatch_agent_webhook
from plane.db.models import Workspace, WorkspaceAgentWebhook
from plane.license.utils.encryption import decrypt_data, encrypt_data

from ..base import BaseAPIView


def _serialize(webhook: WorkspaceAgentWebhook) -> dict:
    """Public serializer — never leaks the plaintext secret."""
    return {
        "id": str(webhook.id),
        "url": webhook.url,
        "is_enabled": webhook.is_enabled,
        "has_secret": bool(webhook.secret_encrypted),
        "created_at": webhook.created_at.isoformat() if webhook.created_at else None,
        "updated_at": webhook.updated_at.isoformat() if webhook.updated_at else None,
    }


class WorkspaceAgentWebhookEndpoint(BaseAPIView):
    """Admin CRUD for the per-workspace agent webhook config."""

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        try:
            webhook = WorkspaceAgentWebhook.objects.get(workspace__slug=slug)
        except WorkspaceAgentWebhook.DoesNotExist:
            return Response({"configured": False}, status=status.HTTP_200_OK)
        return Response({"configured": True, **_serialize(webhook)}, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def put(self, request, slug):
        """Create or update the workspace's webhook config.

        Body: { url: string, is_enabled?: boolean, rotate_secret?: boolean }
        On first write, a secret is auto-generated. Pass rotate_secret=true to
        cycle it. The plaintext secret is returned exactly once — store it.
        """
        url = (request.data.get("url") or "").strip()
        if not url.startswith(("http://", "https://")):
            return Response(
                {"error": "url must be a valid http(s) URL"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        workspace = Workspace.objects.get(slug=slug)
        webhook, created = WorkspaceAgentWebhook.objects.get_or_create(
            workspace=workspace,
            defaults={"url": url, "secret_encrypted": ""},
        )

        rotate = bool(request.data.get("rotate_secret"))
        plaintext_secret = None
        if created or rotate or not webhook.secret_encrypted:
            plaintext_secret = secrets.token_urlsafe(32)
            webhook.secret_encrypted = encrypt_data(plaintext_secret)

        webhook.url = url
        if "is_enabled" in request.data:
            webhook.is_enabled = bool(request.data.get("is_enabled"))
        webhook.save()

        payload = _serialize(webhook)
        if plaintext_secret is not None:
            # Returned once — receivers should verify HMAC with this value.
            payload["secret"] = plaintext_secret
        return Response(
            payload,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug):
        WorkspaceAgentWebhook.objects.filter(workspace__slug=slug).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceAgentWebhookDispatchEndpoint(BaseAPIView):
    """Forward a `/agent` invocation from the editor to the configured webhook.

    Fire-and-forget: we sign the payload with HMAC-SHA256 using the workspace
    secret and hand the outbound POST off to Celery. The editor sees a 202
    as soon as we've validated the request and enqueued the task — no
    gunicorn worker waits on the remote endpoint. The agent writes back
    through the normal Pages / Issues API on its own schedule.
    """

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug):
        try:
            webhook = WorkspaceAgentWebhook.objects.get(workspace__slug=slug)
        except WorkspaceAgentWebhook.DoesNotExist:
            return Response(
                {"error": "Agent webhook is not configured for this workspace."},
                status=status.HTTP_409_CONFLICT,
            )

        if not webhook.is_enabled:
            return Response(
                {"error": "Agent webhook is disabled."},
                status=status.HTTP_409_CONFLICT,
            )

        prompt = (request.data.get("prompt") or "").strip()
        if not prompt:
            return Response({"error": "prompt is required"}, status=status.HTTP_400_BAD_REQUEST)

        dispatch_id = str(uuid.uuid4())
        payload = {
            "dispatch_id": dispatch_id,
            "event": "agent.invoke",
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "workspace": {"slug": slug, "id": str(webhook.workspace_id)},
            "user": {
                "id": str(request.user.id),
                "email": request.user.email,
            },
            "prompt": prompt,
            "context": {
                "project_id": request.data.get("project_id"),
                "page_id": request.data.get("page_id"),
                "selection_text": request.data.get("selection_text"),
                "block_id": request.data.get("block_id"),
            },
        }

        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        secret = decrypt_data(webhook.secret_encrypted)
        signature = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "DragonFruit-Agent-Webhook/1",
            "X-Dragonfruit-Event": "agent.invoke",
            "X-Dragonfruit-Signature": f"sha256={signature}",
            "X-Dragonfruit-Dispatch-Id": dispatch_id,
        }

        # Hand off to the bg worker — this is non-blocking and won't raise
        # for network failures. Receiver errors get logged + retried with
        # backoff inside the task; the editor never has to know.
        dispatch_agent_webhook.delay(
            url=webhook.url,
            body=body,
            headers=headers,
            dispatch_id=dispatch_id,
        )

        return Response(
            {"dispatched": True, "dispatch_id": dispatch_id},
            status=status.HTTP_202_ACCEPTED,
        )
