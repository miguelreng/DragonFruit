# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third Party imports
from django.conf import settings
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import allow_permission, ROLE
from plane.app.serializers import ExporterHistorySerializer
from plane.bgtasks.export_task import issue_export_task
from plane.db.models import ExporterHistory, Project, Workspace
from plane.throttles.resource import ExportRateThrottle

# Module imports
from .. import BaseAPIView


class ExportIssuesEndpoint(BaseAPIView):
    model = ExporterHistory
    serializer_class = ExporterHistorySerializer
    throttle_classes = [ExportRateThrottle]

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug):
        # Get the workspace
        workspace = Workspace.objects.get(slug=slug)

        pending_exports = ExporterHistory.objects.filter(
            workspace=workspace,
            initiated_by=request.user,
            type="issue_exports",
            status__in=("queued", "processing"),
        ).count()
        if pending_exports >= settings.EXPORT_MAX_PENDING_PER_USER:
            return Response(
                {"error": "Too many exports are already queued or processing."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        provider = request.data.get("provider", False)
        multiple = request.data.get("multiple", False)
        project_ids = request.data.get("project", [])

        if provider in ["csv", "xlsx", "json"]:
            if not project_ids:
                project_ids = Project.objects.filter(
                    workspace__slug=slug,
                    project_projectmember__member=request.user,
                    project_projectmember__is_active=True,
                    archived_at__isnull=True,
                ).values_list("id", flat=True)
                project_ids = [str(project_id) for project_id in project_ids]

            exporter = ExporterHistory.objects.create(
                workspace=workspace,
                project=project_ids,
                initiated_by=request.user,
                provider=provider,
                type="issue_exports",
            )

            issue_export_task.delay(
                provider=exporter.provider,
                workspace_id=workspace.id,
                project_ids=project_ids,
                token_id=exporter.token,
                multiple=multiple,
                slug=slug,
            )
            return Response(
                {"message": "Once the export is ready you will be able to download it"},
                status=status.HTTP_200_OK,
            )
        else:
            return Response(
                {"error": f"Provider '{provider}' not found."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        # Export URLs are authorization-bearing presigned links. Keep each
        # user's history private even when multiple members share a workspace.
        exporter_history = ExporterHistory.objects.filter(
            workspace__slug=slug,
            type="issue_exports",
            initiated_by=request.user,
        ).select_related("workspace", "initiated_by")

        if request.GET.get("per_page", False) and request.GET.get("cursor", False):
            return self.paginate(
                order_by=request.GET.get("order_by", "-created_at"),
                request=request,
                queryset=exporter_history,
                on_results=lambda exporter_history: ExporterHistorySerializer(exporter_history, many=True).data,
            )
        else:
            return Response(
                {"error": "per_page and cursor are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
