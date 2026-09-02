# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only

"""Project-scoped APIs for bounded external context sources."""

from django.db.models import Count
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.db.models import (
    Project,
    ProjectContextConnection,
    ProjectContextSource,
    ProjectMember,
    ProjectSourceFile,
    WorkspaceMember,
)
from plane.project_context_google_drive import (
    GoogleDriveError,
    build_authorize_url,
    complete_google_drive_oauth,
    list_drive_folders,
    refresh_google_drive_source,
    serialize_connection,
    validate_google_drive_state,
)
from plane.project_context_sources import (
    ProjectSourceValidationError,
    build_project_context_pack,
    normalize_selection_config,
    upsert_project_source_revision,
)
from plane.app.serializers.project_context_source import ProjectContextSourceSerializer, ProjectSourceFileSerializer

from ..base import BaseAPIView


def _get_project(*, slug: str, project_id: str) -> Project | None:
    return Project.objects.filter(
        pk=project_id,
        workspace__slug=slug,
        archived_at__isnull=True,
    ).first()


def _get_source(*, slug: str, project_id: str, source_id: str) -> ProjectContextSource | None:
    return ProjectContextSource.objects.filter(
        pk=source_id,
        project_id=project_id,
        workspace__slug=slug,
    ).first()


class ProjectContextSourceEndpoint(BaseAPIView):
    """List and create source roots. A source contains no provider credential."""

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="PROJECT")
    def get(self, request, slug, project_id):
        sources = (
            ProjectContextSource.objects.filter(project_id=project_id, workspace__slug=slug)
            .annotate(file_count=Count("files", distinct=True))
            .order_by("-updated_at")
        )
        return Response(ProjectContextSourceSerializer(sources, many=True).data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="PROJECT")
    def post(self, request, slug, project_id):
        project = _get_project(slug=slug, project_id=project_id)
        if project is None:
            return Response({"error": "project not found"}, status=status.HTTP_404_NOT_FOUND)

        provider = str(request.data.get("provider") or "").strip()
        root_external_id = str(request.data.get("root_external_id") or "").strip()
        display_name = str(request.data.get("display_name") or "").strip()
        if provider not in dict(ProjectContextSource.PROVIDER_CHOICES):
            return Response({"error": "unsupported provider"}, status=status.HTTP_400_BAD_REQUEST)
        if not root_external_id:
            return Response({"error": "root_external_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        if not display_name:
            return Response({"error": "display_name is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            selection_config = normalize_selection_config(request.data.get("selection_config"))
        except ProjectSourceValidationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        if ProjectContextSource.objects.filter(
            project=project,
            provider=provider,
            root_external_id=root_external_id,
        ).exists():
            return Response({"error": "this source root is already connected"}, status=status.HTTP_409_CONFLICT)

        connection = None
        if provider == ProjectContextSource.PROVIDER_GOOGLE_DRIVE:
            connection_id = request.data.get("connection_id")
            connection = ProjectContextConnection.objects.filter(
                pk=connection_id,
                workspace=project.workspace,
                user=request.user,
                provider=ProjectContextConnection.PROVIDER_GOOGLE_DRIVE,
                is_active=True,
                deleted_at__isnull=True,
            ).first()
            if connection is None:
                return Response(
                    {"error": "an active Google Drive connection is required"}, status=status.HTTP_400_BAD_REQUEST
                )

        source = ProjectContextSource.objects.create(
            workspace=project.workspace,
            project=project,
            connection=connection,
            provider=provider,
            root_external_id=root_external_id[:255],
            display_name=display_name[:255],
            selection_config=selection_config,
        )
        return Response(ProjectContextSourceSerializer(source).data, status=status.HTTP_201_CREATED)


class ProjectContextGoogleDriveStartEndpoint(BaseAPIView):
    """Create a signed OAuth request for an administrator of this project."""

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="PROJECT")
    def get(self, request, slug, project_id):
        project = _get_project(slug=slug, project_id=project_id)
        if project is None:
            return Response({"error": "project not found"}, status=status.HTTP_404_NOT_FOUND)
        try:
            authorize_url = build_authorize_url(
                user_id=str(request.user.id),
                workspace_id=str(project.workspace_id),
                workspace_slug=project.workspace.slug,
                project_id=str(project.id),
            )
        except GoogleDriveError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({"authorize_url": authorize_url}, status=status.HTTP_200_OK)


class ProjectContextGoogleDriveCallbackEndpoint(BaseAPIView):
    """Exchange a signed callback state for an encrypted user-owned connection."""

    def post(self, request):
        code = str(request.data.get("code") or "")
        state = str(request.data.get("state") or "")
        try:
            payload = validate_google_drive_state(state, user_id=str(request.user.id))
        except GoogleDriveError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        project_access = ProjectMember.objects.filter(
            project_id=payload["project_id"],
            workspace_id=payload["workspace_id"],
            member=request.user,
            role=ROLE.ADMIN.value,
            is_active=True,
        ).exists()
        workspace_admin_access = (
            ProjectMember.objects.filter(
                project_id=payload["project_id"],
                workspace_id=payload["workspace_id"],
                member=request.user,
                is_active=True,
            ).exists()
            and WorkspaceMember.objects.filter(
                workspace_id=payload["workspace_id"], member=request.user, role=ROLE.ADMIN.value, is_active=True
            ).exists()
        )
        if not project_access and not workspace_admin_access:
            return Response({"error": "project administrator permission is required"}, status=status.HTTP_403_FORBIDDEN)
        try:
            connection, _ = complete_google_drive_oauth(user=request.user, code=code, state=state)
        except GoogleDriveError as exc:
            status_code = (
                status.HTTP_503_SERVICE_UNAVAILABLE if "not configured" in str(exc) else status.HTTP_400_BAD_REQUEST
            )
            return Response({"error": str(exc)}, status=status_code)
        return Response(
            {
                "connection": serialize_connection(connection),
                "workspace_slug": payload["workspace_slug"],
                "project_id": payload["project_id"],
            },
            status=status.HTTP_200_OK,
        )


class ProjectContextGoogleDriveFolderEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN], level="PROJECT")
    def get(self, request, slug, project_id, connection_id):
        connection = ProjectContextConnection.objects.filter(
            pk=connection_id,
            workspace__slug=slug,
            user=request.user,
            provider=ProjectContextConnection.PROVIDER_GOOGLE_DRIVE,
            deleted_at__isnull=True,
        ).first()
        if connection is None:
            return Response({"error": "Google Drive connection not found"}, status=status.HTTP_404_NOT_FOUND)
        try:
            folders = list_drive_folders(
                connection=connection, parent_id=request.query_params.get("parent_id") or "root"
            )
        except GoogleDriveError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_409_CONFLICT)
        return Response({"folders": folders}, status=status.HTTP_200_OK)


class ProjectContextSourceDetailEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN], level="PROJECT")
    def patch(self, request, slug, project_id, source_id):
        source = _get_source(slug=slug, project_id=project_id, source_id=source_id)
        if source is None:
            return Response({"error": "context source not found"}, status=status.HTTP_404_NOT_FOUND)
        if source.status == ProjectContextSource.STATUS_DISCONNECTED:
            return Response({"error": "context source is disconnected"}, status=status.HTTP_409_CONFLICT)

        update_fields = []
        if "display_name" in request.data:
            display_name = str(request.data.get("display_name") or "").strip()
            if not display_name:
                return Response({"error": "display_name cannot be empty"}, status=status.HTTP_400_BAD_REQUEST)
            source.display_name = display_name[:255]
            update_fields.append("display_name")
        if "selection_config" in request.data:
            try:
                source.selection_config = normalize_selection_config(request.data.get("selection_config"))
            except ProjectSourceValidationError as exc:
                return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
            update_fields.append("selection_config")
        if not update_fields:
            return Response({"error": "no editable source fields supplied"}, status=status.HTTP_400_BAD_REQUEST)
        source.save(update_fields=[*update_fields, "updated_at"])
        return Response(ProjectContextSourceSerializer(source).data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="PROJECT")
    def delete(self, request, slug, project_id, source_id):
        source = _get_source(slug=slug, project_id=project_id, source_id=source_id)
        if source is None:
            return Response({"error": "context source not found"}, status=status.HTTP_404_NOT_FOUND)
        # The soft-delete keeps only source metadata in the audit trail. Related
        # source bodies are soft-deleted through the established deletion task.
        source.status = ProjectContextSource.STATUS_DISCONNECTED
        source.save(update_fields=["status", "updated_at"])
        source.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectContextSourceRefreshEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN], level="PROJECT")
    def post(self, request, slug, project_id, source_id):
        source = _get_source(slug=slug, project_id=project_id, source_id=source_id)
        if source is None:
            return Response({"error": "context source not found"}, status=status.HTTP_404_NOT_FOUND)
        if source.provider != ProjectContextSource.PROVIDER_GOOGLE_DRIVE:
            return Response(
                {"error": "this source does not support provider refresh"}, status=status.HTTP_400_BAD_REQUEST
            )
        if source.connection_id is None or source.connection.user_id != request.user.id:
            return Response(
                {"error": "only the connected account owner can refresh this source"}, status=status.HTTP_403_FORBIDDEN
            )
        try:
            result = refresh_google_drive_source(source=source)
        except (GoogleDriveError, ProjectSourceValidationError) as exc:
            ProjectContextSource.objects.filter(pk=source.pk).update(
                status=ProjectContextSource.STATUS_ERROR,
                last_error_code="google_drive_refresh_failed",
            )
            return Response({"error": str(exc)}, status=status.HTTP_409_CONFLICT)
        source.refresh_from_db()
        return Response({"source": ProjectContextSourceSerializer(source).data, **result}, status=status.HTTP_200_OK)


class ProjectContextSourceFileEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="PROJECT")
    def get(self, request, slug, project_id, source_id):
        source = _get_source(slug=slug, project_id=project_id, source_id=source_id)
        if source is None:
            return Response({"error": "context source not found"}, status=status.HTTP_404_NOT_FOUND)
        # Keep the endpoint intentionally small: metadata and revision hashes,
        # never external file bodies.
        files = ProjectSourceFile.objects.filter(source=source).prefetch_related("revisions")
        return Response(ProjectSourceFileSerializer(files, many=True).data, status=status.HTTP_200_OK)


class ProjectContextSourceManualIngestEndpoint(BaseAPIView):
    """Temporary/portable ingestion boundary used by the manual provider.

    A Drive worker will call the same service function after it validates its
    selected-folder boundary. Accepting direct file bodies for a Drive source
    would turn this public endpoint into a provider proxy, so that is forbidden.
    """

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="PROJECT")
    def post(self, request, slug, project_id, source_id):
        source = _get_source(slug=slug, project_id=project_id, source_id=source_id)
        if source is None:
            return Response({"error": "context source not found"}, status=status.HTTP_404_NOT_FOUND)
        if source.provider != ProjectContextSource.PROVIDER_MANUAL:
            return Response({"error": "only manual sources accept direct ingestion"}, status=status.HTTP_403_FORBIDDEN)
        try:
            source_file, revision = upsert_project_source_revision(
                source=source,
                external_id=request.data.get("external_id"),
                relative_path=request.data.get("relative_path"),
                text=request.data.get("text"),
                mime_type=request.data.get("mime_type", ""),
                provider_revision=request.data.get("provider_revision", ""),
                size_bytes=request.data.get("size_bytes"),
            )
        except (ProjectSourceValidationError, TypeError, ValueError) as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {
                "file": ProjectSourceFileSerializer(source_file).data,
                "revision_id": str(revision.id) if revision else None,
            },
            status=status.HTTP_201_CREATED if revision else status.HTTP_200_OK,
        )


class ProjectContextPackEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="PROJECT")
    def get(self, request, slug, project_id):
        project = _get_project(slug=slug, project_id=project_id)
        if project is None:
            return Response({"error": "project not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(build_project_context_pack(project=project), status=status.HTTP_200_OK)
