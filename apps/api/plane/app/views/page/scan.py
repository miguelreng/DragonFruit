# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Scan-to-doc — photographs of a handwritten notebook become a doc Page.

Two endpoints, both workspace-level because the target project isn't known
until the vision model has read the `/project-name` marker off the paper:

    POST /workspaces/<slug>/scanned-notes/transcribe/   photos  -> draft
    POST /workspaces/<slug>/scanned-notes/              draft   -> Page

The draft between them is *stateless*: transcribe returns the rendered HTML
and the client echoes it back on create. That keeps "nothing is created until
the user confirms" honest without a draft table to garbage-collect, and a
failed create never re-runs the expensive vision call. The client can tamper
with the HTML in between — the same trust boundary the browser-extension
capture endpoints already have, and create re-sanitizes whatever it receives.

The model is asked for Markdown, never HTML: `markdown_lite_html()` renders
the editor's own dialect (task lists included) and escapes everything, so the
model never sits on the HTML trust path.
"""

import base64
import json
import re
from string import Template

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import DatabaseError, IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.bgtasks.page_transaction_task import page_transaction
from plane.db.models import Label, Page, PageLabel, Project, ProjectPage, Workspace
from plane.llm.provider import LLMConfigError, LLMProvider
from plane.utils.cache import invalidate_cache_directly
from plane.utils.content_validator import validate_html_content
from plane.utils.exception_logger import log_exception
from plane.utils.html_builders import markdown_lite_html

from ..base import BaseAPIView

# Guardrails. The whole POST body is bounded twice — Django's
# DATA_UPLOAD_MAX_MEMORY_SIZE and the Caddy proxy's request_body max_size, both
# FILE_SIZE_LIMIT (5MB default) — so the raw total below is chosen to leave
# room after base64's ~1.34x inflation.
MAX_SCAN_PAGES = 6
MAX_SCAN_IMAGE_BYTES = 1_200_000
MAX_SCAN_TOTAL_BYTES = 3_000_000
MAX_SCAN_LABELS = 10
MAX_SCAN_TITLE_CHARS = 200
MAX_SCAN_MARKDOWN_CHARS = 120_000
MAX_SCAN_HTML_CHARS = 400_000

# Output cap for the vision call. Anthropic's LiteLLM default is 4096, short
# enough to truncate a dense multi-page transcription mid-sentence.
SCAN_MAX_OUTPUT_TOKENS = 8000
SCAN_REQUEST_TIMEOUT_SECONDS = 150

SCAN_IMAGE_MIME_TYPES = ("image/jpeg", "image/png", "image/webp", "image/heic", "image/heif")

SCAN_EXTERNAL_SOURCE = "notebook_scan"

# Palette for labels the scan creates, so a new label doesn't land colourless.
# Matches the tones the label picker offers elsewhere in the app.
SCAN_LABEL_COLORS = (
    "#ff6b00",
    "#e548a5",
    "#3f76ff",
    "#0d9488",
    "#7c3aed",
    "#dc2626",
)


_SCAN_SYSTEM = """\
You are a handwriting transcription engine for DragonFruit, a workspace app. You
receive photographs of consecutive pages of one physical notebook, in the order
they were taken, and you transcribe them. You never summarize, never add content,
never answer a question the notes happen to ask, and never invent structure that
is not on the paper.

Always:
- Transcribe faithfully and completely, in the language it was written in. Pages
  are usually Spanish or English and a single page may mix both — keep every
  phrase in the language it was written in. Never translate.
- Preserve the writer's own structure. A line that is underlined, boxed, circled,
  or noticeably larger and sits above a group of lines is a heading. A dash, dot,
  arrow, or asterisk in the margin is a bullet. A hand-written 1./2./3. sequence
  is a numbered list. An empty or ticked box is a checklist item. A long
  horizontal rule across the page is a divider.
- Fix only mechanical slips — a dropped accent, an obviously doubled word. Never
  rewrite, reorder, condense, or improve the wording.
- Passages you genuinely cannot read become "[ilegible]" / "[illegible]" inline,
  in the note's language, followed by your best guess in parentheses if you have
  one. Never silently drop content and never fabricate a plausible sentence.
- Page numbers, dates written as a running header, doodles, and stray marginalia
  are not content. Skip them.

Two routing markers may appear anywhere on the paper:
    /project-name   the project this note belongs to
    #label          a label to apply
Report each in its own JSON field. They must NOT survive anywhere in the
transcription: delete the marker token and keep the surrounding sentence intact
and grammatical.

Answer with ONE JSON object and nothing else — no prose, no markdown fences.
"""


_SCAN_INSTRUCTIONS = Template("""\
Transcribe the $photo_count photographed notebook page(s) below into ONE
continuous document. They are consecutive pages of the same notebook in order. A
sentence, list, or section that runs off the bottom of one photo and continues at
the top of the next is a single unit — merge it. The reader must not be able to
tell where one photo ended and the next began: emit no page headings, no page
numbers, and no separators between photos.

Respond with exactly this JSON object:

{
  "title": "short title in the notes' own language — the page's own top heading
            when it has one, otherwise 4-8 words describing the content, no
            trailing punctuation",
  "language": "es" | "en" | "other",
  "project": "the text after a / marker, without the slash; \\"\\" if there is none",
  "labels": ["the text after each # marker, without the hash"],
  "markdown": "the full transcription (see the formatting rules below)",
  "unreadable_pages": [1-based indexes of photos you could not read at all]
}

"markdown" supports EXACTLY this Markdown subset (anything else stays literal text):
  # / ## / ### headings - **bold** - *italic* - ~~strikethrough~~ - `code` -
  [text](https://url) - "- " bullets - "1. " numbered - "- [ ]" / "- [x]" checklist
  items - "> " quote - --- divider. Lists are flat (no nesting).

Formatting rules:
- Blank lines separate paragraphs. A single newline inside a paragraph becomes a
  line break, so only break a line where the writer did.
- Use ## for the note's own sections and ### for sub-sections. Never emit a
  heading whose text is the same as "title" — the app renders the title above the
  body already.
- A line with a checkbox is "- [ ]" or "- [x]", never a plain bullet.
- Nested bullets flatten into the parent list, keeping the child's own wording.
- Write no HTML. Do not wrap the value in a code fence.
- The transcription must reach the end of the last photo. If you are running
  long, do not summarize or truncate — keep transcribing.

The photos follow, in capture order.
""")


def _normalise_scan_images(raw_images) -> tuple[list, list]:
    """Validate the incoming photos and return (images, warnings).

    Each kept entry is `{"data_url": ..., "mime_type": ...}` — nothing is
    persisted, these exist only for the duration of the vision call. Bad or
    oversize entries are dropped with a warning rather than failing the whole
    batch, so one unreadable photo doesn't cost the user the other five.
    """
    if not isinstance(raw_images, list):
        return [], []

    images: list[dict] = []
    warnings: list[str] = []
    total_bytes = 0

    for index, entry in enumerate(raw_images[:MAX_SCAN_PAGES], start=1):
        if not isinstance(entry, dict):
            continue
        b64 = entry.get("content_base64") or ""
        if not isinstance(b64, str) or not b64:
            continue
        mime_type = str(entry.get("mime_type") or "image/jpeg").strip().lower()[:100]
        if mime_type not in SCAN_IMAGE_MIME_TYPES:
            warnings.append(f"Photo {index} isn't a supported image type.")
            continue
        try:
            raw = base64.b64decode(b64, validate=True)
        except Exception:  # noqa: BLE001 — bad base64 is a client bug, not a crash
            warnings.append(f"Photo {index} couldn't be read.")
            continue
        size = len(raw)
        if size > MAX_SCAN_IMAGE_BYTES:
            warnings.append(f"Photo {index} is too large to send — it was skipped.")
            continue
        if total_bytes + size > MAX_SCAN_TOTAL_BYTES:
            warnings.append(f"Photo {index} pushed the batch over the size limit — it was skipped.")
            continue
        total_bytes += size
        # Reuse the already-validated string rather than re-encoding `raw`.
        images.append({"data_url": f"data:{mime_type};base64,{b64}", "mime_type": mime_type})

    if isinstance(raw_images, list) and len(raw_images) > MAX_SCAN_PAGES:
        warnings.append(f"Only the first {MAX_SCAN_PAGES} photos were read.")

    return images, warnings


def _build_scan_prompt(images: list) -> list:
    """The multimodal block list. A labelled text block before each image is
    what makes page ordering reliable across providers — LiteLLM preserves
    block order and the label gives the model a handle for unreadable_pages."""
    blocks: list[dict] = [
        {"type": "text", "text": _SCAN_INSTRUCTIONS.substitute(photo_count=len(images))}
    ]
    for index, image in enumerate(images, start=1):
        blocks.append({"type": "text", "text": f"Photo {index} of {len(images)}:"})
        blocks.append({"type": "image_url", "image_url": {"url": image["data_url"]}})
    return blocks


def _parse_scan_json(text: str) -> dict | None:
    """Parse the model's reply into the scan dict.

    Three tiers, in order: straight JSON, JSON recovered from around stray
    prose or a code fence, and — uniquely to this endpoint — raw text that
    *looks* like a transcription accepted as the markdown itself. That last
    tier matters because the alternative is telling someone their notes are
    gone after a 90-second wait; they'd rather have the text and pick the
    project by hand.
    """
    raw = (text or "").strip()
    if not raw:
        return None

    # Strip an optional ```json ... ``` fence if the model added one.
    candidate = raw
    if candidate.startswith("```"):
        candidate = candidate.split("\n", 1)[-1] if "\n" in candidate else candidate
        if candidate.endswith("```"):
            candidate = candidate[:-3]
        candidate = candidate.strip()
        if candidate.lower().startswith("json"):
            candidate = candidate[4:].strip()

    try:
        data = json.loads(candidate)
    except (ValueError, TypeError):
        start_idx = candidate.find("{")
        end_idx = candidate.rfind("}")
        data = None
        if start_idx != -1 and end_idx > start_idx:
            try:
                data = json.loads(candidate[start_idx : end_idx + 1])
            except (ValueError, TypeError):
                data = None
        if data is None:
            return _scan_dict_from_raw_text(raw)

    if not isinstance(data, dict):
        return _scan_dict_from_raw_text(raw)
    return data


_LOOKS_LIKE_MARKDOWN_RE = re.compile(r"^(#{1,6}\s|[-*]\s|\d+[.)]\s|>\s)", re.MULTILINE)


def _scan_dict_from_raw_text(raw: str) -> dict | None:
    """Last-resort salvage: treat the model's whole reply as the transcription.

    Only when it plausibly *is* one — multi-line and either marked up or long
    enough that it isn't an apology or an error sentence.
    """
    if "\n" not in raw:
        return None
    if not (_LOOKS_LIKE_MARKDOWN_RE.search(raw) or len(raw) >= 120):
        return None
    return {"title": "", "language": "", "project": "", "labels": [], "markdown": raw}


def _strip_residual_markers(text: str, project_marker: str, label_markers: list) -> str:
    """Delete the routing markers the model reported but left in the body.

    Scoped to exactly the tokens it named — a blanket `/\\w+` or `#\\w+` sweep
    would eat a legitimate "#3" or a URL path out of the user's notes.
    """
    working = text or ""
    tokens = []
    if project_marker:
        tokens.append("/" + re.escape(project_marker))
    for label in label_markers:
        if label:
            tokens.append("#" + re.escape(label))
    for token in tokens:
        working = re.sub(rf"(?<!\S){token}(?!\w)", "", working, flags=re.IGNORECASE)
    # Tidy the holes the removals left behind.
    working = re.sub(r"[ \t]{2,}", " ", working)
    working = re.sub(r"[ \t]+$", "", working, flags=re.MULTILINE)
    working = re.sub(r"\n{3,}", "\n\n", working)
    return working.strip()


def _member_projects(workspace: Workspace, user):
    """Active, non-archived projects the user actually belongs to."""
    return Project.objects.filter(
        workspace=workspace,
        archived_at__isnull=True,
        project_projectmember__member=user,
        project_projectmember__is_active=True,
    ).distinct()


def _resolve_scan_project(workspace: Workspace, user, marker: str):
    """Map a `/marker` written on paper to a project the user can write to.

    Same cascade as the Atlas project hint, but membership-filtered — the agent
    helper deliberately ignores membership because it's scoped elsewhere, which
    would be a hole here. No UUID branch: nobody writes a UUID on paper.
    Returns None on a miss; the client asks the user rather than guessing.
    """
    hint = (marker or "").strip().lstrip("/").strip()
    if not hint:
        return None

    base = _member_projects(workspace, user)
    # "/sprint-planning" should find the project "Sprint Planning".
    variants = [hint]
    spaced = re.sub(r"[-_]+", " ", hint).strip()
    if spaced and spaced != hint:
        variants.append(spaced)

    for variant in variants:
        project = base.filter(Q(name__iexact=variant) | Q(identifier__iexact=variant)).first()
        if project:
            return project
    for variant in variants:
        project = base.filter(name__icontains=variant).order_by("name").first()
        if project:
            return project
    return None


def _normalise_label_names(raw_labels) -> list:
    """Dedupe (case-insensitively), trim, and cap the label names."""
    if not isinstance(raw_labels, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for entry in raw_labels:
        name = str(entry or "").strip().lstrip("#").strip()[:255]
        if not name:
            continue
        key = name.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(name)
        if len(out) >= MAX_SCAN_LABELS:
            break
    return out


def _apply_scan_labels(*, page: Page, project: Project, workspace: Workspace, names: list, user):
    """Attach labels by name, creating the ones the project doesn't have yet.

    Returns (applied, skipped). PageLabel rows are added, never replaced, so a
    re-submit can't wipe labels somebody added in the editor afterwards.
    """
    applied: list[dict] = []
    skipped: list[str] = []

    for name in names:
        label = Label.objects.filter(project=project, deleted_at__isnull=True, name__iexact=name).first()
        created = False
        if label is None:
            try:
                # Label has a partial unique constraint on (project, name); a
                # case-differing concurrent create can beat the iexact lookup.
                # The nested atomic keeps that IntegrityError from poisoning
                # the outer transaction.
                with transaction.atomic():
                    label = Label.objects.create(
                        name=name,
                        project=project,
                        workspace=workspace,
                        color=SCAN_LABEL_COLORS[len(name) % len(SCAN_LABEL_COLORS)],
                        created_by=user,
                        updated_by=user,
                    )
                created = True
            except IntegrityError:
                label = Label.objects.filter(
                    project=project, deleted_at__isnull=True, name__iexact=name
                ).first()
                if label is None:
                    skipped.append(name)
                    continue

        PageLabel.objects.get_or_create(
            page=page,
            label=label,
            workspace=workspace,
            defaults={"created_by_id": user.id, "updated_by_id": user.id},
        )
        applied.append({"id": str(label.id), "name": label.name, "created": created})

    return applied, skipped


def _app_base_url() -> str:
    return (
        getattr(settings, "APP_BASE_URL", None) or getattr(settings, "WEB_URL", "http://localhost:3000")
    ).rstrip("/")


class ScannedNoteTranscribeEndpoint(BaseAPIView):
    """Photographs of a notebook in, a doc draft out. Writes nothing."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        images, warnings = _normalise_scan_images(request.data.get("images"))
        if not images:
            return Response(
                {"error": "Add at least one readable photo of a notebook page."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            raw_text = _run_scan_transcription(workspace=workspace, images=images)
        except LLMConfigError as exc:
            # LLMConfigError subclasses ValueError, which BaseAPIView turns
            # into a generic 500 — catch it here so the user gets the real,
            # already user-facing message.
            return Response(
                {"error": str(exc), "code": "llm_not_configured"},
                status=status.HTTP_409_CONFLICT,
            )
        except Exception as exc:  # noqa: BLE001 — any provider failure
            log_exception(exc)
            return Response(
                {
                    "error": "Couldn't read those pages. Try better light or a straighter angle.",
                    "code": "transcription_failed",
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

        data = _parse_scan_json(raw_text)
        if not data:
            return Response(
                {
                    "error": "Couldn't read those pages. Try better light or a straighter angle.",
                    "code": "transcription_failed",
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

        project_marker = str(data.get("project") or "").strip().lstrip("/").strip()[:255]
        label_markers = _normalise_label_names(data.get("labels"))

        markdown = str(data.get("markdown") or "")[:MAX_SCAN_MARKDOWN_CHARS]
        markdown = _strip_residual_markers(markdown, project_marker, label_markers)
        description_html = markdown_lite_html(markdown)[:MAX_SCAN_HTML_CHARS]
        is_valid, _error, clean = validate_html_content(description_html)
        description_html = (clean or "").strip() if is_valid else ""
        if not description_html:
            return Response(
                {"error": "No readable handwriting was found in these photos."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        unreadable = [index for index in (data.get("unreadable_pages") or []) if isinstance(index, int)]
        for index in unreadable:
            warnings.append(f"Photo {index} was too blurry to read.")

        detected_project = _resolve_scan_project(workspace, request.user, project_marker)

        return Response(
            {
                "title": str(data.get("title") or "").strip()[:MAX_SCAN_TITLE_CHARS],
                "language": str(data.get("language") or "").strip()[:16],
                "description_html": description_html,
                "pages_read": len(images),
                "project_marker": project_marker,
                "detected_project": (
                    {
                        "id": str(detected_project.id),
                        "name": detected_project.name,
                        "identifier": detected_project.identifier,
                    }
                    if detected_project
                    else None
                ),
                "detected_labels": label_markers,
                "warnings": warnings,
            },
            status=status.HTTP_200_OK,
        )


def _run_scan_transcription(*, workspace: Workspace, images: list) -> str:
    """Send the photos to the workspace's BYOK vision model, return raw text.

    Uses LLMProvider rather than call_llm_chat: only the former routes a
    multimodal content list through LiteLLM's per-provider normalisation.
    """
    # Function-level import — views.agent imports back into views.page.
    from plane.app.views.agent.chat import _get_or_create_default_agent

    provider = LLMProvider.from_agent(_get_or_create_default_agent(workspace))
    result = provider.chat(
        system_prompt=_SCAN_SYSTEM,
        user_prompt=_build_scan_prompt(images),
        request_timeout=SCAN_REQUEST_TIMEOUT_SECONDS,
        max_tokens=SCAN_MAX_OUTPUT_TOKENS,
    )
    return result.final_text or ""


class ScannedNoteCreateEndpoint(BaseAPIView):
    """Persist a confirmed scan draft as a doc Page in the chosen project."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        project_id = str(request.data.get("project_id") or "").strip()
        if not project_id:
            return Response(
                {"error": "Pick a project for this doc."}, status=status.HTTP_400_BAD_REQUEST
            )
        # The workspace-level decorator says nothing about this project, so
        # re-check membership here or a workspace member could write into a
        # project they aren't part of.
        try:
            project = (
                _member_projects(workspace, request.user)
                .filter(
                    id=project_id,
                    project_projectmember__role__in=[ROLE.ADMIN.value, ROLE.MEMBER.value],
                )
                .first()
            )
        except (ValueError, DjangoValidationError):
            project = None
        if project is None:
            return Response(
                {"error": "You don't have access to that project."},
                status=status.HTTP_403_FORBIDDEN,
            )

        raw_html = str(request.data.get("description_html") or "")[:MAX_SCAN_HTML_CHARS]
        is_valid, _error, clean = validate_html_content(raw_html)
        description_html = (clean or "").strip() if is_valid else ""
        if not description_html:
            return Response(
                {"error": "This scan has no content to save."}, status=status.HTTP_400_BAD_REQUEST
            )

        title = str(request.data.get("title") or "").strip()[:MAX_SCAN_TITLE_CHARS]
        if not title:
            title = f"Scanned notes · {timezone.now().strftime('%b %d, %Y')}"

        external_id = str(request.data.get("client_request_id") or "").strip()[:255] or None
        label_names = _normalise_label_names(request.data.get("labels"))

        try:
            page = None
            if external_id:
                page = Page.objects.filter(
                    workspace=workspace,
                    external_source=SCAN_EXTERNAL_SOURCE,
                    external_id=external_id,
                    deleted_at__isnull=True,
                ).first()
            created = page is None
            old_description_html = None if created else page.description_html

            if created:
                page = Page(
                    workspace=workspace,
                    name=title,
                    page_type=Page.PAGE_TYPE_DOC,
                    description_html=description_html,
                    description_json={},
                    # The editor seeds itself from description_html whenever the
                    # Yjs blob is empty. A brand-new page id has no cached
                    # client state to reconcile against, so there is nothing for
                    # the live server to do here.
                    description_binary=None,
                    owned_by=request.user,
                    access=Page.PRIVATE_ACCESS,
                    external_source=SCAN_EXTERNAL_SOURCE,
                    external_id=external_id,
                )
                page.save(created_by_id=request.user.id)
            else:
                page.name = title
                page.description_html = description_html
                page.description_json = {}
                page.description_binary = None
                page.page_type = Page.PAGE_TYPE_DOC
                page.updated_by_id = request.user.id
                page.save()

            # Keyed on (workspace, source, external_id) without the project, so
            # a retry after the user changed their mind in the confirm sheet
            # moves the doc instead of leaving a duplicate behind.
            ProjectPage.objects.get_or_create(
                workspace=workspace,
                project=project,
                page=page,
                defaults={"created_by_id": request.user.id, "updated_by_id": request.user.id},
            )
            if not created:
                ProjectPage.objects.filter(page=page).exclude(project=project).delete()

            labels_applied, labels_skipped = _apply_scan_labels(
                page=page,
                project=project,
                workspace=workspace,
                names=label_names,
                user=request.user,
            )
        except DatabaseError as exc:
            log_exception(exc)
            return Response(
                {"error": "Page storage is not ready. Try again in a moment."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if any(entry["created"] for entry in labels_applied):
            # The workspace labels list is cached for two hours; without this
            # the label the user just made stays invisible to the app.
            try:
                invalidate_cache_directly(
                    path="/api/workspaces/:slug/labels/",
                    url_params=True,
                    user=False,
                    request=request,
                    multiple=True,
                )
            except Exception as exc:  # noqa: BLE001 — a cold cache is not a failure
                log_exception(exc)

        try:
            page_transaction.delay(
                new_description_html=description_html,
                old_description_html=old_description_html,
                page_id=str(page.id),
            )
        except Exception:  # noqa: BLE001 — history is best-effort
            pass

        relative_url = f"/{slug}/projects/{project.id}/pages/{page.id}"
        return Response(
            {
                "id": str(page.id),
                "name": page.name,
                "created": created,
                "workspace_slug": slug,
                "project_id": str(project.id),
                "url": f"{_app_base_url()}{relative_url}",
                "web_url": relative_url,
                "labels_applied": labels_applied,
                "labels_skipped": labels_skipped,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
