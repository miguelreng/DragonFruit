from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4
import hashlib
import hmac
import json
import logging

from celery import shared_task
from django.conf import settings

from plane.bgtasks.agent_webhook_task import dispatch_agent_webhook
from plane.db.models import Page, WorkspaceAgentWebhook
from plane.license.utils.encryption import decrypt_data

logger = logging.getLogger(__name__)


ESSAY_ILLUSTRATION_VIEW_PROPS_KEY = "essay_illustration"
ESSAY_ILLUSTRATION_STATUS_PENDING = "dispatched"
ESSAY_ILLUSTRATION_STATUS_FAILED = "dispatch_failed"
ESSAY_ILLUSTRATION_STATUS_READY = "ready"
ESSAY_ILLUSTRATION_WIDTH = 1536
ESSAY_ILLUSTRATION_HEIGHT = 1024
ESSAY_ILLUSTRATION_ASPECT_RATIO = "3:2"
ESSAY_ILLUSTRATION_STYLE = (
    "DragonFruit landing-page essay illustration: airy Renaissance notebook/engraving line art, "
    "fine pencil-like strokes, lots of white negative space, soft faded edges that blend into a white page, "
    "muted rose-magenta engraving ink only (LP reference color #b33a6e, with lighter tints allowed), "
    "no dark background, no frame, no text, no UI, no logos. "
    "The image should feel related to the essay topic while matching the existing home hero illustration style."
)


def _is_safe(value: object | None) -> bool:
    return isinstance(value, str) and value.strip() != ""


def _get_public_slug(view_props: object | None) -> str:
    if not isinstance(view_props, dict):
        return ""
    return str(view_props.get("public_slug") or "").strip()


def _get_project_id(page_id: str) -> str:
    from plane.db.models import ProjectPage

    first_page_project = (
        ProjectPage.objects.filter(page_id=page_id, deleted_at__isnull=True)
        .order_by("created_at")
        .values_list("project_id", flat=True)
        .first()
    )

    return str(first_page_project) if first_page_project else ""


def _get_essay_illustration_meta(view_props: object | None) -> dict:
    if not isinstance(view_props, dict):
        return {}

    raw = view_props.get(ESSAY_ILLUSTRATION_VIEW_PROPS_KEY)
    return raw if isinstance(raw, dict) else {}


def _has_essay_illustration_request(view_props: object | None) -> bool:
    meta = _get_essay_illustration_meta(view_props)
    return bool(meta)


def _has_ready_illustration(view_props: object | None) -> bool:
    meta = _get_essay_illustration_meta(view_props)
    status = (meta.get("status") or "").strip().lower()
    return status == ESSAY_ILLUSTRATION_STATUS_READY and _is_safe(
        meta.get("src") or meta.get("image") or meta.get("url")
    )


def _is_in_essays_project(page: Page) -> bool:
    configured_project_id = (getattr(settings, "ESSAY_ILLUSTRATION_PROJECT_ID", "") or "").strip()
    if not configured_project_id:
        return False

    from plane.db.models import ProjectPage

    try:
        return ProjectPage.objects.filter(
            page_id=page.id,
            project_id=configured_project_id,
            deleted_at__isnull=True,
        ).exists()
    except Exception:  # noqa: BLE001
        logger.exception("failed to check essay project for page_id=%s", page.id)
        return False


def _build_illustration_prompt(page: Page) -> str:
    title = (page.name or "Untitled essay").strip()
    text = page.description_stripped or ""
    snippet = text.strip().replace("\n", " ")[:1600]
    return (
        "You are an art-direction assistant for DragonFruit essays.\n"
        "Generate a single hero illustration for this essay.\n"
        f"Style: {ESSAY_ILLUSTRATION_STYLE}\n"
        f"Dimensions: {ESSAY_ILLUSTRATION_WIDTH}x{ESSAY_ILLUSTRATION_HEIGHT}px, "
        f"{ESSAY_ILLUSTRATION_ASPECT_RATIO} aspect ratio.\n"
        "Composition: leave the subject centered-right with enough soft whitespace for the landing-page layout; "
        "the image will appear as a right-panel essay illustration and fade from gray to pink on scroll.\n"
        "Return a public HTTPS image URL in the key `image_url` of a JSON response "
        "that the caller can store as the essay hero image. "
        "Do not include markdown or extra prose.\n"
        f"Title: {title}\n"
        f"Preview: {snippet}"
    ).strip()


def _set_essay_illustration_state(page: Page, *, status: str, source: str = "", message: str = "") -> None:
    try:
        current_view_props = page.view_props if isinstance(page.view_props, dict) else {}
        meta = _get_essay_illustration_meta(current_view_props)

        if status:
            meta["status"] = status
        if source:
            meta["agent"] = source
        if message:
            meta["message"] = message
        meta["updated_at"] = datetime.now(timezone.utc).isoformat()

        next_view_props = dict(current_view_props)
        next_view_props[ESSAY_ILLUSTRATION_VIEW_PROPS_KEY] = meta
        Page.objects.filter(pk=page.id).update(view_props=next_view_props)
    except Exception:  # noqa: BLE001
        logger.exception("Failed to persist essay illustration state for page=%s", page.id)


def _dispatch_to_agent_webhook(page: Page, agent_selector: str) -> None:
    try:
        webhook = WorkspaceAgentWebhook.objects.select_related("workspace").get(workspace_id=page.workspace_id)
    except WorkspaceAgentWebhook.DoesNotExist:
        raise RuntimeError("No workspace agent webhook configured")

    if not webhook.is_enabled:
        raise RuntimeError("Workspace agent webhook is disabled")

    dispatch_id = str(uuid4())
    payload: dict[str, Any] = {
        "dispatch_id": dispatch_id,
        "event": "essay_illustration_request",
        "sent_at": datetime.now(timezone.utc).isoformat(),
        "agent_selector": agent_selector or None,
        "workspace": {
            "id": str(page.workspace_id),
            "slug": webhook.workspace.slug if webhook.workspace_id else None,
        },
        "page": {
            "id": str(page.id),
            "slug": _get_public_slug(page.view_props),
            "name": page.name,
            "project_id": _get_project_id(str(page.id)),
        },
        "image_spec": {
            "width": ESSAY_ILLUSTRATION_WIDTH,
            "height": ESSAY_ILLUSTRATION_HEIGHT,
            "aspect_ratio": ESSAY_ILLUSTRATION_ASPECT_RATIO,
            "style": ESSAY_ILLUSTRATION_STYLE,
        },
        "prompt": _build_illustration_prompt(page),
    }

    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    secret = decrypt_data(webhook.secret_encrypted)
    signature = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "DragonFruit-Agent-Webhook/1",
        "X-Dragonfruit-Event": "essay_illustration_request",
        "X-Dragonfruit-Signature": f"sha256={signature}",
        "X-Dragonfruit-Dispatch-Id": dispatch_id,
    }

    dispatch_agent_webhook.delay(url=webhook.url, body=body, headers=headers, dispatch_id=dispatch_id)


@shared_task(name="plane.bgtasks.essay_illustration_task.request_essay_illustration")
def request_essay_illustration(page_id: str) -> None:
    """Dispatch an essay-hero generation request to the workspace webhook."""
    page = (
        Page.objects.select_related("workspace", "owned_by")
        .filter(pk=page_id)
        .only("id", "name", "page_type", "access", "description_stripped", "workspace_id", "view_props")
        .first()
    )
    if page is None:
        return

    if not page.access == Page.PUBLIC_ACCESS:
        return
    if not page.page_type == Page.PAGE_TYPE_DOC:
        return

    if not _is_in_essays_project(page):
        return

    if _has_essay_illustration_request(page.view_props):
        return

    agent_selector = (getattr(settings, "ESSAY_ILLUSTRATION_AGENT_SELECTOR", "") or "").strip()
    try:
        _dispatch_to_agent_webhook(page, agent_selector)
        _set_essay_illustration_state(page, status=ESSAY_ILLUSTRATION_STATUS_PENDING, source=agent_selector)
    except Exception:
        logger.exception("Failed to dispatch essay illustration for page_id=%s", page_id)
        _set_essay_illustration_state(
            page,
            status=ESSAY_ILLUSTRATION_STATUS_FAILED,
            source=agent_selector,
            message="Dispatch failed. Check server logs and workspace agent webhook settings.",
        )
