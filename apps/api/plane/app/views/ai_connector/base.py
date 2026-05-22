# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import AIConnectorEventSerializer, IssueCreateSerializer, WorkspaceAIConnectorSerializer
from plane.db.models import AIConnectorEvent, Intake, IntakeIssue, Project, State, StateGroup, Workspace, WorkspaceAIConnector
from plane.db.models.integration.ai_connector import AIConnectorEventStatus, AIConnectorProvider, AIConnectorStatus
from plane.license.utils.encryption import decrypt_data, encrypt_data

from ..base import BaseAPIView


def _derive_issue_title(content: str) -> str:
    cleaned = " ".join((content or "").strip().split())
    if not cleaned:
        return "Imported message"
    return cleaned[:255]


class WorkspaceAIConnectorEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug, connector_id=None):
        if connector_id is None:
            connectors = WorkspaceAIConnector.objects.filter(workspace__slug=slug)
            serializer = WorkspaceAIConnectorSerializer(connectors, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)

        connector = WorkspaceAIConnector.objects.get(workspace__slug=slug, pk=connector_id)
        serializer = WorkspaceAIConnectorSerializer(connector)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        serializer = WorkspaceAIConnectorSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        secret = request.data.get("secret")
        if not isinstance(secret, str) or not secret.strip():
            return Response({"error": "secret is required"}, status=status.HTTP_400_BAD_REQUEST)

        connector = serializer.save(
            workspace=workspace,
            actor=request.user,
            secret_encrypted=encrypt_data(secret.strip()),
        )
        payload = WorkspaceAIConnectorSerializer(connector).data
        return Response(payload, status=status.HTTP_201_CREATED)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def patch(self, request, slug, connector_id):
        connector = WorkspaceAIConnector.objects.get(workspace__slug=slug, pk=connector_id)
        serializer = WorkspaceAIConnectorSerializer(connector, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        secret = request.data.get("secret")
        if isinstance(secret, str) and secret.strip():
            connector.secret_encrypted = encrypt_data(secret.strip())

        connector = serializer.save()
        if connector.status == AIConnectorStatus.REVOKED:
            connector.deleted_at = timezone.now()
            connector.save(update_fields=["deleted_at"])
        return Response(WorkspaceAIConnectorSerializer(connector).data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug, connector_id):
        connector = WorkspaceAIConnector.objects.get(workspace__slug=slug, pk=connector_id)
        connector.status = AIConnectorStatus.REVOKED
        connector.deleted_at = timezone.now()
        connector.save(update_fields=["status", "deleted_at", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceAIConnectorEventsEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug, connector_id):
        events = AIConnectorEvent.objects.filter(workspace__slug=slug, connector_id=connector_id)
        serializer = AIConnectorEventSerializer(events, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class WorkspaceAIConnectorTestEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug, connector_id):
        connector = WorkspaceAIConnector.objects.get(workspace__slug=slug, pk=connector_id)
        return Response(
            {
                "ok": bool(connector.secret_encrypted) and connector.status == AIConnectorStatus.ACTIVE,
            },
            status=status.HTTP_200_OK,
        )


class WorkspaceAIConnectorIngestEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug):
        provider = request.data.get("source")
        workspace_id = request.data.get("source_workspace_id")
        source_user_id = request.data.get("user_id")
        source_message_id = request.data.get("source_message_id")
        if not provider or not workspace_id or not source_user_id or not source_message_id:
            return Response(
                {"error": "source, source_workspace_id, user_id, and source_message_id are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        connector = WorkspaceAIConnector.objects.filter(
            workspace__slug=slug,
            provider=provider,
            external_workspace_id=workspace_id,
            external_user_id=source_user_id,
            deleted_at__isnull=True,
        ).first()
        if connector is None:
            return Response({"error": "Connector not found"}, status=status.HTTP_404_NOT_FOUND)

        # Reuse the provider inbound contract and set the connector secret internally.
        request.META["HTTP_X_DRAGONFRUIT_CONNECTOR_SECRET"] = decrypt_data(connector.secret_encrypted) or ""
        return AIConnectorInboundEndpoint().post(request, provider=provider)


class AIConnectorInboundEndpoint(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, provider):
        if provider not in AIConnectorProvider.values:
            return Response({"error": "Unsupported provider"}, status=status.HTTP_400_BAD_REQUEST)

        workspace_id = request.data.get("source_workspace_id")
        source_user_id = request.data.get("user_id")
        source_message_id = request.data.get("source_message_id")
        content = request.data.get("content")

        if not workspace_id or not source_user_id or not source_message_id or not content:
            return Response(
                {"error": "source_workspace_id, user_id, source_message_id, and content are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        secret = request.headers.get("X-Dragonfruit-Connector-Secret", "")
        if not secret:
            return Response({"error": "Missing connector secret"}, status=status.HTTP_401_UNAUTHORIZED)

        connector = WorkspaceAIConnector.objects.filter(
            provider=provider,
            external_workspace_id=workspace_id,
            external_user_id=source_user_id,
            deleted_at__isnull=True,
        ).first()
        if connector is None:
            return Response({"error": "Connector not found"}, status=status.HTTP_404_NOT_FOUND)

        if connector.status != AIConnectorStatus.ACTIVE:
            return Response({"error": "Connector is not active"}, status=status.HTTP_409_CONFLICT)

        decrypted_secret = decrypt_data(connector.secret_encrypted) or ""
        if secret != decrypted_secret:
            return Response({"error": "Invalid connector secret"}, status=status.HTTP_401_UNAUTHORIZED)

        dedupe_key = f"{provider}:{source_message_id}"
        try:
            with transaction.atomic():
                event = AIConnectorEvent.objects.create(
                    workspace_id=connector.workspace_id,
                    connector=connector,
                    source_message_id=str(source_message_id),
                    dedupe_key=dedupe_key,
                    payload=request.data,
                    status=AIConnectorEventStatus.RECEIVED,
                )
        except IntegrityError:
            existing = AIConnectorEvent.objects.get(connector=connector, source_message_id=str(source_message_id))
            return Response(
                {
                    "id": str(existing.id),
                    "dedupe_key": existing.dedupe_key,
                    "accepted": True,
                    "enqueued": False,
                },
                status=status.HTTP_200_OK,
            )

        if connector.default_project_id is None:
            event.status = AIConnectorEventStatus.FAILED
            event.error = "default_project is not configured"
            event.save(update_fields=["status", "error", "updated_at"])
            return Response({"error": event.error}, status=status.HTTP_409_CONFLICT)

        project = Project.objects.get(pk=connector.default_project_id, workspace_id=connector.workspace_id)
        triage_state = State.triage_objects.filter(project_id=project.id, workspace_id=project.workspace_id).first()
        if triage_state is None:
            triage_state = State.objects.create(
                name="Triage",
                group=StateGroup.TRIAGE.value,
                project_id=project.id,
                workspace_id=project.workspace_id,
                color="#4E5355",
                sequence=65000,
                default=False,
            )

        event.status = AIConnectorEventStatus.PROCESSING
        event.save(update_fields=["status", "updated_at"])

        serializer = IssueCreateSerializer(
            data={"name": _derive_issue_title(content), "state_id": str(triage_state.id), "description_html": content},
            context={
                "project_id": project.id,
                "workspace_id": project.workspace_id,
                "default_assignee_id": project.default_assignee_id,
                "allow_triage_state": True,
            },
        )

        if not serializer.is_valid():
            event.status = AIConnectorEventStatus.FAILED
            event.error = str(serializer.errors)
            connector.last_error = event.error
            connector.status = AIConnectorStatus.ERROR
            connector.save(update_fields=["status", "last_error", "updated_at"])
            event.save(update_fields=["status", "error", "updated_at"])
            return Response({"error": "Failed to import message", "details": serializer.errors}, status=400)

        issue = serializer.save()
        intake, _ = Intake.objects.get_or_create(
            workspace_id=project.workspace_id,
            project_id=project.id,
            name="Imported",
            defaults={"description": "Items imported from external AI workspaces.", "is_default": False},
        )
        IntakeIssue.objects.create(
            intake_id=intake.id,
            issue_id=issue.id,
            project_id=project.id,
            workspace_id=project.workspace_id,
            source="IN_APP",
            external_source=provider,
            external_id=str(source_message_id),
            extra={"actor": request.data.get("actor"), "metadata": request.data.get("metadata", {})},
        )

        event.status = AIConnectorEventStatus.PROCESSED
        event.created_issue = issue
        event.error = None
        event.save(update_fields=["status", "created_issue", "error", "updated_at"])

        connector.status = AIConnectorStatus.ACTIVE
        connector.last_error = None
        connector.last_synced_at = timezone.now()
        connector.save(update_fields=["status", "last_error", "last_synced_at", "updated_at"])

        return Response(
            {
                "id": str(event.id),
                "dedupe_key": dedupe_key,
                "accepted": True,
                "enqueued": True,
                "issue_id": str(issue.id),
            },
            status=status.HTTP_202_ACCEPTED,
        )
