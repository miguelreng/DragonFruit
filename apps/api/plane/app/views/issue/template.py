# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Workspace-scoped Work Item (Task) Templates.

Mirrors the shape of `apps/api/plane/app/views/page/template.py`. Browse +
instantiate is open to any workspace member; authoring (create / edit /
delete) is admin-only. Instantiating creates a real Issue in a target
project with the template's defaults applied — anything the caller passes
in the request body overrides the template default.
"""

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import allow_permission, ROLE
from plane.app.serializers import (
    IssueSerializer,
    WorkItemTemplateDetailSerializer,
    WorkItemTemplateListSerializer,
)
from plane.db.models import (
    Issue,
    IssueAssignee,
    IssueLabel,
    Project,
    State,
    Workspace,
    WorkItemTemplate,
)

from ..base import BaseAPIView


def _get_workspace(slug: str) -> Workspace:
    return Workspace.objects.get(slug=slug)


class WorkItemTemplateListEndpoint(BaseAPIView):
    """List + create work item templates at the workspace level."""

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        templates = WorkItemTemplate.objects.filter(workspace__slug=slug).select_related("owned_by")
        serializer = WorkItemTemplateListSerializer(templates, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        workspace = _get_workspace(slug)
        serializer = WorkItemTemplateDetailSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save(workspace=workspace, owned_by=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class WorkItemTemplateDetailEndpoint(BaseAPIView):
    """Retrieve / update / delete a single template."""

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, template_id):
        template = WorkItemTemplate.objects.get(workspace__slug=slug, pk=template_id)
        serializer = WorkItemTemplateDetailSerializer(template)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def patch(self, request, slug, template_id):
        template = WorkItemTemplate.objects.get(workspace__slug=slug, pk=template_id)
        serializer = WorkItemTemplateDetailSerializer(template, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug, template_id):
        template = WorkItemTemplate.objects.get(workspace__slug=slug, pk=template_id)
        template.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkItemTemplateInstantiateEndpoint(BaseAPIView):
    """
    Create a new Issue inside the given project, pre-populated with the template's
    defaults. The caller may override `name`, `description_html`, `priority`,
    `assignee_ids`, `label_ids`, and `state_id` in the request body — anything not
    passed falls back to the template's defaults. State falls back to the project's
    first state when neither is provided.

    Returns the freshly-created Issue via IssueSerializer.
    """

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def post(self, request, slug, project_id, template_id):
        template = WorkItemTemplate.objects.get(workspace__slug=slug, pk=template_id)
        project = Project.objects.get(workspace__slug=slug, pk=project_id)

        # Body-or-template-or-default resolution for every field. Caller wins,
        # then template, then a sensible empty.
        name = (request.data.get("name") or template.default_name or template.name or "Untitled task").strip()
        description_html = (
            request.data.get("description_html") or template.default_description_html or "<p></p>"
        )
        priority = request.data.get("priority") or template.default_priority or "none"

        # State: caller can pass a specific state_id, else fall back to the
        # project's first state by sequence (mirrors what the regular issue
        # create path does when no state is provided).
        state_id = request.data.get("state_id")
        if not state_id:
            first_state = State.objects.filter(project_id=project.id).order_by("sequence").first()
            if first_state is None:
                return Response(
                    {"message": "Project has no states configured."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            state_id = first_state.id

        issue = Issue.objects.create(
            workspace_id=project.workspace_id,
            project_id=project.id,
            name=name,
            description_html=description_html,
            priority=priority,
            state_id=state_id,
            created_by=request.user,
            updated_by=request.user,
        )

        # Apply assignees + labels from caller-or-template. Both are scoped to
        # the project — silently skip ids that don't belong (avoids leaking
        # rows from other projects into this issue).
        assignee_ids = request.data.get("assignee_ids") or template.default_assignee_ids or []
        label_ids = request.data.get("label_ids") or template.default_label_ids or []

        if assignee_ids:
            IssueAssignee.objects.bulk_create(
                [
                    IssueAssignee(
                        assignee_id=assignee_id,
                        issue_id=issue.id,
                        project_id=project.id,
                        workspace_id=project.workspace_id,
                        created_by=request.user,
                        updated_by=request.user,
                    )
                    for assignee_id in assignee_ids
                ],
                ignore_conflicts=True,
            )

        if label_ids:
            IssueLabel.objects.bulk_create(
                [
                    IssueLabel(
                        label_id=label_id,
                        issue_id=issue.id,
                        project_id=project.id,
                        workspace_id=project.workspace_id,
                        created_by=request.user,
                        updated_by=request.user,
                    )
                    for label_id in label_ids
                ],
                ignore_conflicts=True,
            )

        return Response(IssueSerializer(issue).data, status=status.HTTP_201_CREATED)
