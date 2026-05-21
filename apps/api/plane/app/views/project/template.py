# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Workspace-scoped Project Templates.

Browse is open to any workspace member; authoring is admin-only. The
instantiate endpoint is a per-project create — it builds a fresh
Project from the template's defaults, seeds default states (same as
the regular ProjectViewSet.create path), enrols the caller as Admin,
and bulk-creates any `initial_tasks` defined on the template.
"""

import logging

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import (
    ProjectListSerializer,
    ProjectSerializer,
    ProjectTemplateSerializer,
)  # ProjectTemplateSerializer reused by ProjectSaveAsTemplateEndpoint below
from plane.bgtasks.webhook_task import model_activity
from plane.db.models import (
    DEFAULT_STATES,
    Issue,
    Project,
    ProjectMember,
    ProjectTemplate,
    State,
    Workspace,
)
from plane.utils.host import base_host

from ..base import BaseAPIView


logger = logging.getLogger(__name__)


def _get_workspace(slug: str) -> Workspace:
    return Workspace.objects.get(slug=slug)


class ProjectTemplateListEndpoint(BaseAPIView):
    """List + create project templates at the workspace level."""

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        templates = ProjectTemplate.objects.filter(workspace__slug=slug).select_related("owned_by")
        return Response(ProjectTemplateSerializer(templates, many=True).data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        workspace = _get_workspace(slug)
        serializer = ProjectTemplateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save(workspace=workspace, owned_by=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ProjectTemplateDetailEndpoint(BaseAPIView):
    """Retrieve / update / delete a single template."""

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, template_id):
        template = ProjectTemplate.objects.get(workspace__slug=slug, pk=template_id)
        return Response(ProjectTemplateSerializer(template).data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def patch(self, request, slug, template_id):
        template = ProjectTemplate.objects.get(workspace__slug=slug, pk=template_id)
        serializer = ProjectTemplateSerializer(template, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug, template_id):
        template = ProjectTemplate.objects.get(workspace__slug=slug, pk=template_id)
        template.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectTemplateInstantiateEndpoint(BaseAPIView):
    """Create a project from a template.

    The body shape is the same as POST /projects/ — the user can
    override anything the template provides (name, identifier, etc.).
    After the project is created we mirror the regular create-path
    side-effects (admin enrolment, default states, model activity)
    and finally materialise the template's `initial_tasks`.
    """

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug, template_id):
        workspace = _get_workspace(slug)
        template = ProjectTemplate.objects.filter(workspace=workspace, pk=template_id).first()
        if template is None:
            return Response({"error": "Template not found"}, status=status.HTTP_404_NOT_FOUND)

        # Merge: caller's payload wins (so they can rename / override),
        # template fills in any gaps. Identifier is required and never
        # comes from the template since it must be unique per workspace.
        payload = dict(request.data)
        payload.setdefault("description", template.project_description or "")
        payload.setdefault("network", template.network)
        if template.logo_props:
            payload.setdefault("logo_props", template.logo_props)

        serializer = ProjectSerializer(data=payload, context={"workspace_id": workspace.id})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()

        # Enrol the caller as Admin — mirrors ProjectViewSet.create.
        ProjectMember.objects.create(
            project_id=serializer.data["id"],
            member=request.user,
            role=ROLE.ADMIN.value,
        )

        # Seed default states (Backlog / Unstarted / Started / Completed
        # / Cancelled). Required before we can create initial_tasks
        # since each Issue needs a state.
        State.objects.bulk_create(
            [
                State(
                    name=state_def["name"],
                    color=state_def["color"],
                    project=serializer.instance,
                    sequence=state_def["sequence"],
                    workspace=serializer.instance.workspace,
                    group=state_def["group"],
                    default=state_def.get("default", False),
                    created_by=request.user,
                )
                for state_def in DEFAULT_STATES
            ]
        )

        # Pick the "default" state for the initial tasks. Falls back to
        # the lowest-sequence state if none is flagged default — covers
        # custom seed sets too.
        default_state = (
            State.objects.filter(project=serializer.instance, default=True).order_by("sequence").first()
            or State.objects.filter(project=serializer.instance).order_by("sequence").first()
        )

        initial_tasks = template.initial_tasks or []
        if default_state and isinstance(initial_tasks, list):
            # Resolve a starting sort_order from whatever the project
            # has (none yet — but use 65535 as the Plane default for
            # any new issue with no sibling).
            for index, task in enumerate(initial_tasks):
                if not isinstance(task, dict):
                    continue
                name = (task.get("name") or "").strip()[:255]
                if not name:
                    continue
                try:
                    Issue.objects.create(
                        project=serializer.instance,
                        workspace=serializer.instance.workspace,
                        name=name,
                        description_html=(task.get("description") or "<p></p>"),
                        priority=(task.get("priority") or "none"),
                        state=default_state,
                        sort_order=65535 + (index * 1024),
                        created_by=request.user,
                    )
                except Exception:  # noqa: BLE001 — one bad row shouldn't sink the whole instantiate
                    logger.exception("project template: failed to create initial task index=%s", index)

        # Mirror the regular create-path's model activity so audit
        # logs treat templated projects the same as hand-rolled ones.
        model_activity.delay(
            model_name="project",
            model_id=str(serializer.data["id"]),
            requested_data=payload,
            current_instance=None,
            actor_id=request.user.id,
            slug=slug,
            origin=base_host(request=request, is_app=True),
        )

        return Response(ProjectListSerializer(serializer.instance).data, status=status.HTTP_201_CREATED)


# Cap how many tasks we snapshot when saving a project as a template.
# Templates are seeds, not full project clones — pulling thousands of
# rows would balloon the row payload and make the instantiate flow
# expensive. 50 is generous for a "starter set" and matches the order
# of magnitude users actually curate.
_TEMPLATE_TASK_CAPTURE_LIMIT = 50


class ProjectSaveAsTemplateEndpoint(BaseAPIView):
    """Snapshot an existing project as a new ProjectTemplate.

    Captures the project's description, network, logo_props, plus a
    bounded set of its current top-level (non-sub) issues as
    `initial_tasks`. Sub-issues, attachments, comments, labels, custom
    fields, modules, cycles, and member roles are intentionally not
    captured in v1 — templates are seeds, not snapshots.

    Body shape:
        { name?: str, description?: str, include_tasks?: bool=true }
    """

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug, project_id):
        workspace = _get_workspace(slug)
        project = Project.objects.filter(workspace=workspace, pk=project_id).first()
        if project is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

        # Caller can override the template's display name — defaults to
        # the project name. Stays inside the 255-char model cap.
        name = (request.data.get("name") or project.name or "Untitled template").strip()[:255]
        description = (request.data.get("description") or "").strip()[:512]
        include_tasks = bool(request.data.get("include_tasks", True))

        initial_tasks: list[dict] = []
        if include_tasks:
            issues = (
                Issue.objects.filter(
                    project=project,
                    deleted_at__isnull=True,
                    parent__isnull=True,  # top-level only — sub-issues skipped in v1
                )
                .order_by("sort_order", "created_at")
                .values("name", "description_html", "priority")[:_TEMPLATE_TASK_CAPTURE_LIMIT]
            )
            for issue in issues:
                name_str = (issue.get("name") or "").strip()
                if not name_str:
                    continue
                initial_tasks.append(
                    {
                        "name": name_str[:255],
                        "description": (issue.get("description_html") or "").strip(),
                        "priority": issue.get("priority") or "none",
                    }
                )

        template = ProjectTemplate.objects.create(
            workspace=workspace,
            name=name,
            description=description,
            logo_props=project.logo_props or {},
            project_description=project.description or "",
            network=project.network,
            initial_tasks=initial_tasks,
            owned_by=request.user,
        )
        return Response(ProjectTemplateSerializer(template).data, status=status.HTTP_201_CREATED)
