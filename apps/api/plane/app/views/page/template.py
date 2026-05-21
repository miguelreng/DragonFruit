# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Workspace-scoped Page Templates.

Browse + instantiate is open to any workspace member; authoring (create / edit /
delete / save-as) is admin-only. Templates store the same body shape as `Page`
(description_html / _json / _binary), so instantiating a template into a new
Page is a straight field-for-field copy.
"""

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import allow_permission, ROLE
from plane.app.serializers import (
    PageDetailSerializer,
    PageTemplateDetailSerializer,
    PageTemplateListSerializer,
)
from plane.bgtasks.page_transaction_task import page_transaction
from plane.db.models import (
    Page,
    PageTemplate,
    Project,
    ProjectPage,
    Workspace,
)

from ..base import BaseAPIView


def _get_workspace(slug: str) -> Workspace:
    return Workspace.objects.get(slug=slug)


class PageTemplateListEndpoint(BaseAPIView):
    """List + create page templates at the workspace level."""

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        templates = PageTemplate.objects.filter(workspace__slug=slug).select_related("owned_by")
        serializer = PageTemplateListSerializer(templates, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        workspace = _get_workspace(slug)
        serializer = PageTemplateDetailSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        serializer.save(workspace=workspace, owned_by=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class PageTemplateDetailEndpoint(BaseAPIView):
    """Retrieve / update / delete a single template."""

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, template_id):
        template = PageTemplate.objects.get(workspace__slug=slug, pk=template_id)
        serializer = PageTemplateDetailSerializer(template)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def patch(self, request, slug, template_id):
        template = PageTemplate.objects.get(workspace__slug=slug, pk=template_id)
        serializer = PageTemplateDetailSerializer(template, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug, template_id):
        template = PageTemplate.objects.get(workspace__slug=slug, pk=template_id)
        template.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PageTemplateInstantiateEndpoint(BaseAPIView):
    """
    Create a new Page inside the given project, pre-populated with the template's
    body. The caller may override `name` and `logo_props` in the request payload —
    everything else (HTML, JSON, binary, stripped) is copied verbatim.
    """

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def post(self, request, slug, project_id, template_id):
        template = PageTemplate.objects.get(workspace__slug=slug, pk=template_id)
        project = Project.objects.get(workspace__slug=slug, pk=project_id)

        name = request.data.get("name") or template.name
        logo_props = request.data.get("logo_props") or template.logo_props or {}
        access = request.data.get("access", Page.PUBLIC_ACCESS)

        page = Page.objects.create(
            workspace_id=project.workspace_id,
            name=name,
            owned_by=request.user,
            access=access,
            logo_props=logo_props,
            description_html=template.description_html or "<p></p>",
            description_json=template.description_json or {},
            description_binary=template.description_binary,
        )

        ProjectPage.objects.create(
            workspace_id=page.workspace_id,
            project_id=project.id,
            page_id=page.id,
            created_by_id=page.created_by_id,
            updated_by_id=page.updated_by_id,
        )

        # Mirror the regular Page create path so transaction tracking stays consistent.
        page_transaction.delay(
            new_description_html=page.description_html,
            old_description_html=None,
            page_id=str(page.id),
        )

        return Response(PageDetailSerializer(page).data, status=status.HTTP_201_CREATED)


class PageSaveAsTemplateEndpoint(BaseAPIView):
    """
    Save an existing Page as a new template. Body (HTML / JSON / binary) is
    copied verbatim; the caller provides a `name` and optional `description`.
    Admin-only — templates are workspace-shared resources.
    """

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug, page_id):
        page = Page.objects.get(workspace__slug=slug, pk=page_id)
        name = (request.data.get("name") or page.name or "Untitled template").strip()
        description = (request.data.get("description") or "").strip()

        template = PageTemplate.objects.create(
            workspace_id=page.workspace_id,
            name=name[:255],
            description=description[:512],
            logo_props=page.logo_props or {},
            description_html=page.description_html or "<p></p>",
            description_json=page.description_json or {},
            description_binary=page.description_binary,
            owned_by=request.user,
        )
        return Response(PageTemplateDetailSerializer(template).data, status=status.HTTP_201_CREATED)
