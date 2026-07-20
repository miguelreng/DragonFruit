# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Ingest endpoint for "captured chats" — AI conversations imported from
Claude / ChatGPT / Gemini by the browser extension.

A captured chat is stored as a normal doc Page (so it reuses the collaborative
editor and is readable by the Atlas agent via its search_docs / read_doc tools)
flagged with is_captured_chat=True. external_source + external_id make a
re-import of the same conversation update the existing page in place rather
than creating a duplicate.
"""

import html as html_lib

from django.db import DatabaseError
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import PageDetailSerializer
from plane.db.models import Page, Project, ProjectPage
from plane.utils.content_validator import validate_html_content
from plane.utils.exception_logger import log_exception

from ..base import BaseAPIView
from plane.bgtasks.page_transaction_task import page_transaction

# Sources we know how to capture. The extension sends one of these; anything
# else is rejected so a typo can't silently create an unlabelled artifact.
SOURCE_LABELS = {
    "claude": "Claude",
    "chatgpt": "ChatGPT",
    "gemini": "Gemini",
}

# Sources for the sibling "captured pages" ingest (whole documents/issues/tasks
# scraped from other tools by the extension, not chat transcripts). Kept separate
# from the chat SOURCE_LABELS so the two ingests can't be confused for one another.
PAGE_SOURCE_LABELS = {
    "notion": "Notion",
    "linear": "Linear",
    "asana": "Asana",
    "jira": "Jira",
    "clickup": "ClickUp",
}

# Guardrails so a runaway page or a malformed payload can't blow up the editor
# or the row. The HTML sanitizer enforces its own 10MB ceiling on top of this.
MAX_MESSAGES = 2000
MAX_MESSAGE_HTML_CHARS = 200_000
MAX_TITLE_CHARS = 300

# A whole captured page can be much larger than a single chat turn; the HTML
# sanitizer still enforces its own 10MB ceiling on top of this trim.
MAX_PAGE_HTML_CHARS = 2_000_000


def _role_label(role: str, source_label: str) -> str:
    """Heading shown above each turn. The human is always "You"; the assistant
    is named after its source so a mixed reading list stays legible."""
    normalized = (role or "").strip().lower()
    if normalized in ("user", "human", "you"):
        return "You"
    if normalized in ("assistant", "ai", "model", "bot"):
        return source_label
    return normalized.capitalize() or source_label


def _clean_message_html(raw_html: str) -> str:
    """Sanitize a single turn's HTML to the editor-safe tag/attribute subset.

    Returns "" when the turn is empty or sanitizes away to nothing so callers
    can skip it.
    """
    if not raw_html:
        return ""
    raw_html = raw_html[:MAX_MESSAGE_HTML_CHARS]
    is_valid, _error, clean = validate_html_content(raw_html)
    if not is_valid:
        return ""
    return (clean or "").strip()


def _render_chat_html(*, source_label: str, source_url: str, messages: list) -> str:
    """Compose the full doc body: a small provenance line, then each turn under
    a role heading. Output is clean semantic HTML the doc editor renders directly."""
    parts: list[str] = []

    provenance = f"Imported from {html_lib.escape(source_label)}"
    if source_url:
        safe_url = html_lib.escape(source_url, quote=True)
        provenance += f' · <a href="{safe_url}">original conversation</a>'
    parts.append(f"<p>{provenance}</p>")
    parts.append("<hr />")

    for message in messages:
        if not isinstance(message, dict):
            continue
        body = _clean_message_html(message.get("html") or message.get("content") or "")
        if not body:
            continue
        label = _role_label(message.get("role", ""), source_label)
        parts.append(f"<h3>{html_lib.escape(label)}</h3>")
        parts.append(body)

    return "".join(parts)


class CapturedChatIngestEndpoint(BaseAPIView):
    """POST a captured AI conversation and store it as a doc Page artifact."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def post(self, request, slug, project_id):
        project = Project.objects.filter(pk=project_id, workspace__slug=slug).first()
        if project is None:
            return Response(
                {"error": "The selected project does not exist."},
                status=status.HTTP_404_NOT_FOUND,
            )

        source = str(request.data.get("source", "")).strip().lower()
        if source not in SOURCE_LABELS:
            return Response(
                {"error": f"Unsupported source. Expected one of: {', '.join(SOURCE_LABELS)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        source_label = SOURCE_LABELS[source]

        messages = request.data.get("messages")
        if not isinstance(messages, list) or not messages:
            return Response(
                {"error": "Provide a non-empty list of messages."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(messages) > MAX_MESSAGES:
            messages = messages[:MAX_MESSAGES]

        external_id = str(request.data.get("external_id", "")).strip() or None
        source_url = str(request.data.get("source_url", "")).strip()

        description_html = _render_chat_html(
            source_label=source_label,
            source_url=source_url,
            messages=messages,
        )
        if not description_html or description_html.endswith("<hr />"):
            return Response(
                {"error": "No readable conversation content was found in the payload."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw_title = str(request.data.get("title", "")).strip()
        name = (raw_title or f"{source_label} conversation")[:MAX_TITLE_CHARS]

        try:
            # Idempotency: a re-import of the same conversation (same source +
            # external_id) into the same project updates the page in place.
            existing = None
            if external_id:
                existing = (
                    Page.objects.filter(
                        workspace=project.workspace,
                        is_captured_chat=True,
                        external_source=source,
                        external_id=external_id,
                        project_pages__project_id=project.id,
                        project_pages__deleted_at__isnull=True,
                        deleted_at__isnull=True,
                    )
                    .order_by("-updated_at")
                    .first()
                )

            if existing is not None:
                existing.name = name
                existing.description_html = description_html
                # Clear the Yjs blob so the live server reseeds the editor from
                # the fresh HTML instead of unioning with stale binary state.
                existing.description_binary = None
                existing.updated_by = request.user
                existing.save()
                page = existing
                created = False
            else:
                page = Page.objects.create(
                    name=name,
                    page_type=Page.PAGE_TYPE_DOC,
                    description_html=description_html,
                    description_binary=None,
                    is_captured_chat=True,
                    external_source=source,
                    external_id=external_id,
                    owned_by=request.user,
                    workspace=project.workspace,
                    created_by=request.user,
                    updated_by=request.user,
                )
                ProjectPage.objects.create(
                    workspace=project.workspace,
                    project=project,
                    page=page,
                    created_by=request.user,
                    updated_by=request.user,
                )
                created = True
        except DatabaseError as exc:
            log_exception(exc)
            return Response(
                {"error": "Page storage is not ready. Run API database migrations and try again."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        # Capture page history / backlinks; never block the response on it.
        try:
            page_transaction.delay(
                new_description_html=description_html,
                old_description_html=None,
                page_id=str(page.id),
            )
        except Exception as exc:  # noqa: BLE001
            log_exception(exc)

        data = PageDetailSerializer(page).data
        data.update(
            {
                "workspace_slug": slug,
                "project_id": str(project.id),
                "web_url": f"/{slug}/projects/{project.id}/pages/{page.id}",
                "created": created,
            }
        )
        return Response(
            data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


def _render_page_html(*, source_label: str, source_url: str, body_html: str) -> str:
    """Compose the captured doc body: a small provenance line, then the page's
    own content. `body_html` is expected to be pre-sanitized by the caller."""
    parts: list[str] = []

    provenance = f"Imported from {html_lib.escape(source_label)}"
    if source_url:
        safe_url = html_lib.escape(source_url, quote=True)
        provenance += f' · <a href="{safe_url}">original page</a>'
    parts.append(f"<p>{provenance}</p>")
    parts.append("<hr />")
    parts.append(body_html)

    return "".join(parts)


class CapturedPageIngestEndpoint(BaseAPIView):
    """POST a whole page scraped from another tool (Notion, etc.) and store it as
    a doc Page artifact.

    Unlike a captured chat this is a normal doc — is_captured_chat stays False —
    but external_source + external_id are still set so a re-import of the same
    source page updates the existing doc in place instead of duplicating it.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def post(self, request, slug, project_id):
        project = Project.objects.filter(pk=project_id, workspace__slug=slug).first()
        if project is None:
            return Response(
                {"error": "The selected project does not exist."},
                status=status.HTTP_404_NOT_FOUND,
            )

        source = str(request.data.get("source", "")).strip().lower()
        if source not in PAGE_SOURCE_LABELS:
            return Response(
                {"error": f"Unsupported source. Expected one of: {', '.join(PAGE_SOURCE_LABELS)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        source_label = PAGE_SOURCE_LABELS[source]

        raw_body = request.data.get("html")
        if not isinstance(raw_body, str) or not raw_body.strip():
            return Response(
                {"error": "Provide the page HTML to import."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Sanitize the whole page body to the editor-safe subset. We validate
        # directly (rather than via _clean_message_html) so the larger page cap
        # applies instead of the per-chat-turn one.
        is_valid, _error, clean_body = validate_html_content(raw_body[:MAX_PAGE_HTML_CHARS])
        body_html = (clean_body or "").strip() if is_valid else ""
        if not body_html:
            return Response(
                {"error": "No readable content was found on the page."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        external_id = str(request.data.get("external_id", "")).strip() or None
        source_url = str(request.data.get("source_url", "")).strip()

        description_html = _render_page_html(
            source_label=source_label,
            source_url=source_url,
            body_html=body_html,
        )

        raw_title = str(request.data.get("title", "")).strip()
        name = (raw_title or f"{source_label} page")[:MAX_TITLE_CHARS]

        try:
            # Idempotency: a re-import of the same source page (same source +
            # external_id) into the same project updates the doc in place.
            existing = None
            if external_id:
                existing = (
                    Page.objects.filter(
                        workspace=project.workspace,
                        is_captured_chat=False,
                        external_source=source,
                        external_id=external_id,
                        project_pages__project_id=project.id,
                        project_pages__deleted_at__isnull=True,
                        deleted_at__isnull=True,
                    )
                    .order_by("-updated_at")
                    .first()
                )

            if existing is not None:
                existing.name = name
                existing.description_html = description_html
                # Clear the Yjs blob so the live server reseeds the editor from
                # the fresh HTML instead of unioning with stale binary state.
                existing.description_binary = None
                existing.updated_by = request.user
                existing.save()
                page = existing
                created = False
            else:
                page = Page.objects.create(
                    name=name,
                    page_type=Page.PAGE_TYPE_DOC,
                    description_html=description_html,
                    description_binary=None,
                    external_source=source,
                    external_id=external_id,
                    owned_by=request.user,
                    workspace=project.workspace,
                    created_by=request.user,
                    updated_by=request.user,
                )
                ProjectPage.objects.create(
                    workspace=project.workspace,
                    project=project,
                    page=page,
                    created_by=request.user,
                    updated_by=request.user,
                )
                created = True
        except DatabaseError as exc:
            log_exception(exc)
            return Response(
                {"error": "Page storage is not ready. Run API database migrations and try again."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        # Capture page history / backlinks; never block the response on it.
        try:
            page_transaction.delay(
                new_description_html=description_html,
                old_description_html=None,
                page_id=str(page.id),
            )
        except Exception as exc:  # noqa: BLE001
            log_exception(exc)

        data = PageDetailSerializer(page).data
        data.update(
            {
                "workspace_slug": slug,
                "project_id": str(project.id),
                "web_url": f"/{slug}/projects/{project.id}/pages/{page.id}",
                "created": created,
            }
        )
        return Response(
            data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
