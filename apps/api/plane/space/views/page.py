# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from bs4 import BeautifulSoup
from django.db.models import F, Q, TextField
from django.db.models.functions import Cast
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .base import BaseAPIView
from plane.db.models import DeployBoard, Issue, IssueView, Page, Sticky
from plane.utils.issue_filters import issue_filters


def _extract_doc_embed_refs(description_html):
    soup = BeautifulSoup(description_html or "", "html.parser")
    refs = []
    for node in soup.find_all("doc-embed-component"):
        embed_type = node.get("embed_type")
        entity_id = node.get("entity_identifier")
        workspace_slug = node.get("workspace_identifier")
        project_id = node.get("project_identifier")
        if embed_type and entity_id and workspace_slug:
            refs.append(
                {
                    "embed_type": embed_type,
                    "entity_id": entity_id,
                    "workspace_slug": workspace_slug,
                    "project_id": project_id,
                    "title": node.get("title"),
                }
            )
    return refs


def _unavailable_embed(ref):
    return {
        "embed_type": ref["embed_type"],
        "entity_id": ref["entity_id"],
        "available": False,
        "title": ref.get("title") or "Unavailable embed",
    }


def _resolve_public_embed(ref):
    embed_type = ref["embed_type"]
    entity_id = ref["entity_id"]
    workspace_slug = ref["workspace_slug"]

    if embed_type == "whiteboard":
        page = (
            Page.objects.filter(
                id=entity_id,
                workspace__slug=workspace_slug,
                page_type=Page.PAGE_TYPE_WHITEBOARD,
                access=Page.PUBLIC_ACCESS,
                archived_at__isnull=True,
            )
            .only("id", "name", "description_json", "updated_at")
            .first()
        )
        if not page:
            return _unavailable_embed(ref)
        return {
            "embed_type": embed_type,
            "entity_id": entity_id,
            "available": True,
            "title": page.name or "Untitled whiteboard",
            "snapshot": (page.description_json or {}).get("tldraw_snapshot"),
            "updated_at": page.updated_at,
        }

    if embed_type == "sticky":
        # Stickies are personal workspace notes today. Published docs keep the
        # block visible without exposing private note body.
        sticky = Sticky.objects.filter(id=entity_id, workspace__slug=workspace_slug).only("id", "name").first()
        if not sticky:
            return _unavailable_embed(ref)
        return {
            "embed_type": embed_type,
            "entity_id": entity_id,
            "available": False,
            "title": sticky.name or ref.get("title") or "Sticky",
        }

    if embed_type == "task_view":
        view = (
            IssueView.objects.filter(id=entity_id, workspace__slug=workspace_slug, access=1, archived_at__isnull=True)
            .select_related("project")
            .first()
        )
        if not view:
            return _unavailable_embed(ref)
        is_published = DeployBoard.objects.filter(
            workspace__slug=workspace_slug,
            entity_name__in=["project", "view"],
            entity_identifier__in=[view.project_id, view.id],
            is_disabled=False,
        ).exists()
        if not is_published:
            return {
                "embed_type": embed_type,
                "entity_id": entity_id,
                "available": False,
                "title": view.name,
            }
        filters = issue_filters(view.filters or {}, "GET") if view.filters else {}
        issues = (
            Issue.issue_objects.filter(workspace__slug=workspace_slug, project_id=view.project_id, **filters)
            .order_by("-created_at")
            .values("id", "name", "sequence_id", "priority", "state_id")[:6]
        )
        return {
            "embed_type": embed_type,
            "entity_id": entity_id,
            "available": True,
            "title": view.name,
            "project_id": str(view.project_id),
            "issues": list(issues),
        }

    return _unavailable_embed(ref)


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
                "embeds": [_resolve_public_embed(ref) for ref in _extract_doc_embed_refs(page.description_html)],
                "logo_props": page.logo_props,
                "updated_at": page.updated_at,
                "public_slug": page.view_props.get("public_slug") if isinstance(page.view_props, dict) else None,
            },
            status=status.HTTP_200_OK,
        )
