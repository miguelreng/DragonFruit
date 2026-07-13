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
from plane.db.models import DeployBoard, Issue, IssueView, Page, Project, Sticky, WorkspaceMember
from plane.utils.issue_filters import issue_filters


def _public_page_owner_payload(page):
    owner = page.owned_by
    return {
        "id": str(owner.id),
        "display_name": owner.display_name,
        "avatar_url": owner.avatar_url,
    }


def _public_page_mentions(page):
    """Resolve mention-component ids in the page body to display labels.

    description_html serializes mentions as empty custom elements, so the
    public view can't show them without these lookups. Scoped to the page's
    own workspace so forged ids can't leak data from other workspaces.
    """
    soup = BeautifulSoup(page.description_html or "", "html.parser")
    user_ids = set()
    issue_ids = set()
    for node in soup.find_all("mention-component"):
        entity_name = node.get("entity_name")
        entity_id = node.get("entity_identifier")
        if not entity_id:
            continue
        if entity_name == "user_mention":
            user_ids.add(entity_id)
        elif entity_name == "issue":
            issue_ids.add(entity_id)

    users = {}
    if user_ids:
        members = WorkspaceMember.objects.filter(
            workspace=page.workspace, member_id__in=user_ids, is_active=True
        ).select_related("member")
        users = {str(m.member_id): m.member.display_name for m in members}

    issues = {}
    if issue_ids:
        for issue in Issue.issue_objects.filter(workspace=page.workspace, id__in=issue_ids).select_related("project"):
            issues[str(issue.id)] = f"{issue.project.identifier}-{issue.sequence_id} {issue.name}"

    return {"users": users, "issues": issues}


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
            "snapshot": (page.description_json or {}).get("excalidraw_snapshot"),
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


def _public_wiki_docs(folder):
    """Child docs of a published wiki folder, in reader order.

    Publishing the folder is the explicit act that exposes its docs, so every
    unarchived doc child is included unless the owner hid it in Wiki settings
    (view_props.wiki.hidden). view_props.wiki.order (list of page ids) wins;
    docs not listed there keep creation order after the ordered ones.
    """
    children = list(
        Page.objects.filter(
            workspace_id=folder.workspace_id,
            parent_id=folder.id,
            page_type=Page.PAGE_TYPE_DOC,
            archived_at__isnull=True,
        ).order_by("created_at")
    )
    view_props = folder.view_props if isinstance(folder.view_props, dict) else {}
    wiki_props = view_props.get("wiki") if isinstance(view_props.get("wiki"), dict) else {}
    hidden = {str(page_id) for page_id in (wiki_props.get("hidden") or []) if page_id}
    children = [page for page in children if str(page.id) not in hidden]
    order = [str(page_id) for page_id in (wiki_props.get("order") or []) if page_id]
    rank = {page_id: index for index, page_id in enumerate(order)}
    children.sort(key=lambda page: (rank.get(str(page.id), len(order)),))

    return [
        {
            "id": str(page.id),
            "name": page.name,
            "description_html": page.description_html,
            "mentions": _public_page_mentions(page),
            "updated_at": page.updated_at,
        }
        for page in children
    ]


def _page_by_public_slug(workspace_slug, page_slug, **extra_filters):
    return (
        Page.objects.filter(
            workspace__slug=workspace_slug,
            archived_at__isnull=True,
            **extra_filters,
        )
        .select_related("owned_by")
        .annotate(id_slug=Cast(F("id"), output_field=TextField()))
        .filter(
            Q(view_props__public_slug=page_slug)
            | Q(view_props__public_slug__isnull=True, id_slug=page_slug)
            | Q(view_props__public_slug="", id_slug=page_slug)
        )
        .prefetch_related("projects")
        .first()
    )


class PublicPageBySlugEndpoint(BaseAPIView):
    permission_classes = [AllowAny]

    def get(self, request, workspace_slug, page_slug):
        page = _page_by_public_slug(workspace_slug, page_slug, access=Page.PUBLIC_ACCESS)
        is_preview = False

        # Owner preview: an UNPUBLISHED wiki folder still renders for signed-in
        # workspace members so they can see the reader before publishing. Only
        # folders — private doc publishing semantics stay untouched.
        if not page and request.user and request.user.is_authenticated:
            candidate = _page_by_public_slug(workspace_slug, page_slug, page_type=Page.PAGE_TYPE_FOLDER)
            if (
                candidate
                and WorkspaceMember.objects.filter(
                    workspace_id=candidate.workspace_id, member=request.user, is_active=True
                ).exists()
            ):
                page = candidate
                is_preview = True

        if not page:
            return Response({"error": "Page not found"}, status=status.HTTP_404_NOT_FOUND)

        project = page.projects.filter(archived_at__isnull=True).first()

        return Response(
            {
                "is_preview": is_preview,
                "wiki_docs": _public_wiki_docs(page) if page.page_type == Page.PAGE_TYPE_FOLDER else None,
                "id": str(page.id),
                "workspace_slug": workspace_slug,
                "project_id": str(project.id) if project else None,
                "name": page.name,
                "page_type": page.page_type,
                "description_html": page.description_html,
                "description_json": page.description_json,
                "embeds": [_resolve_public_embed(ref) for ref in _extract_doc_embed_refs(page.description_html)],
                "mentions": _public_page_mentions(page),
                "logo_props": page.logo_props,
                "owned_by": _public_page_owner_payload(page),
                "updated_at": page.updated_at,
                "view_props": page.view_props,
                "public_slug": page.view_props.get("public_slug") if isinstance(page.view_props, dict) else None,
            },
            status=status.HTTP_200_OK,
        )


class PublicProjectPagesEndpoint(BaseAPIView):
    permission_classes = [AllowAny]

    def get(self, request, workspace_slug, project_id):
        project_exists = Project.objects.filter(
            id=project_id,
            workspace__slug=workspace_slug,
            archived_at__isnull=True,
        ).exists()

        if not project_exists:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

        pages = (
            Page.objects.filter(
                workspace__slug=workspace_slug,
                projects__id=project_id,
                access=Page.PUBLIC_ACCESS,
                page_type=Page.PAGE_TYPE_DOC,
                archived_at__isnull=True,
            )
            .select_related("owned_by")
            .distinct()
            .order_by("-created_at")
        )

        return Response(
            [
                {
                    "id": str(page.id),
                    "workspace_slug": workspace_slug,
                    "project_id": str(project_id),
                    "name": page.name,
                    "page_type": page.page_type,
                    "description_html": page.description_html,
                    "description_stripped": page.description_stripped,
                    "logo_props": page.logo_props,
                    "owned_by": _public_page_owner_payload(page),
                    "created_at": page.created_at,
                    "updated_at": page.updated_at,
                    "view_props": page.view_props,
                    "public_slug": page.view_props.get("public_slug") if isinstance(page.view_props, dict) else None,
                }
                for page in pages
            ],
            status=status.HTTP_200_OK,
        )
