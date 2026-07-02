# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import DatabaseError
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import ProjectBookmarkCommentSerializer, ProjectBookmarkSerializer
from plane.app.views.base import BaseAPIView, BaseViewSet
from plane.bgtasks.work_item_link_task import find_favicon_url, safe_get, validate_url_ip
from plane.db.models import (
    Project,
    ProjectBookmark,
    ProjectBookmarkComment,
    ProjectMember,
    WorkspaceMember,
)
from plane.utils.exception_logger import log_exception

# Mirrors the og:/twitter: selectors the browser extension reads, so in-app
# bookmarks and extension-captured bookmarks resolve the same preview image.
BOOKMARK_FETCH_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
}
MAX_BOOKMARK_HTML_BYTES = 2_000_000


def _meta_content(soup, *selectors):
    """Return the first non-empty content/href among the given CSS selectors."""
    for selector in selectors:
        tag = soup.select_one(selector)
        if tag:
            value = (tag.get("content") or tag.get("href") or "").strip()
            if value:
                return value
    return ""


def _positive_int(value):
    """Coerce an OG width/height string to a positive int, or None."""
    try:
        number = int(str(value).strip())
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def fetch_bookmark_metadata(url):
    """
    Fetch a URL server-side and extract Open Graph / Twitter card metadata.

    SSRF is handled by safe_get/validate_url_ip (scheme allow-list + per-hop
    private/loopback/reserved/link-local IP checks). Raises ValueError for
    blocked URLs and requests.RequestException/RuntimeError on network issues.
    """
    response, final_url = safe_get(url, headers=BOOKMARK_FETCH_HEADERS, timeout=5)
    netloc = urlparse(final_url).netloc

    if response.status_code >= 400:
        return {
            "title": "",
            "description": "",
            "url": final_url,
            "metadata": {"site_name": netloc, "source_app": "web"},
        }

    content_type = response.headers.get("content-type", "").lower()

    # A direct link to an image is its own preview.
    if content_type.startswith("image/"):
        return {
            "title": "",
            "description": "",
            "url": final_url,
            "metadata": {
                "site_name": netloc,
                "source_app": "web",
                "image_url": final_url,
                "og_image_url": final_url,
            },
        }

    if "html" not in content_type:
        return {
            "title": "",
            "description": "",
            "url": final_url,
            "metadata": {"site_name": netloc, "source_app": "web"},
        }

    soup = BeautifulSoup(response.content[:MAX_BOOKMARK_HTML_BYTES], "html.parser")

    def absolute(value):
        return urljoin(final_url, value) if value else ""

    image_url = _meta_content(
        soup,
        'meta[property="og:image:secure_url"]',
        'meta[property="og:image:url"]',
        'meta[property="og:image"]',
        'meta[name="twitter:image"]',
        'meta[name="twitter:image:src"]',
    )
    image_width = _positive_int(_meta_content(soup, 'meta[property="og:image:width"]'))
    image_height = _positive_int(_meta_content(soup, 'meta[property="og:image:height"]'))
    title = _meta_content(soup, 'meta[property="og:title"]', 'meta[name="twitter:title"]')
    if not title:
        title_tag = soup.find("title")
        title = title_tag.get_text().strip() if title_tag else ""
    description = _meta_content(
        soup,
        'meta[property="og:description"]',
        'meta[name="twitter:description"]',
        'meta[name="description"]',
    )
    site_name = _meta_content(soup, 'meta[property="og:site_name"]', 'meta[name="application-name"]')
    canonical = _meta_content(soup, 'meta[property="og:url"]', 'link[rel="canonical"]')

    try:
        favicon_url = find_favicon_url(soup, final_url) or ""
    except (ValueError, requests.RequestException, RuntimeError):
        favicon_url = ""

    metadata = {"site_name": site_name or netloc, "source_app": "web"}
    image_absolute = absolute(image_url)
    if image_absolute:
        metadata["image_url"] = image_absolute
        metadata["og_image_url"] = image_absolute
        if image_width and image_height:
            metadata["image_width"] = image_width
            metadata["image_height"] = image_height
    if title:
        metadata["og_title"] = title
    if description:
        metadata["og_description"] = description
    canonical_absolute = absolute(canonical)
    if canonical_absolute:
        metadata["og_url"] = canonical_absolute
    if favicon_url:
        metadata["favicon_url"] = favicon_url

    return {"title": title, "description": description, "url": final_url, "metadata": metadata}


class ProjectBookmarkViewSet(BaseViewSet):
    serializer_class = ProjectBookmarkSerializer
    model = ProjectBookmark
    use_read_replica = True
    MAX_IMPORT_SIZE = 2000

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
            # Kick off AI tag suggestions in the background. No-op if no LLM is
            # configured; never blocks or fails the create response.
            if bookmark.url:
                try:
                    from plane.bgtasks.auto_tag_bookmark_task import auto_tag_bookmark_task

                    auto_tag_bookmark_task.delay(str(bookmark.id))
                except Exception as exc:
                    log_exception(exc)
            return Response(ProjectBookmarkSerializer(bookmark).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def bulk_create(self, request, slug, project_id):
        project = Project.objects.filter(pk=project_id, workspace__slug=slug).first()
        if project is None:
            return Response({"error": "The selected project does not exist."}, status=status.HTTP_404_NOT_FOUND)

        data = request.data
        payload = data.get("bookmarks", data) if isinstance(data, dict) else data
        if not isinstance(payload, list):
            return Response({"error": "Provide a list of bookmarks to import."}, status=status.HTTP_400_BAD_REQUEST)
        if not payload:
            return Response({"error": "No bookmarks to import."}, status=status.HTTP_400_BAD_REQUEST)
        if len(payload) > self.MAX_IMPORT_SIZE:
            return Response(
                {"error": f"You can import up to {self.MAX_IMPORT_SIZE} bookmarks at a time."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        created = []
        errors = []
        for index, item in enumerate(payload):
            if not isinstance(item, dict):
                errors.append({"index": index, "error": "Each bookmark must be an object."})
                continue
            serializer = ProjectBookmarkSerializer(data=item)
            if not serializer.is_valid():
                errors.append({"index": index, "error": serializer.errors})
                continue
            try:
                bookmark = serializer.save(
                    project=project,
                    workspace=project.workspace,
                    created_by=request.user,
                    updated_by=request.user,
                )
                created.append(bookmark)
            except DjangoValidationError as exc:
                error = exc.message_dict if hasattr(exc, "message_dict") else exc.messages
                errors.append({"index": index, "error": error})
            except DatabaseError as exc:
                log_exception(exc)
                return Response(
                    {"error": "Bookmark storage is not ready. Run API database migrations and try again."},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )

        return Response(
            {
                "bookmarks": ProjectBookmarkSerializer(created, many=True).data,
                "created_count": len(created),
                "skipped_count": len(errors),
                "errors": errors,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

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
    def move(self, request, slug, project_id, pk):
        bookmark = self.get_queryset().get(pk=pk)
        if not self.can_mutate(request, slug, bookmark):
            return Response({"error": "You don't have the required permissions."}, status=status.HTTP_403_FORBIDDEN)

        target_project_id = request.data.get("project_id")
        if not target_project_id:
            return Response({"error": "A target project is required."}, status=status.HTTP_400_BAD_REQUEST)

        # No-op when the bookmark already lives in the requested project.
        if str(target_project_id) == str(bookmark.project_id):
            return Response(ProjectBookmarkSerializer(bookmark).data, status=status.HTTP_200_OK)

        target = Project.objects.filter(pk=target_project_id, workspace__slug=slug).first()
        if target is None:
            return Response({"error": "The selected project does not exist."}, status=status.HTTP_404_NOT_FOUND)

        # The mover must be an admin/member of the destination project too.
        can_write_target = ProjectMember.objects.filter(
            member=request.user,
            workspace__slug=slug,
            project_id=target_project_id,
            role__in=[ROLE.ADMIN.value, ROLE.MEMBER.value],
            is_active=True,
        ).exists()
        if not can_write_target:
            return Response(
                {"error": "You don't have access to the selected project."}, status=status.HTTP_403_FORBIDDEN
            )

        bookmark.project = target
        bookmark.updated_by = request.user
        bookmark.save(update_fields=["project", "updated_by", "updated_at"])
        # Keep comments queryable under the bookmark's new project scope.
        ProjectBookmarkComment.objects.filter(bookmark=bookmark).update(project=target)
        return Response(ProjectBookmarkSerializer(bookmark).data, status=status.HTTP_200_OK)

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


class ProjectBookmarkCommentViewSet(BaseViewSet):
    serializer_class = ProjectBookmarkCommentSerializer
    model = ProjectBookmarkComment

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(bookmark_id=self.kwargs.get("bookmark_id"))
            .select_related("actor")
            .order_by("created_at")
        )

    def is_project_admin(self, request, slug, project_id):
        return ProjectMember.objects.filter(
            member=request.user,
            workspace__slug=slug,
            project_id=project_id,
            role=ROLE.ADMIN.value,
            is_active=True,
        ).exists() or WorkspaceMember.objects.filter(
            member=request.user,
            workspace__slug=slug,
            role=ROLE.ADMIN.value,
            is_active=True,
        ).exists()

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="PROJECT")
    def list(self, request, slug, project_id, bookmark_id):
        comments = self.get_queryset()
        return Response(ProjectBookmarkCommentSerializer(comments, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def create(self, request, slug, project_id, bookmark_id):
        bookmark = ProjectBookmark.objects.filter(
            pk=bookmark_id, project_id=project_id, workspace__slug=slug
        ).first()
        if bookmark is None:
            return Response({"error": "Bookmark not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = ProjectBookmarkCommentSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(
                bookmark=bookmark,
                project=bookmark.project,
                workspace=bookmark.workspace,
                actor=request.user,
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def partial_update(self, request, slug, project_id, bookmark_id, pk):
        comment = self.get_queryset().get(pk=pk)
        if comment.actor_id != request.user.id:
            return Response({"error": "You can only edit your own comments."}, status=status.HTTP_403_FORBIDDEN)
        serializer = ProjectBookmarkCommentSerializer(comment, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save(edited_at=timezone.now())
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def destroy(self, request, slug, project_id, bookmark_id, pk):
        comment = self.get_queryset().get(pk=pk)
        if comment.actor_id != request.user.id and not self.is_project_admin(request, slug, project_id):
            return Response({"error": "You don't have the required permissions."}, status=status.HTTP_403_FORBIDDEN)
        comment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


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


class BookmarkMetadataEndpoint(BaseAPIView):
    """Unfurl a URL server-side and return Open Graph metadata for the add-bookmark form."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug):
        url = (request.data.get("url") or "").strip()
        if not url:
            return Response({"error": "A url is required."}, status=status.HTTP_400_BAD_REQUEST)

        # Default to https when the user pastes a bare domain (example.com).
        if not urlparse(url).scheme:
            url = f"https://{url}"

        try:
            data = fetch_bookmark_metadata(url)
        except ValueError as exc:
            # Blocked by the SSRF guard or an otherwise invalid/unresolvable URL.
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except (requests.RequestException, RuntimeError) as exc:
            # Network/timeout/too-many-redirects: best-effort, let manual entry continue.
            log_exception(exc)
            return Response(
                {"title": "", "description": "", "url": url, "metadata": {}},
                status=status.HTTP_200_OK,
            )

        return Response(data, status=status.HTTP_200_OK)
