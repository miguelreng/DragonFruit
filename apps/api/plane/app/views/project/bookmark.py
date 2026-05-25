# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import DatabaseError
from django.db.models import Q
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import ProjectBookmarkSerializer
from plane.app.views.base import BaseAPIView, BaseViewSet
from plane.db.models import Project, ProjectBookmark, ProjectMember, WorkspaceMember
from plane.utils.exception_logger import log_exception


class ProjectBookmarkViewSet(BaseViewSet):
    serializer_class = ProjectBookmarkSerializer
    model = ProjectBookmark
    use_read_replica = True

    def get_queryset(self):
        queryset = (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("workspace", "project", "created_by")
            .distinct()
        )
        project_id = self.kwargs.get("project_id")
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        return self.filter_bookmarks(queryset)

    def filter_bookmarks(self, queryset):
        query = self.request.query_params.get("query")
        tag = self.request.query_params.get("tag")
        project_id = self.request.query_params.get("project_id")
        if query:
            queryset = queryset.filter(
                Q(title__icontains=query)
                | Q(description__icontains=query)
                | Q(url__icontains=query)
                | Q(metadata__captured_text__icontains=query)
            )
        if tag:
            queryset = queryset.filter(tags__contains=[tag])
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        return queryset.order_by("-sort_order", "-created_at")

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="PROJECT")
    def list(self, request, slug, project_id):
        return self.paginate(
            request=request,
            queryset=self.get_queryset(),
            on_results=lambda bookmarks: ProjectBookmarkSerializer(bookmarks, many=True).data,
            default_per_page=50,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def create(self, request, slug, project_id):
        project = Project.objects.filter(pk=project_id, workspace__slug=slug).first()
        if project is None:
            return Response({"error": "The selected project does not exist."}, status=status.HTTP_404_NOT_FOUND)

        serializer = ProjectBookmarkSerializer(data=request.data)
        if serializer.is_valid():
            try:
                bookmark = serializer.save(
                    project=project,
                    workspace=project.workspace,
                    created_by=request.user,
                    updated_by=request.user,
                )
            except DjangoValidationError as exc:
                error = exc.message_dict if hasattr(exc, "message_dict") else exc.messages
                return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)
            except DatabaseError as exc:
                log_exception(exc)
                return Response(
                    {"error": "Bookmark storage is not ready. Run API database migrations and try again."},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
            return Response(ProjectBookmarkSerializer(bookmark).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="PROJECT")
    def retrieve(self, request, slug, project_id, pk):
        bookmark = self.get_queryset().get(pk=pk)
        return Response(ProjectBookmarkSerializer(bookmark).data, status=status.HTTP_200_OK)

    def can_mutate(self, request, slug, bookmark):
        if bookmark.created_by_id == request.user.id:
            return True
        return ProjectMember.objects.filter(
            member=request.user,
            workspace__slug=slug,
            project_id=bookmark.project_id,
            role=ROLE.ADMIN.value,
            is_active=True,
        ).exists() or WorkspaceMember.objects.filter(
            member=request.user,
            workspace__slug=slug,
            role=ROLE.ADMIN.value,
            is_active=True,
        ).exists()

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def partial_update(self, request, slug, project_id, pk):
        bookmark = self.get_queryset().get(pk=pk)
        if not self.can_mutate(request, slug, bookmark):
            return Response({"error": "You don't have the required permissions."}, status=status.HTTP_403_FORBIDDEN)
        serializer = ProjectBookmarkSerializer(bookmark, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def destroy(self, request, slug, project_id, pk):
        bookmark = self.get_queryset().get(pk=pk)
        if not self.can_mutate(request, slug, bookmark):
            return Response({"error": "You don't have the required permissions."}, status=status.HTTP_403_FORBIDDEN)
        if bookmark.created_by_id is None:
            bookmark.created_by = request.user
        bookmark.updated_by = request.user
        bookmark.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceProjectBookmarkViewSet(ProjectBookmarkViewSet):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug):
        project_ids = ProjectMember.objects.filter(
            member=request.user,
            workspace__slug=slug,
            is_active=True,
        ).values_list("project_id", flat=True)
        queryset = self.filter_bookmarks(
            ProjectBookmark.objects.filter(workspace__slug=slug, project_id__in=project_ids)
            .select_related("workspace", "project", "created_by")
            .distinct()
        )
        return self.paginate(
            request=request,
            queryset=queryset,
            on_results=lambda bookmarks: ProjectBookmarkSerializer(bookmarks, many=True).data,
            default_per_page=50,
        )


class BookmarkExtensionContextEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        project_memberships = (
            ProjectMember.objects.filter(
                member=request.user,
                workspace__slug=slug,
                is_active=True,
                role__in=[ROLE.ADMIN.value, ROLE.MEMBER.value],
            )
            .select_related("project", "workspace")
            .order_by("project__name")
        )
        projects = [
            {
                "id": str(membership.project_id),
                "name": membership.project.name,
                "identifier": membership.project.identifier,
                "workspace_slug": slug,
                "workspace_name": membership.workspace.name,
                "role": membership.role,
            }
            for membership in project_memberships
        ]
        return Response(
            {
                "user": {
                    "id": str(request.user.id),
                    "email": request.user.email,
                    "display_name": getattr(request.user, "display_name", request.user.email),
                },
                "workspace_slug": slug,
                "projects": projects,
                "default_project_id": projects[0]["id"] if projects else None,
            },
            status=status.HTTP_200_OK,
        )
