# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ProjectBasePermission, ROLE, allow_permission
from plane.app.serializers import ProjectCustomFieldSerializer
from plane.db.models import ProjectCustomField

from .. import BaseAPIView


class ProjectCustomFieldEndpoint(BaseAPIView):
    permission_classes = [ProjectBasePermission]

    def _queryset(self, slug, project_id):
        return ProjectCustomField.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            deleted_at__isnull=True,
        ).order_by("sort_order", "created_at")

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        fields = self._queryset(slug, project_id)
        serializer = ProjectCustomFieldSerializer(fields, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id):
        serializer = ProjectCustomFieldSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        serializer.save(project_id=project_id)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def patch(self, request, slug, project_id, field_id):
        field = self._queryset(slug, project_id).filter(id=field_id).first()
        if not field:
            return Response({"error": "Custom field not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = ProjectCustomFieldSerializer(field, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def delete(self, request, slug, project_id, field_id):
        field = self._queryset(slug, project_id).filter(id=field_id).first()
        if not field:
            return Response({"error": "Custom field not found."}, status=status.HTTP_404_NOT_FOUND)

        field.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
