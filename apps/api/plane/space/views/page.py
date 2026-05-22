# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db.models import F, Q, TextField
from django.db.models.functions import Cast
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .base import BaseAPIView
from plane.db.models import Page


class PublicPageBySlugEndpoint(BaseAPIView):
    permission_classes = [AllowAny]

    def get(self, request, workspace_slug, page_slug):
        page = (
            Page.objects.filter(
                workspace__slug=workspace_slug,
                access=Page.PUBLIC_ACCESS,
                archived_at__isnull=True,
            )
            .annotate(id_slug=Cast(F("id"), output_field=TextField()))
            .filter(
                Q(view_props__public_slug=page_slug)
                | Q(view_props__public_slug__isnull=True, id_slug=page_slug)
                | Q(view_props__public_slug="", id_slug=page_slug)
            )
            .prefetch_related("projects")
            .first()
        )

        if not page:
            return Response({"error": "Page not found"}, status=status.HTTP_404_NOT_FOUND)

        project = page.projects.filter(archived_at__isnull=True).first()

        return Response(
            {
                "id": str(page.id),
                "workspace_slug": workspace_slug,
                "project_id": str(project.id) if project else None,
                "name": page.name,
                "page_type": page.page_type,
                "description_html": page.description_html,
                "description_json": page.description_json,
                "logo_props": page.logo_props,
                "updated_at": page.updated_at,
                "public_slug": page.view_props.get("public_slug") if isinstance(page.view_props, dict) else None,
            },
            status=status.HTTP_200_OK,
        )
