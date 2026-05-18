# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.utils import timezone

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import PageBlockCommentSerializer
from plane.db.models import Page, PageBlockComment, Workspace

from ..base import BaseAPIView


class PageBlockCommentEndpoint(BaseAPIView):
    """
    Block-level comments on a page.

    GET    list active (and optionally resolved) comments for a page, grouped by block_id.
    POST   create a comment. Body: { block_id: str, content: str, parent: uuid? }
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, page_id):
        include_resolved = request.GET.get("include_resolved", "false").lower() == "true"
        qs = PageBlockComment.objects.filter(
            workspace__slug=slug,
            page_id=page_id,
        ).select_related("created_by", "resolved_by")
        if not include_resolved:
            qs = qs.filter(resolved_at__isnull=True)
        comments = list(qs.order_by("created_at"))
        return Response(
            {"comments": PageBlockCommentSerializer(comments, many=True).data},
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, page_id):
        block_id = (request.data.get("block_id") or "").strip()
        content = (request.data.get("content") or "").strip()
        parent_id = request.data.get("parent") or None

        if not block_id:
            return Response({"error": "block_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        if not content:
            return Response({"error": "content is required"}, status=status.HTTP_400_BAD_REQUEST)

        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)
        page = Page.objects.filter(id=page_id, workspace=workspace).first()
        if page is None:
            return Response({"error": "Page not found"}, status=status.HTTP_404_NOT_FOUND)

        # If a parent is provided, force its block_id (server-of-truth — clients can't fork a thread).
        if parent_id:
            parent = PageBlockComment.objects.filter(id=parent_id, page=page).first()
            if parent is None:
                return Response({"error": "Parent comment not found"}, status=status.HTTP_400_BAD_REQUEST)
            block_id = parent.block_id

        comment = PageBlockComment.objects.create(
            workspace=workspace,
            page=page,
            block_id=block_id,
            parent_id=parent_id,
            content=content,
            created_by=request.user,
        )
        return Response(
            PageBlockCommentSerializer(comment).data,
            status=status.HTTP_201_CREATED,
        )


class PageBlockCommentDetailEndpoint(BaseAPIView):
    """
    PATCH  update content or toggle resolved. Body keys honored:
             - content: str
             - resolved: bool   (true → mark resolved, false → reopen)
    DELETE soft-delete a comment.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def patch(self, request, slug, project_id, page_id, comment_id):
        comment = PageBlockComment.objects.filter(
            id=comment_id, page_id=page_id, workspace__slug=slug
        ).first()
        if comment is None:
            return Response({"error": "Comment not found"}, status=status.HTTP_404_NOT_FOUND)

        update_fields: list[str] = []
        if "content" in request.data:
            new_content = (request.data.get("content") or "").strip()
            if not new_content:
                return Response({"error": "content cannot be empty"}, status=status.HTTP_400_BAD_REQUEST)
            comment.content = new_content
            update_fields.append("content")

        if "resolved" in request.data:
            if request.data.get("resolved"):
                comment.resolved_at = timezone.now()
                comment.resolved_by = request.user
                update_fields.extend(["resolved_at", "resolved_by"])
            else:
                comment.resolved_at = None
                comment.resolved_by = None
                update_fields.extend(["resolved_at", "resolved_by"])

        if update_fields:
            comment.save(update_fields=update_fields)

        return Response(PageBlockCommentSerializer(comment).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def delete(self, request, slug, project_id, page_id, comment_id):
        comment = PageBlockComment.objects.filter(
            id=comment_id, page_id=page_id, workspace__slug=slug
        ).first()
        if comment is None:
            return Response({"error": "Comment not found"}, status=status.HTTP_404_NOT_FOUND)
        # Authors can delete their own; admins via permission decorator.
        comment.delete(soft=True)
        return Response(status=status.HTTP_204_NO_CONTENT)
