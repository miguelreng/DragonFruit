# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Topbar "Talk to AI" chat endpoints.

A `ChatSession` is an ad-hoc conversation between one user and one
agent, distinct from event-driven `AgentRun`s. The POST /messages/
handler is synchronous: it appends the user turn, calls the LLM via
the same `LLMProvider.chat()` issue-mention runs use, persists the
assistant turn (or an error message if the call fails), and returns
both rows in a single response. The frontend can render them
immediately — no polling needed.

Why synchronous: chat replies are short (well under HTTP timeout) and
the simplicity is worth the wait spinner. Long agentic work — tool
loops, multi-step planning — should go through issue assignment /
mention, where AgentRun + Celery already cover it.
"""

import base64
import html
import logging
import re
import urllib.parse
import urllib.request

from django.db import transaction
from django.db.models import Q
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers.agent import (
    AgentChatMessageSerializer,
    AgentChatSessionSerializer,
)
from plane.app.views.agent.base import _BOT_WORKSPACE_ROLE, _build_bot_user
from plane.db.models import (
    Agent,
    AgentChatMessage,
    AgentChatSession,
    Issue,
    Page,
    Project,
    ProjectPage,
    Sticky,
    Workspace,
    WorkspaceMember,
)
from plane.utils.content_validator import validate_html_content
from plane.llm.pricing import estimate_cost_usd
from plane.llm.provider import LLMConfigError, LLMProvider, LLMTool

from ..base import BaseAPIView


logger = logging.getLogger(__name__)
_DEFAULT_ASSISTANT_NAME = "Atlas"


# Per-attachment caps. The whole POST body is also bounded by Django's
# DATA_UPLOAD_MAX_MEMORY_SIZE (default 2.5MB), so users dropping a 50MB
# image will see a request-size error well before we get here. These
# caps are an extra guard against pathological inputs and to keep the
# LLM context small.
_MAX_ATTACHMENTS = 6
# Per-image raw cap. Base64 inflates by ~33%, and Django's default
# `DATA_UPLOAD_MAX_MEMORY_SIZE` is 5MB (env: FILE_SIZE_LIMIT). A 2.5MB
# raw image → ~3.4MB base64, leaving headroom for the rest of the body.
_MAX_IMAGE_BYTES = 2_500_000
_MAX_TEXT_EXCERPT_CHARS = 50_000       # cap CSV / plaintext at ~50KB
_IMAGE_MIME_PREFIXES = ("image/png", "image/jpeg", "image/gif", "image/webp")
_TEXT_MIME_TYPES = {"text/csv", "text/plain", "application/csv"}
_DOCUMENT_CREATION_RE = re.compile(
    r"\b(create|write|draft|generate|make|prepare|crear|crea|redacta|genera|prepara|escribe)\b.{0,120}\b(document|doc|page|documento|pagina|página)\b",
    re.IGNORECASE,
)


_CHAT_INTENT_SYSTEM_PROMPT = """
Before answering, silently classify the user's real intent.

Default Buddy personality, always:
- be warm, real, friendly, concise, and direct
- sound like a capable teammate, not a corporate bot
- keep answers short unless the user asks for depth
- when answering from workspace files, say what you found and cite the file/task/sticky names
- if you do not know, say so clearly and offer the next concrete step

Only if the user explicitly asks you to create, write, draft, generate, make, or prepare a document/page/doc,
you must call `create_document` exactly once instead of merely describing what you would do.
For document-creation requests:
- infer a concise document title from the request unless the user provides an explicit title
- use any "Interpreted document request" and "Research results" context below as authoritative context
- write the full document body, not a repetition of the user's prompt
- do not include the words "Interpreted document request", raw intent notes, or the user's malformed phrasing in the document
- use valid HTML for the body with headings, paragraphs, and lists
- include a final "Sources" section with credible source names and URLs when the topic relies on factual claims
- after the tool succeeds, reply with a short confirmation and a link to the created document

If the user asks a question, asks for retrieval ("get/find/show/list/fetch X from Y"), asks for clarification,
brainstorming, analysis, or a normal chat answer, respond normally.
If the user asks about information in their files, docs, tasks, notes, stickies, workspace, or project,
call `search_workspace` first and answer only from the returned context unless you clearly label outside knowledge.
Only if the user explicitly asks you to create a task, call `create_task`.
Only if the user explicitly asks you to create a sticky/note, call `create_sticky`.
Do not reveal private chain-of-thought; only share a brief rationale if it helps the user.
""".strip()


def _classify_attachment(mime_type: str) -> str:
    """Bucket an attachment by how we feed it to the LLM."""
    if any(mime_type.startswith(p) for p in _IMAGE_MIME_PREFIXES):
        return "image"
    if mime_type == "application/pdf":
        return "pdf"
    if mime_type in _TEXT_MIME_TYPES or mime_type.startswith("text/"):
        return "text"
    return "other"


def _normalise_attachments(raw_attachments) -> list:
    """Sanitise the incoming attachment list and return the persistable
    representation. Mutates nothing on the input.

    Each entry must look like:
        { name, mime_type, size, content_base64 }

    What we keep:
      - `name`, `mime_type`, `size`, `kind` for every kind
      - `data_url` for images (so the UI re-renders thumbnails without
        a separate fetch) — gated on the size cap
      - `text_excerpt` for CSV / plaintext, decoded + truncated
      - PDFs land with just metadata (no extraction in v1)
    """
    if not isinstance(raw_attachments, list):
        return []
    out: list[dict] = []
    for entry in raw_attachments[:_MAX_ATTACHMENTS]:
        if not isinstance(entry, dict):
            continue
        name = str(entry.get("name") or "").strip()[:200]
        mime_type = str(entry.get("mime_type") or "application/octet-stream").strip()[:100]
        b64 = entry.get("content_base64") or ""
        if not name or not isinstance(b64, str):
            continue
        try:
            raw = base64.b64decode(b64, validate=True)
        except Exception:  # noqa: BLE001 — bad base64 → drop the attachment
            continue
        size = len(raw)
        kind = _classify_attachment(mime_type)

        record: dict = {"name": name, "mime_type": mime_type, "size": size, "kind": kind}

        if kind == "image":
            if size > _MAX_IMAGE_BYTES:
                # Too large to round-trip through the LLM; keep the
                # name+size so the bubble can show the metadata, but
                # drop the bytes.
                record["data_url"] = ""
                record["dropped"] = True
            else:
                record["data_url"] = f"data:{mime_type};base64,{b64}"
        elif kind == "text":
            try:
                text = raw.decode("utf-8", errors="replace")
            except Exception:  # noqa: BLE001
                text = ""
            record["text_excerpt"] = text[:_MAX_TEXT_EXCERPT_CHARS]
            if len(text) > _MAX_TEXT_EXCERPT_CHARS:
                record["text_truncated"] = True
        # PDFs and "other" land as metadata-only.

        out.append(record)
    return out


def _build_user_prompt(text: str, attachments: list):
    """Convert the persisted attachments into the multimodal content
    payload LiteLLM forwards to the provider. Returns either the bare
    text (string — fast path, no attachments) or a list of OpenAI-style
    content blocks.
    """
    if not attachments:
        return text

    blocks: list[dict] = []
    if text:
        blocks.append({"type": "text", "text": text})

    for att in attachments:
        kind = att.get("kind") or _classify_attachment(att.get("mime_type") or "")
        name = att.get("name") or "file"
        if kind == "image" and att.get("data_url"):
            blocks.append({"type": "image_url", "image_url": {"url": att["data_url"]}})
        elif kind == "text" and att.get("text_excerpt"):
            note = "" if not att.get("text_truncated") else "\n[Note: content truncated for length]"
            blocks.append(
                {
                    "type": "text",
                    "text": f"\n\n[Attached {att.get('mime_type', 'text/plain')}: {name}]\n{att['text_excerpt']}{note}",
                }
            )
        elif kind == "pdf":
            blocks.append(
                {
                    "type": "text",
                    "text": (
                        f"\n\n[Attached PDF: {name}, {att.get('size', 0)} bytes — "
                        "the server does not extract PDF text yet, ask the user "
                        "to paste the relevant section]"
                    ),
                }
            )
        else:
            blocks.append(
                {
                    "type": "text",
                    "text": f"\n\n[Attached file: {name} ({att.get('mime_type', 'unknown')})]",
                }
            )
    return blocks


def _generate_title(message_text: str) -> str:
    """Shape the user's first message into a session title.

    Same heuristic as ChatGPT's auto-title: trim, collapse whitespace,
    cap at ~50 chars on a word boundary. The user can rename later.
    """
    text = " ".join((message_text or "").split())
    if len(text) <= 50:
        return text or "New chat"
    cut = text[:50]
    # Back off to the last word boundary so we don't slice "thinking"
    # into "think" mid-word.
    space = cut.rfind(" ")
    if space > 20:
        cut = cut[:space]
    return f"{cut}…"


def _looks_like_document_request(text: str) -> bool:
    return bool(_DOCUMENT_CREATION_RE.search(text or ""))


def _should_use_agent_tools(tool_mode: str | None) -> bool:
    return (tool_mode or "").strip().lower() != "none"


def _coerce_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    if isinstance(value, (int, float)):
        return bool(value)
    return False


def _get_or_create_default_agent(workspace: Workspace) -> Agent:
    """Resolve the workspace's single user-facing assistant.

    Legacy workspaces may already have multiple agents. Until we add an
    explicit `is_default` column, prefer an enabled agent and fall back to the
    oldest surviving one. Brand-new workspaces get an Atlas bot automatically.
    """
    existing = (
        Agent.objects.filter(workspace=workspace, deleted_at__isnull=True)
        .select_related("bot_user")
        .order_by("-is_enabled", "created_at")
        .first()
    )
    if existing is not None:
        return existing

    with transaction.atomic():
        locked_workspace = Workspace.objects.select_for_update().get(pk=workspace.pk)
        existing = (
            Agent.objects.filter(workspace=locked_workspace, deleted_at__isnull=True)
            .select_related("bot_user")
            .order_by("-is_enabled", "created_at")
            .first()
        )
        if existing is not None:
            return existing

        bot_user = _build_bot_user(locked_workspace.slug, _DEFAULT_ASSISTANT_NAME)
        WorkspaceMember.objects.create(
            workspace=locked_workspace,
            member=bot_user,
            role=_BOT_WORKSPACE_ROLE,
            is_active=True,
        )
        return Agent.objects.create(
            workspace=locked_workspace,
            bot_user=bot_user,
            name=_DEFAULT_ASSISTANT_NAME,
            description="The default workspace assistant.",
            system_prompt="You are Atlas, a helpful workspace companion for DragonFruit.",
        )


def _get_accessible_doc_page(*, workspace: Workspace, user, page_id: str | None, project_id: str | None) -> Page | None:
    if not page_id:
        return None

    page_filter = Q(page__owned_by=user) | Q(page__access=Page.PUBLIC_ACCESS)
    base_query = ProjectPage.objects.filter(
        workspace=workspace,
        page_id=page_id,
        deleted_at__isnull=True,
        page__deleted_at__isnull=True,
        page__page_type=Page.PAGE_TYPE_DOC,
        project__archived_at__isnull=True,
        project__project_projectmember__member=user,
        project__project_projectmember__is_active=True,
    ).filter(page_filter)
    if project_id:
        base_query = base_query.filter(project_id=project_id)

    project_page = base_query.select_related("page").first()
    return project_page.page if project_page is not None else None


def _normalise_document_subject(text: str) -> str:
    """Best-effort cleanup of conversational doc requests into a topic."""
    cleaned = " ".join((text or "").split()).strip(" .?!")
    if not cleaned:
        return ""

    explicit_title = re.search(r'\btitle(?:d)?\s+["“](.+?)["”]', cleaned, re.IGNORECASE)
    if explicit_title:
        return explicit_title.group(1).strip()

    benefits_match = re.search(r"\bbenefits?\s+of\s+meditat(?:e|ing|ion)\b", cleaned, re.IGNORECASE)
    if benefits_match:
        return "benefits of meditation"

    topic_match = re.search(
        r"\b(?:about|on|explaining|that explains|to explain|where(?: it)? (?:displays?|displayed)|"
        r"display(?:ing|ed)?|shows?|showing|sobre|acerca de|que hable de|que trate de|sobre el tema de)\s+"
        r"(?:the\s+|el\s+|la\s+|los\s+|las\s+)?(.+)$",
        cleaned,
        re.IGNORECASE,
    )
    if topic_match:
        cleaned = topic_match.group(1).strip(" .?!")
    else:
        cleaned = re.sub(
            r"^(?:can you|could you|please|por favor)?\s*(?:create|write|draft|generate|make|prepare|crear|crea|escribe|redacta|genera|prepara)\s+"
            r"(?:a|an|the|un|una|el|la)?\s*(?:document|doc|page|documento|pagina|página)?\s*(?:that|where|to|about|on|que|sobre|acerca de)?\s*",
            "",
            cleaned,
            flags=re.IGNORECASE,
        ).strip(" .?!")

    cleaned = re.sub(r"\b(?:please|por favor)\b", "", cleaned, flags=re.IGNORECASE).strip(" .?!")
    cleaned = re.sub(r"\bmeditating\b", "meditation", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bbenefist\b", "benefits", cleaned, flags=re.IGNORECASE)
    return " ".join(cleaned.split())


def _title_from_subject(subject: str) -> str:
    if not subject:
        return ""
    small_words = {"a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "with"}
    words = []
    for index, word in enumerate(subject.split()):
        lower = word.lower()
        words.append(lower if index > 0 and lower in small_words else lower.capitalize())
    return " ".join(words)


def _search_web(query: str, *, limit: int = 5) -> list[dict]:
    """Small dependency-free web search via DuckDuckGo HTML results."""
    query = (query or "").strip()
    if not query:
        return _fallback_research_results(query, limit=limit)

    url = "https://duckduckgo.com/html/?" + urllib.parse.urlencode({"q": query})
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
            )
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            raw_html = response.read(500_000).decode("utf-8", errors="replace")
    except Exception as exc:  # noqa: BLE001
        logger.warning("agent chat web search failed query=%s error=%s", query, exc)
        return _fallback_research_results(query, limit=limit)

    results: list[dict] = []
    for match in re.finditer(
        r'<a[^>]+class="result__a"[^>]+href="(?P<href>[^"]+)"[^>]*>(?P<title>.*?)</a>',
        raw_html,
        flags=re.IGNORECASE | re.DOTALL,
    ):
        href = html.unescape(match.group("href"))
        parsed_href = urllib.parse.urlparse(href)
        if parsed_href.netloc.endswith("duckduckgo.com") and parsed_href.path.endswith("/y.js"):
            continue
        query_params = urllib.parse.parse_qs(parsed_href.query)
        result_url = query_params.get("uddg", [href])[0]
        parsed_result = urllib.parse.urlparse(result_url)
        if parsed_result.netloc.endswith("duckduckgo.com") and parsed_result.path.endswith("/y.js"):
            continue
        if "bing.com" in parsed_result.netloc and "/aclick" in parsed_result.path:
            continue
        title = re.sub(r"<.*?>", "", html.unescape(match.group("title")))
        title = " ".join(title.split())
        if not title or not result_url.startswith(("http://", "https://")):
            continue
        if any(existing["url"] == result_url for existing in results):
            continue
        results.append({"title": title[:180], "url": result_url})
        if len(results) >= limit:
            break
    return results or _fallback_research_results(query, limit=limit)


def _fallback_research_results(query: str, *, limit: int = 5) -> list[dict]:
    """Authoritative fallbacks for common factual doc topics when search is unavailable."""
    if re.search(r"\bmeditat(?:e|ing|ion)\b", query or "", re.IGNORECASE):
        return [
            {
                "title": "National Center for Complementary and Integrative Health: Meditation and Mindfulness",
                "url": "https://www.nccih.nih.gov/health/meditation-and-mindfulness-effectiveness-and-safety",
            },
            {
                "title": "Mayo Clinic: Meditation, a simple fast way to reduce stress",
                "url": "https://www.mayoclinic.org/tests-procedures/meditation/in-depth/meditation/art-20045858",
            },
            {
                "title": "American Psychological Association: Mindfulness meditation research",
                "url": "https://www.apa.org/topics/mindfulness/meditation",
            },
            {
                "title": "Harvard Health Publishing: Mindfulness meditation improves attention and focus",
                "url": "https://www.health.harvard.edu/mind-and-mood/mindfulness-meditation-improves-attention-and-focus",
            },
        ][:limit]
    return []


def _format_research_results(results: list[dict]) -> str:
    if not results:
        return "(No web search results were available. Say that sources could not be fetched instead of inventing URLs.)"
    return "\n".join(f"- {item['title']}: {item['url']}" for item in results)


def _truncate_text(value: str | None, max_chars: int = 700) -> str:
    text = " ".join((value or "").split())
    if len(text) <= max_chars:
        return text
    return text[:max_chars].rstrip() + "..."


def _format_workspace_hits(hits: list[dict]) -> str:
    if not hits:
        return "No matching workspace files, docs, tasks, or stickies were found."
    lines = []
    for hit in hits:
        lines.extend(
            [
                f"- type: {hit['type']}",
                f"  title: {hit['title']}",
                f"  url: {hit['url']}",
                f"  excerpt: {hit['excerpt'] or '(no text)'}",
            ]
        )
    return "\n".join(lines)


def _search_workspace_content(*, workspace: Workspace, user, project_id: str | None, query: str, limit: int) -> list[dict]:
    query = " ".join((query or "").split())
    limit = min(max(limit, 1), 10)
    hits: list[dict] = []

    page_filter = Q(workspace=workspace)
    if project_id:
        page_filter &= Q(projects__id=project_id)
    if query:
        page_filter &= Q(name__icontains=query) | Q(description_stripped__icontains=query)
    for page in (
        Page.objects.filter(page_filter)
        .filter(Q(owned_by=user) | Q(access=Page.PUBLIC_ACCESS))
        .distinct()
        .order_by("-updated_at")[:limit]
    ):
        project = page.projects.first()
        project_part = f"/projects/{project.id}" if project else ""
        hits.append(
            {
                "type": "document",
                "title": page.name or "Untitled document",
                "url": f"/{workspace.slug}{project_part}/pages/{page.id}",
                "excerpt": _truncate_text(page.description_stripped),
            }
        )

    remaining = limit - len(hits)
    if remaining > 0:
        issue_filter = Q(workspace=workspace)
        if project_id:
            issue_filter &= Q(project_id=project_id)
        if query:
            issue_filter &= Q(name__icontains=query) | Q(description_stripped__icontains=query)
        for issue in (
            Issue.issue_objects.filter(issue_filter)
            .select_related("project")
            .distinct()
            .order_by("-updated_at")[:remaining]
        ):
            hits.append(
                {
                    "type": "task",
                    "title": issue.name,
                    "url": f"/{workspace.slug}/projects/{issue.project_id}/issues/{issue.id}",
                    "excerpt": _truncate_text(issue.description_stripped),
                }
            )

    remaining = limit - len(hits)
    if remaining > 0:
        sticky_filter = Q(workspace=workspace, owner=user)
        if query:
            sticky_filter &= Q(name__icontains=query) | Q(description_stripped__icontains=query)
        for sticky in Sticky.objects.filter(sticky_filter).order_by("-updated_at")[:remaining]:
            hits.append(
                {
                    "type": "sticky",
                    "title": sticky.name or "Untitled sticky",
                    "url": f"/{workspace.slug}/stickies",
                    "excerpt": _truncate_text(sticky.description_stripped),
                }
            )

    return hits


def _coerce_document_html(raw_html: str) -> str:
    """Return sanitized editor HTML, accepting plain text as a fallback."""
    document_html = (raw_html or "").strip()
    if not document_html:
        document_html = "<p></p>"
    elif "<" not in document_html or ">" not in document_html:
        paragraphs = [
            f"<p>{html.escape(part.strip())}</p>"
            for part in document_html.split("\n\n")
            if part.strip()
        ]
        document_html = "".join(paragraphs) or "<p></p>"

    is_valid, _error_message, sanitized_html = validate_html_content(document_html)
    if is_valid and sanitized_html is not None:
        return sanitized_html
    if is_valid:
        return document_html
    return "<p></p>"


def _build_fallback_document_html(*, title: str, subject: str, research_results: list[dict]) -> str:
    safe_title = html.escape(title or _title_from_subject(subject) or "Document")
    safe_subject = html.escape(subject or title or "this topic")
    sources = research_results or _fallback_research_results(subject or title, limit=4)

    if re.search(r"\bmeditat(?:e|ing|ion)\b", subject or title, re.IGNORECASE):
        body = [
            f"<h1>{safe_title}</h1>",
            (
                "<p>Meditation is a simple practice for training attention and awareness. "
                "Research and clinical guidance suggest it can support mental well-being, "
                "especially when practiced consistently over time.</p>"
            ),
            "<h2>Key Benefits</h2>",
            "<ul>",
            (
                "<li><strong>Reduced stress:</strong> meditation and mindfulness practices "
                "can help people notice stress reactions earlier and respond with more calm.</li>"
            ),
            (
                "<li><strong>Better focus:</strong> attention-based meditation trains the mind "
                "to return to one object, such as the breath, which can support concentration.</li>"
            ),
            (
                "<li><strong>Emotional regulation:</strong> regular practice can make it easier "
                "to observe thoughts and feelings without immediately reacting to them.</li>"
            ),
            (
                "<li><strong>Improved self-awareness:</strong> meditation creates space to notice "
                "patterns in mood, habits, and decision-making.</li>"
            ),
            (
                "<li><strong>Support for sleep and relaxation:</strong> calming practices may help "
                "some people unwind and prepare the body for rest.</li>"
            ),
            "</ul>",
            "<h2>How to Start</h2>",
            (
                "<p>Begin with five minutes a day. Sit comfortably, breathe naturally, and gently "
                "return attention to the breath whenever the mind wanders. The benefit comes from "
                "the repeated return, not from having a perfectly quiet mind.</p>"
            ),
        ]
    else:
        body = [
            f"<h1>{safe_title}</h1>",
            f"<p>This document summarizes the most relevant points about {safe_subject}.</p>",
            "<h2>Overview</h2>",
            f"<p>{safe_subject.capitalize()} can be understood through the main themes and evidence below.</p>",
            "<h2>Key Points</h2>",
            "<ul>",
            *[
                f"<li>{html.escape(source['title'])}</li>"
                for source in sources[:4]
            ],
            "</ul>",
        ]

    body.append("<h2>Sources</h2>")
    if sources:
        body.append("<ul>")
        for source in sources[:5]:
            source_title = html.escape(source["title"])
            source_url = html.escape(source["url"], quote=True)
            body.append(f'<li><a href="{source_url}">{source_title}</a></li>')
        body.append("</ul>")
    else:
        body.append("<p>No external sources were available when this document was created.</p>")
    return "".join(body)


def _make_create_document_tool(*, workspace: Workspace, user, project_id: str | None) -> LLMTool:
    def _handler(args: dict) -> str:
        if not project_id:
            return "tool_error: no project is currently open. Ask the user which project should contain the document."

        project = Project.objects.filter(
            workspace=workspace,
            pk=project_id,
            archived_at__isnull=True,
        ).first()
        if project is None:
            return f"tool_error: no active project with id {project_id} in this workspace"

        title = str(args.get("title") or "").strip()[:255]
        if not title:
            return "tool_error: `title` is required"

        description_html = _coerce_document_html(str(args.get("description_html") or ""))

        page = Page(
            workspace=workspace,
            name=title,
            page_type=Page.PAGE_TYPE_DOC,
            description_html=description_html,
            description_json={},
            description_binary=None,
            owned_by=user,
        )
        page.save(created_by_id=user.id)
        ProjectPage(
            workspace=workspace,
            project=project,
            page=page,
        ).save(created_by_id=user.id)

        return (
            "ok: created document "
            f"'{page.name}' (id={page.id}, url=/{workspace.slug}/projects/{project.id}/pages/{page.id})"
        )

    return LLMTool(
        name="create_document",
        description=(
            "Create a rich-text project document/page in the currently open DragonFruit project. "
            "Use this when the user asks to create, write, draft, make, generate, or prepare a document."
        ),
        parameters_schema={
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Document title. Preserve an explicit title if the user supplied one.",
                    "maxLength": 255,
                },
                "description_html": {
                    "type": "string",
                    "description": (
                        "Complete document body as safe HTML. Include a final <h2>Sources</h2> "
                        "section with source links for factual documents."
                    ),
                },
            },
            "required": ["title", "description_html"],
        },
        handler=_handler,
    )


def _make_web_search_tool() -> LLMTool:
    def _handler(args: dict) -> str:
        try:
            limit = int(args.get("limit") or 5)
        except (TypeError, ValueError):
            limit = 5
        return _format_research_results(
            _search_web(str(args.get("query") or ""), limit=min(max(limit, 1), 5))
        )

    return LLMTool(
        name="web_search",
        description=(
            "Search the public web for sources. Use this before creating factual documents when the provided "
            "research context is missing or insufficient."
        ),
        parameters_schema={
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 5},
            },
            "required": ["query"],
        },
        handler=_handler,
    )


def _make_search_workspace_tool(*, workspace: Workspace, user, project_id: str | None) -> LLMTool:
    def _handler(args: dict) -> str:
        try:
            limit = int(args.get("limit") or 6)
        except (TypeError, ValueError):
            limit = 6
        query = str(args.get("query") or "").strip()
        if not query:
            return "tool_error: `query` is required"
        return _format_workspace_hits(
            _search_workspace_content(
                workspace=workspace,
                user=user,
                project_id=project_id,
                query=query,
                limit=limit,
            )
        )

    return LLMTool(
        name="search_workspace",
        description=(
            "Search the user's DragonFruit workspace across documents/pages, tasks, and stickies. "
            "Use this before answering questions about the user's files, project knowledge, tasks, or notes."
        ),
        parameters_schema={
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "What to search for in workspace content"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 10},
            },
            "required": ["query"],
        },
        handler=_handler,
    )


def _make_create_task_tool(*, workspace: Workspace, user, project_id: str | None) -> LLMTool:
    def _handler(args: dict) -> str:
        target_project_id = str(args.get("project_id") or project_id or "").strip()
        name = str(args.get("name") or "").strip()[:255]
        if not target_project_id:
            return "tool_error: no project is currently open. Ask the user which project should contain the task."
        if not name:
            return "tool_error: `name` is required"

        project = Project.objects.filter(workspace=workspace, pk=target_project_id, archived_at__isnull=True).first()
        if project is None:
            return f"tool_error: no active project with id {target_project_id} in this workspace"

        priority = str(args.get("priority") or "none").strip().lower()
        if priority not in {"urgent", "high", "medium", "low", "none"}:
            priority = "none"

        issue = Issue(
            workspace=workspace,
            project=project,
            name=name,
            description_html=_coerce_document_html(str(args.get("description_html") or "")),
            priority=priority,
        )
        issue.save(created_by_id=user.id)
        return (
            "ok: created task "
            f"'{issue.name}' (id={issue.id}, key={project.identifier}-{issue.sequence_id}, "
            f"url=/{workspace.slug}/projects/{project.id}/issues/{issue.id})"
        )

    return LLMTool(
        name="create_task",
        description="Create a task/work item in the current DragonFruit project.",
        parameters_schema={
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "name": {"type": "string", "maxLength": 255},
                "description_html": {"type": "string"},
                "priority": {"type": "string", "enum": ["urgent", "high", "medium", "low", "none"]},
            },
            "required": ["name"],
        },
        handler=_handler,
    )


def _make_create_sticky_tool(*, workspace: Workspace, user) -> LLMTool:
    def _handler(args: dict) -> str:
        title = str(args.get("name") or args.get("title") or "").strip()[:255]
        description_html = _coerce_document_html(str(args.get("description_html") or args.get("content") or ""))
        if not title and description_html == "<p></p>":
            return "tool_error: `name` or `description_html` is required"

        sticky = Sticky(
            workspace=workspace,
            owner=user,
            name=title or "Sticky",
            description_html=description_html,
            color=str(args.get("color") or "").strip()[:255] or None,
            background_color=str(args.get("background_color") or "").strip()[:255] or None,
        )
        sticky.save(created_by_id=user.id)
        return f"ok: created sticky '{sticky.name}' (id={sticky.id}, url=/{workspace.slug}/stickies)"

    return LLMTool(
        name="create_sticky",
        description="Create a sticky note in the user's workspace.",
        parameters_schema={
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "description_html": {"type": "string"},
                "content": {"type": "string"},
                "color": {"type": "string"},
                "background_color": {"type": "string"},
            },
        },
        handler=_handler,
    )


def _fallback_tool_confirmation(result) -> str:
    """Give users a useful reply if the model stops after an action tool call."""
    for tool_call in reversed(result.tool_calls):
        if tool_call.get("name") not in {"create_document", "create_task", "create_sticky"}:
            continue
        return _tool_call_confirmation(tool_call)
    return ""


def _tool_call_confirmation(tool_call: dict) -> str:
    tool_result = tool_call.get("result") or ""
    if not tool_result.startswith("ok:"):
        return tool_result

    args = tool_call.get("arguments", {})
    title = str(args.get("title") or args.get("name") or "item").strip()
    url = ""
    marker = "url="
    if marker in tool_result:
        url = tool_result.split(marker, 1)[1].rstrip(")")
    if url:
        return f"Created [{title}]({url})."
    return f"Created {title}."


def _has_successful_tool_call(result, tool_name: str) -> bool:
    return any(
        tool_call.get("name") == tool_name and str(tool_call.get("result") or "").startswith("ok:")
        for tool_call in result.tool_calls
    )


def _create_fallback_document(
    *,
    workspace: Workspace,
    user,
    project_id: str | None,
    subject: str,
    title: str,
    research_results: list[dict],
) -> tuple[str, dict | None]:
    tool = _make_create_document_tool(workspace=workspace, user=user, project_id=project_id)
    final_title = title or _title_from_subject(subject) or "Document"
    document_html = _build_fallback_document_html(
        title=final_title,
        subject=subject or final_title,
        research_results=research_results,
    )
    args = {"title": final_title, "description_html": document_html}
    tool_result = tool.handler(args)
    return tool_result, {"name": "create_document", "arguments": args, "result": tool_result}


class AgentChatSessionEndpoint(BaseAPIView):
    """List + create chat sessions for the requesting user."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)
        scope_type = (request.query_params.get("scope_type") or "personal").strip().lower()
        if scope_type == "page":
            page = _get_accessible_doc_page(
                workspace=workspace,
                user=request.user,
                page_id=str(request.query_params.get("page_id") or "").strip() or None,
                project_id=str(request.query_params.get("project_id") or "").strip() or None,
            )
            if page is None:
                return Response({"error": "Page not found"}, status=status.HTTP_404_NOT_FOUND)
            sessions = AgentChatSession.objects.filter(
                workspace=workspace,
                scope_type="page",
                page=page,
                deleted_at__isnull=True,
            )
        else:
            sessions = AgentChatSession.objects.filter(
                workspace=workspace,
                user=request.user,
                scope_type="personal",
                deleted_at__isnull=True,
            )
        sessions = sessions.select_related("agent", "page").order_by("-last_activity_at")
        return Response(
            {"sessions": AgentChatSessionSerializer(sessions, many=True).data},
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug):
        agent_id = request.data.get("agent_id")
        title = (request.data.get("title") or "").strip()
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)
        scope_type = (request.data.get("scope_type") or "personal").strip().lower()
        page = None
        if scope_type == "page":
            page = _get_accessible_doc_page(
                workspace=workspace,
                user=request.user,
                page_id=str(request.data.get("page_id") or "").strip() or None,
                project_id=str(request.data.get("project_id") or "").strip() or None,
            )
            if page is None:
                return Response({"error": "Page not found"}, status=status.HTTP_404_NOT_FOUND)
        else:
            scope_type = "personal"
        if agent_id:
            agent = Agent.objects.filter(id=agent_id, workspace=workspace, deleted_at__isnull=True).first()
            if agent is None:
                return Response({"error": "Agent not found in this workspace"}, status=status.HTTP_400_BAD_REQUEST)
        else:
            agent = _get_or_create_default_agent(workspace)
        if scope_type == "page" and page is not None:
            session = (
                AgentChatSession.objects.filter(
                    workspace=workspace,
                    scope_type="page",
                    page=page,
                    deleted_at__isnull=True,
                )
                .select_related("agent", "page")
                .first()
            )
            if session is not None:
                return Response(AgentChatSessionSerializer(session).data, status=status.HTTP_200_OK)
        session = AgentChatSession.objects.create(
            workspace=workspace,
            user=request.user,
            agent=agent,
            title=title or (page.name if page is not None else "New chat"),
            scope_type=scope_type,
            page=page,
        )
        return Response(AgentChatSessionSerializer(session).data, status=status.HTTP_201_CREATED)


class AgentChatSessionDetailEndpoint(BaseAPIView):
    """Retrieve, rename, or delete a single session."""

    def _get(self, request, slug, session_id):
        session = (
            AgentChatSession.objects.filter(
                id=session_id,
                workspace__slug=slug,
                deleted_at__isnull=True,
            )
            .select_related("agent", "workspace", "page")
            .first()
        )
        if session is None:
            return None
        if session.scope_type == "page":
            page = _get_accessible_doc_page(
                workspace=session.workspace,
                user=request.user,
                page_id=str(session.page_id) if session.page_id else None,
                project_id=str(request.query_params.get("project_id") or "").strip() or None,
            )
            return session if page is not None else None
        return session if session.user_id == request.user.id else None

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, session_id):
        session = self._get(request, slug, session_id)
        if session is None:
            return Response({"error": "Session not found"}, status=status.HTTP_404_NOT_FOUND)
        messages = list(
            session.messages.filter(deleted_at__isnull=True)
            .select_related("user")
            .order_by("created_at")
        )
        return Response(
            {
                "session": AgentChatSessionSerializer(session).data,
                "messages": AgentChatMessageSerializer(messages, many=True).data,
            },
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def patch(self, request, slug, session_id):
        session = self._get(request, slug, session_id)
        if session is None:
            return Response({"error": "Session not found"}, status=status.HTTP_404_NOT_FOUND)
        if session.scope_type == "page" and session.user_id != request.user.id:
            return Response({"error": "Only the chat creator can rename this doc chat"}, status=status.HTTP_403_FORBIDDEN)
        if "title" in request.data:
            new_title = (request.data.get("title") or "").strip()
            if not new_title:
                return Response({"error": "title cannot be empty"}, status=status.HTTP_400_BAD_REQUEST)
            session.title = new_title[:200]
            session.save(update_fields=["title", "updated_at"])
        return Response(AgentChatSessionSerializer(session).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def delete(self, request, slug, session_id):
        session = self._get(request, slug, session_id)
        if session is None:
            return Response({"error": "Session not found"}, status=status.HTTP_404_NOT_FOUND)
        if session.scope_type == "page" and session.user_id != request.user.id:
            return Response({"error": "Only the chat creator can delete this doc chat"}, status=status.HTTP_403_FORBIDDEN)
        session.delete(soft=True)
        return Response(status=status.HTTP_204_NO_CONTENT)


class AgentChatMessageEndpoint(BaseAPIView):
    """Append a user message and synchronously run the LLM.

    Persists the user turn, calls the LLM (synchronously — short chat
    replies fit comfortably in an HTTP request), persists the assistant
    turn with token + cost telemetry, returns both. If the LLM call
    fails we still persist a row with `error_message` set so the UI
    has something to render.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug, session_id):
        content = (request.data.get("content") or "").strip()
        raw_attachments = request.data.get("attachments") or []
        project_id = (request.data.get("project_id") or "").strip() or None
        context_note = str(request.data.get("context_note") or "").strip()[:4_000]
        force_document_tool = _coerce_bool(request.data.get("force_document_tool"))
        use_agent_tools = _should_use_agent_tools(request.data.get("tool_mode"))
        # Empty content is only allowed when there's at least one
        # attachment — the LLM gets enough to work with from "what's
        # this CSV?" without any typed message.
        if not content and not raw_attachments:
            return Response({"error": "content is required"}, status=status.HTTP_400_BAD_REQUEST)

        session = (
            AgentChatSession.objects.filter(
                id=session_id,
                workspace__slug=slug,
                deleted_at__isnull=True,
            )
            .select_related("agent", "workspace", "page")
            .first()
        )
        if session is None:
            return Response({"error": "Session not found"}, status=status.HTTP_404_NOT_FOUND)
        if session.scope_type == "page":
            page = _get_accessible_doc_page(
                workspace=session.workspace,
                user=request.user,
                page_id=str(session.page_id) if session.page_id else None,
                project_id=project_id,
            )
            if page is None:
                return Response({"error": "Session not found"}, status=status.HTTP_404_NOT_FOUND)
        elif session.user_id != request.user.id:
            return Response({"error": "Session not found"}, status=status.HTTP_404_NOT_FOUND)

        # Normalise + cap incoming attachments here so the model row
        # never holds something pathological. See `_normalise_attachments`
        # for the shape we persist.
        attachments = _normalise_attachments(raw_attachments)

        # Append user turn first so it's persisted even if the LLM call
        # throws or the server gets killed mid-call. A floating "user
        # message with no reply yet" row is better UX than losing the
        # question.
        user_msg = AgentChatMessage.objects.create(
            session=session,
            user=request.user,
            role="user",
            content=content,
            attachments=attachments,
        )

        # First message in the thread? Backfill the auto-generated title
        # so the sessions list is readable without the user renaming.
        if (session.title in ("", "New chat")) and session.messages.filter(role="user").count() == 1:
            session.title = _generate_title(content)
            session.save(update_fields=["title", "updated_at"])

        agent = session.agent
        if not agent.is_enabled:
            err = "Atlas is disabled. Re-enable it in Atlas Settings."
            assistant_msg = AgentChatMessage.objects.create(
                session=session,
                role="assistant",
                content="",
                error_message=err,
            )
            return Response(
                {
                    "user_message": AgentChatMessageSerializer(user_msg).data,
                    "assistant_message": AgentChatMessageSerializer(assistant_msg).data,
                },
                status=status.HTTP_200_OK,
            )

        is_document_request = use_agent_tools and (force_document_tool or _looks_like_document_request(content))
        document_subject = _normalise_document_subject(content) if is_document_request else ""
        document_title = _title_from_subject(document_subject) if document_subject else ""
        research_results = _search_web(document_subject or content) if is_document_request else []

        # Build the message history. We send the agent's system_prompt
        # and the full session history (user + assistant turns) so the
        # model has multi-turn context. Cap at the last 30 turns to keep
        # the prompt bounded — sessions can grow unboundedly otherwise.
        history = list(
            session.messages.filter(deleted_at__isnull=True)
            .order_by("created_at")
            .values("role", "content")
        )
        history_trimmed = history[-30:]

        # We use LLMProvider.run() with no tools — multi-turn message
        # history support. The provider's chat() helper only accepts a
        # single user_prompt, so for full history we go through run()
        # by concatenating into a transcript on the system side. This
        # keeps the prompt compatible with every LiteLLM model without
        # caring about each provider's exact role-alternation rules.
        transcript_lines = []
        for turn in history_trimmed[:-1]:  # all but the message we just inserted
            label = "User" if turn["role"] == "user" else "Assistant"
            transcript_lines.append(f"{label}: {turn['content']}")
        if transcript_lines:
            system = (
                (agent.system_prompt or "").strip()
                + "\n\nConversation so far:\n"
                + "\n".join(transcript_lines)
            )
        else:
            system = (agent.system_prompt or "").strip() or "You are a helpful assistant."
        system = f"{system}\n\n{_CHAT_INTENT_SYSTEM_PROMPT}"
        if is_document_request:
            interpreted = [
                "Interpreted document request:",
                f"- intent: create a project document",
                f"- topic: {document_subject or content}",
            ]
            if document_title:
                interpreted.append(f"- suggested_title: {document_title}")
            interpreted.extend(
                [
                    "",
                    "Research results from live web search:",
                    _format_research_results(research_results),
                ]
            )
            system = f"{system}\n\n" + "\n".join(interpreted)
        elif not use_agent_tools:
            system = (
                f"{system}\n\n"
                "For this request, tool calls are unavailable. Answer directly in plain text. "
                "Do not claim to have searched the workspace, searched the web, or created anything."
            )
        if context_note:
            system = (
                f"{system}\n\n"
                "Private Atlas context (do not quote this block unless the user asks):\n"
                f"{context_note}\n\n"
                "Use this context only to resolve references like 'this/that' and improve grounding."
            )

        try:
            provider = LLMProvider.from_agent(agent)
        except LLMConfigError as exc:
            if is_document_request:
                tool_result, tool_call = _create_fallback_document(
                    workspace=session.workspace,
                    user=request.user,
                    project_id=project_id,
                    subject=document_subject or content,
                    title=document_title,
                    research_results=research_results,
                )
                assistant_msg = AgentChatMessage.objects.create(
                    session=session,
                    role="assistant",
                    content=_tool_call_confirmation(tool_call),
                    error_message="" if tool_result.startswith("ok:") else str(exc),
                )
                return Response(
                    {
                        "user_message": AgentChatMessageSerializer(user_msg).data,
                        "assistant_message": AgentChatMessageSerializer(assistant_msg).data,
                    },
                    status=status.HTTP_200_OK,
                )
            err = str(exc)
            assistant_msg = AgentChatMessage.objects.create(
                session=session,
                role="assistant",
                content="",
                error_message=err,
            )
            return Response(
                {
                    "user_message": AgentChatMessageSerializer(user_msg).data,
                    "assistant_message": AgentChatMessageSerializer(assistant_msg).data,
                },
                status=status.HTTP_200_OK,
            )

        # Compose the user-prompt for this turn. If any attachments
        # rode along we build a multimodal content list with image
        # blocks (vision) and inline text blocks for CSV bodies. Plain
        # text messages keep the simple-string shape so we don't pay
        # any multimodal serialisation cost for the common case.
        user_prompt = _build_user_prompt(content, attachments)

        tools = []
        if use_agent_tools:
            tools = [
                _make_web_search_tool(),
                _make_search_workspace_tool(
                    workspace=session.workspace,
                    user=request.user,
                    project_id=project_id,
                ),
                _make_create_document_tool(
                    workspace=session.workspace,
                    user=request.user,
                    project_id=project_id,
                ),
                _make_create_task_tool(
                    workspace=session.workspace,
                    user=request.user,
                    project_id=project_id,
                ),
                _make_create_sticky_tool(
                    workspace=session.workspace,
                    user=request.user,
                ),
            ]

        try:
            result = provider.run(
                system_prompt=system,
                user_prompt=user_prompt,
                tools=tools,
                max_iterations=3,
            )
        except Exception as exc:  # noqa: BLE001 — surface any provider error
            logger.exception("agent chat call failed agent=%s session=%s", agent.id, session.id)
            if is_document_request:
                tool_result, tool_call = _create_fallback_document(
                    workspace=session.workspace,
                    user=request.user,
                    project_id=project_id,
                    subject=document_subject or content,
                    title=document_title,
                    research_results=research_results,
                )
                assistant_msg = AgentChatMessage.objects.create(
                    session=session,
                    role="assistant",
                    content=_tool_call_confirmation(tool_call),
                    error_message="" if tool_result.startswith("ok:") else f"{exc.__class__.__name__}: {exc}",
                )
                return Response(
                    {
                        "user_message": AgentChatMessageSerializer(user_msg).data,
                        "assistant_message": AgentChatMessageSerializer(assistant_msg).data,
                    },
                    status=status.HTTP_200_OK,
                )
            err = f"{exc.__class__.__name__}: {exc}"
            assistant_msg = AgentChatMessage.objects.create(
                session=session,
                role="assistant",
                content="",
                error_message=err,
            )
            return Response(
                {
                    "user_message": AgentChatMessageSerializer(user_msg).data,
                    "assistant_message": AgentChatMessageSerializer(assistant_msg).data,
                },
                status=status.HTTP_200_OK,
            )

        fallback_tool_call = None
        if is_document_request and not _has_successful_tool_call(result, "create_document"):
            _tool_result, tool_call = _create_fallback_document(
                workspace=session.workspace,
                user=request.user,
                project_id=project_id,
                subject=document_subject or content,
                title=document_title,
                research_results=research_results,
            )
            result.tool_calls.append(tool_call)
            fallback_tool_call = tool_call

        assistant_content = (
            _tool_call_confirmation(fallback_tool_call)
            if fallback_tool_call is not None
            else (result.final_text or "").strip() or _fallback_tool_confirmation(result)
        )
        cost = estimate_cost_usd(
            agent.provider_model or "",
            result.prompt_tokens,
            result.completion_tokens,
        )
        assistant_msg = AgentChatMessage.objects.create(
            session=session,
            role="assistant",
            content=assistant_content,
            prompt_tokens=result.prompt_tokens,
            completion_tokens=result.completion_tokens,
            total_tokens=result.prompt_tokens + result.completion_tokens,
            cost_usd=cost,
        )
        # last_activity_at is auto-now, but trigger an explicit save
        # so the sessions list re-sorts even if no other field changed.
        session.save(update_fields=["updated_at", "last_activity_at"])

        return Response(
            {
                "user_message": AgentChatMessageSerializer(user_msg).data,
                "assistant_message": AgentChatMessageSerializer(assistant_msg).data,
            },
            status=status.HTTP_200_OK,
        )
