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
import json
import logging
import re
import urllib.parse
import urllib.request
from uuid import uuid4

import requests
from bs4 import BeautifulSoup
from django.core.exceptions import ValidationError
from django.core.serializers.json import DjangoJSONEncoder
from django.http import StreamingHttpResponse
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
from plane.bgtasks.work_item_link_task import safe_get
from plane.utils.content_validator import validate_html_content
from plane.utils.html_builders import escape_text, link_html, list_html, paragraphs_html
from plane.llm.composio import build_composio_tools, get_composio_config_for_workspace
from plane.llm.persona import ATLAS_PERSONA
from plane.llm.pricing import estimate_cost_usd
from plane.llm.provider import LLMConfigError, LLMProvider, LLMRunResult, LLMTool
from plane.llm.wikipedia import search_wikipedia, wikipedia_summary

from ..base import BaseAPIView
from .doc_write import (
    _DOC_WRITE_SYSTEM_PROMPT,
    _DOC_WRITE_STREAM_SYSTEM_PROMPT,
    _doc_write_event,
    _document_blocks_from_json,
    _extract_json_object,
    _fallback_doc_write_text,
    _normalise_doc_write_proposals,
    _stream_doc_write_events,
    build_find_replace_proposals,
    parse_find_replace,
)


logger = logging.getLogger(__name__)
_DEFAULT_ASSISTANT_NAME = "Atlas"
# Reserved name of the hidden per-project doc page that backs the "Brief" tab.
# Matches _BRIEF_PAGE_NAME in bgtasks/agent_dispatch_task.py and the frontend
# BRIEF_PAGE_NAME — the brief is identified by the is_brief flag OR this name.
_BRIEF_PAGE_NAME = "Project Brief"


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
# PDFs are forwarded to the model as a base64 document block (Claude/Gemini
# read them natively). Same raw cap as images: 2.5MB → ~3.4MB base64, which
# stays under Django's body limit alongside the rest of the payload.
_MAX_PDF_BYTES = 2_500_000
_MAX_TEXT_EXCERPT_CHARS = 50_000       # cap CSV / plaintext at ~50KB
_IMAGE_MIME_PREFIXES = ("image/png", "image/jpeg", "image/gif", "image/webp")
_TEXT_MIME_TYPES = {"text/csv", "text/plain", "application/csv"}
_FETCH_URL_MAX_BYTES = 120_000
_FETCH_URL_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Accept": "text/html,text/plain,text/markdown,application/json,text/*;q=0.9,*/*;q=0.1",
}
_DOCUMENT_CREATION_RE = re.compile(
    r"\b(create|write|draft|generate|make|prepare|crear|crea|redacta|genera|prepara|escribe)\b.{0,120}\b(document|doc|page|documento|pagina|página)\b",
    re.IGNORECASE,
)

# Matches requests to write/update THE project's Brief (the is_brief doc page
# rendered by the Brief tab) — routed to `update_project_brief`, not the generic
# create_document flow. Requires a create/update verb followed by a phrase that
# clearly names the project brief ("the brief", "el brief", "project brief",
# "brief del proyecto", "brief oficial"). Deliberately does NOT match "brief me
# on X" / "a brief on X", which are topic briefs handled by create_wikipedia_brief.
_PROJECT_BRIEF_REQUEST_RE = re.compile(
    r"\b(?:create|creating|write|writing|draft|make|generate|prepare|update|updating|edit|revise|"
    r"fill(?:\s+(?:in|out))?|"
    r"crea(?:r)?|escrib(?:e|ir)|redacta(?:r)?|genera(?:r)?|prepara(?:r)?|actualiza(?:r)?|"
    r"rellena(?:r)?|llena(?:r)?)\b"
    r"[^.?!]*?\b"
    r"(?:the\s+(?:project(?:'s)?\s+)?brief|project\s+brief|"
    r"el\s+brief|brief\s+oficial|brief\s+del?\s+proyecto|brief\s+de\s+(?:mi|este|el)\s+proyecto)\b",
    re.IGNORECASE,
)

# Matches definitional / explanatory doc-write requests that benefit from
# Wikipedia grounding (explain, define, add background on, describe, etc.)
_DEFINITIONAL_DOC_REQUEST_RE = re.compile(
    r"\b(explain|define|describe|overview|introduction|background|what is|who is|about|summarize)\b",
    re.IGNORECASE,
)


def _extract_doc_write_topic(content: str) -> str:
    """Best-effort extraction of the main topic from a doc-write prompt.

    Strips leading definitional verbs and returns the remaining phrase,
    capped at 120 characters, so it can be used as a Wikipedia query.
    """
    stripped = re.sub(
        r"^\s*(explain|define|describe|write about|write an? (overview|introduction|summary) (of|on|about)|"
        r"add (a )?(background|overview|introduction) (section )?(on|about|for)|what is|who is|about)\s*",
        "",
        content,
        flags=re.IGNORECASE,
    ).strip()
    return stripped[:120] or content[:120]


def _fetch_doc_write_reference_material(content: str) -> str:
    """Fetch ≤3 Wikipedia summaries for the topic in a doc-write prompt.

    Returns a formatted string ready to inject into the user prompt, or an
    empty string if nothing useful is found. Never raises.
    """
    topic = _extract_doc_write_topic(content)
    if not topic:
        return ""
    try:
        hits = search_wikipedia(topic, limit=3)
        if not hits:
            return ""
        parts: list[str] = []
        for hit in hits[:3]:
            summary = wikipedia_summary(hit["title"])
            if summary is None:
                continue
            extract = (summary.get("extract") or "")[:800]
            url = summary.get("url") or ""
            title = summary.get("title") or hit["title"]
            if extract:
                citation = f" (source: {url})" if url else ""
                parts.append(f"- {title}: {extract}{citation}")
        if not parts:
            return ""
        return "Cited reference material (use and cite the URLs):\n" + "\n".join(parts)
    except Exception:  # noqa: BLE001
        return ""


_CHAT_INTENT_SYSTEM_PROMPT = """
Before answering, silently classify the user's real intent.

Only if the user explicitly asks you to create, write, draft, generate, make, or prepare a document/page/doc,
you must call `create_document` exactly once instead of merely describing what you would do.
Exception: if what they want written is THE project's brief, call `update_project_brief` instead (see below).
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
If the user asks to use an external app or service through Composio:
- call `composio_search_tools` first to discover valid tool slugs
- call `composio_get_tool_schemas` before preparing exact app-tool arguments
- call `composio_manage_connections` if the search/schema result says the user's account is not connected, then return
  the auth link to the user and wait for them to finish connecting
- call `composio_execute_tool` only after the user has explicitly approved the exact external action and arguments
Do not invent Composio tool slugs or auth URLs.
If the user asks you to create, write, fill in, or update THE project's brief (e.g. "create the brief
for this project", "crea el brief de mi proyecto", "update the project brief"), call
`update_project_brief` — NOT `create_document`. The brief is the project's single canonical context
page (the "Brief" tab); writing it as a normal document creates a duplicate the Brief tab won't show.
Only if the user explicitly asks you to create a task, call `create_task`.
Only if the user explicitly asks you to create a sticky/note, call `create_sticky`.
For factual questions about real-world entities, history, science, or definitions, call `lookup_wikipedia`
to ground your answer and cite the returned URL — prefer it over stating facts from memory.
If the user asks you to "brief me on X", "give me a brief on X", or wants a researched background document
on a topic, call `create_wikipedia_brief` — it researches the topic on Wikipedia and creates a sourced doc.
In document Sources sections, use real URLs returned by `lookup_wikipedia`, never invented ones.
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
      - `data_url` for PDFs (forwarded to the model as a document block) —
        gated on the size cap
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
        elif kind == "pdf":
            if size > _MAX_PDF_BYTES:
                # Too large to round-trip through the model; keep the
                # metadata so the bubble renders, but drop the bytes.
                record["data_url"] = ""
                record["dropped"] = True
            else:
                record["data_url"] = f"data:application/pdf;base64,{b64}"
        # "other" lands as metadata-only.

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
        elif kind == "pdf" and att.get("data_url"):
            # OpenAI-style `file` block; LiteLLM converts the base64 data URL
            # into the provider's native document block (Anthropic/Gemini).
            blocks.append({"type": "text", "text": f"\n\n[Attached PDF: {name}]"})
            blocks.append(
                {
                    "type": "file",
                    "file": {"file_data": att["data_url"], "filename": name},
                }
            )
        elif kind == "pdf":
            blocks.append(
                {
                    "type": "text",
                    "text": (
                        f"\n\n[Attached PDF: {name}, {att.get('size', 0)} bytes — "
                        "too large to read; ask the user to paste the relevant section]"
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


def _looks_like_brief_request(text: str) -> bool:
    return bool(_PROJECT_BRIEF_REQUEST_RE.search(text or ""))


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


def _chat_stream_event(event_type: str, **payload):
    """Serialize one newline-delimited JSON chat-stream event.

    Mirrors `_doc_write_event` but keys on `type` (delta/done/error) since
    the chat stream carries text fragments, not doc-write proposals.
    """
    return json.dumps({"type": event_type, **payload}, cls=DjangoJSONEncoder, separators=(",", ":")) + "\n"


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


def _normalize_heading_text(value: str) -> str:
    """Lowercase and collapse to alphanumerics for loose title comparison."""
    return re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()


def _strip_duplicate_title_heading(document_html: str, title: str) -> str:
    """Drop a leading <h1>/<h2> that merely repeats the page title.

    The doc editor renders the page name as the document's own title, so a body
    that opens with the same heading shows the title twice (the bug users hit
    when Atlas writes an <h1> title into the body). Punctuation/casing are
    ignored so "Brief Oficial del Proyecto: X" matches page name "...X".
    """
    normalized_title = _normalize_heading_text(title)
    if not document_html or not normalized_title:
        return document_html
    try:
        soup = BeautifulSoup(document_html, "html.parser")
    except Exception:  # noqa: BLE001 — never let title cleanup break creation
        return document_html
    first_tag = None
    for node in soup.children:
        if getattr(node, "name", None) is None:
            # Leading whitespace text is fine; real leading prose is not a title.
            if str(node).strip():
                return document_html
            continue
        first_tag = node
        break
    if first_tag is None or first_tag.name not in {"h1", "h2"}:
        return document_html
    if _normalize_heading_text(first_tag.get_text()) != normalized_title:
        return document_html
    first_tag.extract()
    remaining = str(soup).strip()
    return remaining or "<p></p>"


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
        key_point_items = [html.escape(source["title"]) for source in sources[:4]]
        body = [
            f"<h1>{safe_title}</h1>",
            f"<p>This document summarizes the most relevant points about {safe_subject}.</p>",
            "<h2>Overview</h2>",
            f"<p>{safe_subject.capitalize()} can be understood through the main themes and evidence below.</p>",
            "<h2>Key Points</h2>",
            list_html(key_point_items),
        ]

    body.append("<h2>Sources</h2>")
    if sources:
        source_link_items = [link_html(source["url"], source["title"]) for source in sources[:5]]
        body.append(list_html(source_link_items))
    else:
        body.append("<p>No external sources were available when this document was created.</p>")
    return "".join(body)


def _resolve_agent_project(*, workspace: Workspace, project_id: str | None, hint: str | None):
    """Resolve the project a write-tool should target.

    An explicit `hint` (a project name, identifier, or id the user named in chat)
    wins over the currently-open `project_id`, so Atlas can honor "in the work
    project" even when opened at workspace scope. Returns a `Project` or `None`.
    """
    base = Project.objects.filter(workspace=workspace, archived_at__isnull=True)

    hint = str(hint or "").strip()
    if hint:
        # UUID first (LLM may echo an id), then exact name/identifier, then fuzzy.
        try:
            project = base.filter(pk=hint).first()
        except (ValueError, ValidationError):
            project = None
        if project is None:
            project = base.filter(Q(name__iexact=hint) | Q(identifier__iexact=hint)).first()
        if project is None:
            project = base.filter(name__icontains=hint).order_by("name").first()
        if project is not None:
            return project

    if project_id:
        try:
            return base.filter(pk=project_id).first()
        except (ValueError, ValidationError):
            return None
    return None


def _make_create_document_tool(
    *, workspace: Workspace, user, project_id: str | None, brief_request: bool = False
) -> LLMTool:
    def _handler(args: dict) -> str:
        hint = args.get("project") or args.get("project_id")
        project = _resolve_agent_project(workspace=workspace, project_id=project_id, hint=hint)
        if project is None:
            if hint:
                return f"tool_error: no active project matching '{str(hint).strip()}' in this workspace"
            return "tool_error: no project is currently open. Ask the user which project should contain the document, then pass its name as `project`."

        title = str(args.get("title") or "").strip()[:255]
        if not title:
            return "tool_error: `title` is required"

        # On a turn the server classified as "write THE project brief", a doc
        # titled like a brief is exactly the duplicate the Brief tab won't show.
        # Bounce the model to update_project_brief so the tool loop self-corrects.
        if brief_request and re.search(r"\bbrief\b", title, re.IGNORECASE):
            return (
                "tool_error: the user asked for THE project's Brief. Do not create a document — "
                "call `update_project_brief` with this same content as `description_html`; "
                "a standalone document will not appear in the project's Brief tab."
            )

        description_html = _coerce_document_html(str(args.get("description_html") or ""))
        # The editor renders page.name as the doc title, so drop a leading
        # heading that just repeats it (otherwise the title shows twice).
        description_html = _strip_duplicate_title_heading(description_html, title)

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
            "Create a rich-text project document/page in a DragonFruit project. "
            "Use this when the user asks to create, write, draft, make, generate, or prepare a document. "
            "Defaults to the currently open project; if the user names a different project (e.g. 'in the "
            "work project'), pass that name as `project`."
        ),
        parameters_schema={
            "type": "object",
            "properties": {
                "project": {
                    "type": "string",
                    "description": (
                        "Optional project name, identifier, or id to create the document in. "
                        "Omit to use the currently open project."
                    ),
                },
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


def _make_update_project_brief_tool(*, workspace: Workspace, user, project_id: str | None) -> LLMTool:
    """Write the current project's Brief (the single hidden `is_brief` doc page).

    Distinct from `create_document`: asking Atlas for "the project brief" should
    fill the same page the Brief tab renders, not spawn a new standalone doc.
    """

    def _handler(args: dict) -> str:
        hint = args.get("project") or args.get("project_id")
        project = _resolve_agent_project(workspace=workspace, project_id=project_id, hint=hint)
        if project is None:
            if hint:
                return f"tool_error: no active project matching '{str(hint).strip()}' in this workspace"
            return "tool_error: no project is currently open. Ask the user whose project brief to write, then pass its name as `project`."

        description_html = _coerce_document_html(str(args.get("description_html") or ""))

        # Discover the existing brief page the same way the Brief tab does:
        # prefer the is_brief flag, fall back to the reserved name.
        project_page = (
            ProjectPage.objects.filter(
                workspace=workspace,
                project=project,
                deleted_at__isnull=True,
                page__deleted_at__isnull=True,
                page__page_type=Page.PAGE_TYPE_DOC,
            )
            .filter(Q(page__is_brief=True) | Q(page__name=_BRIEF_PAGE_NAME))
            .select_related("page")
            .order_by("-page__is_brief", "-page__updated_at")
            .first()
        )

        if project_page is not None:
            page = project_page.page
            page.name = _BRIEF_PAGE_NAME
            page.is_brief = True
            page.description_html = description_html
            page.description_json = {}
            # Clear the collaborative binary so the editor re-seeds from the HTML
            # we just wrote — otherwise the stale body persists (see the live-doc
            # binary-seed gotcha).
            page.description_binary = None
            page.save()
            action = "updated"
        else:
            page = Page(
                workspace=workspace,
                name=_BRIEF_PAGE_NAME,
                page_type=Page.PAGE_TYPE_DOC,
                is_brief=True,
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
            action = "created"

        return (
            f"ok: {action} the project brief "
            f"(id={page.id}, url=/{workspace.slug}/projects/{project.id}/brief)"
        )

    return LLMTool(
        name="update_project_brief",
        description=(
            "Write or replace the current project's Brief — the single canonical project "
            "context document Atlas reads on every task (the project's 'Brief' tab). Use this "
            "whenever the user asks to create, write, fill in, or update THE brief / el brief "
            "of the project. Do NOT use `create_document` for the project brief. This is "
            "different from `create_wikipedia_brief`, which researches a standalone topic. "
            "Calling this replaces the brief's entire contents with the HTML you provide."
        ),
        parameters_schema={
            "type": "object",
            "properties": {
                "project": {
                    "type": "string",
                    "description": (
                        "Optional project name, identifier, or id whose brief to write. "
                        "Omit to use the currently open project."
                    ),
                },
                "description_html": {
                    "type": "string",
                    "description": (
                        "Complete brief body as safe HTML (headings, paragraphs, lists). "
                        "You may open with a single top-level heading for the brief title."
                    ),
                },
            },
            "required": ["description_html"],
        },
        handler=_handler,
    )


# ---------------------------------------------------------------------------
# Spreadsheet ("sheet" page type) tools. Sheets are non-Yjs pages whose data
# lives in `description_json.sheet_snapshot` as { sheets: [grid], activeId },
# each grid being { id, name, rows, cols, cells } with cells keyed "A1"-style.
# These helpers mirror the front-end model in
# apps/web/core/components/pages/sheet/sheet-utils.ts.
# ---------------------------------------------------------------------------

_SHEET_DEFAULT_ROWS = 20
_SHEET_DEFAULT_COLS = 8
_SHEET_MAX_ROWS = 500
_SHEET_MAX_COLS = 52


def _sheet_column_label(index: int) -> str:
    """0 -> "A", 25 -> "Z", 26 -> "AA" (matches front-end columnLabel)."""
    label = ""
    n = index
    while True:
        label = chr(65 + (n % 26)) + label
        n = n // 26 - 1
        if n < 0:
            break
    return label


def _sheet_cell_text(value) -> str:
    if value is None or isinstance(value, bool):
        return "" if value is None else ("TRUE" if value else "FALSE")
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def _sheet_matrix_from_args(headers, rows) -> list[list]:
    matrix: list[list] = []
    if isinstance(headers, list) and headers:
        matrix.append(list(headers))
    if isinstance(rows, list):
        for row in rows:
            matrix.append(list(row) if isinstance(row, list) else [row])
    return matrix


def _sheet_cells_from_matrix(matrix: list[list], row_offset: int = 0) -> dict:
    cells: dict = {}
    for r, row in enumerate(matrix):
        for c, value in enumerate(row):
            text = _sheet_cell_text(value)
            if text != "":
                cells[f"{_sheet_column_label(c)}{r + 1 + row_offset}"] = text
    return cells


def _parse_sheet_cell_id(ref) -> tuple[int, int] | None:
    """"B3" -> (row 2, col 1); None when the ref isn't a valid A1-style id."""
    m = re.match(r"^([A-Za-z]{1,3})([0-9]+)$", str(ref or "").strip())
    if not m:
        return None
    col = 0
    for ch in m.group(1).upper():
        col = col * 26 + (ord(ch) - 64)
    row = int(m.group(2)) - 1
    if row < 0:
        return None
    return (row, col - 1)


_SHEET_NUMBER_FORMATS = {
    "automatic",
    "plain",
    "plain_text",
    "number",
    "percent",
    "scientific",
    "currency",
    "currency_rounded",
    "euro",
    "accounting",
    "financial",
}


def _sanitize_sheet_format(raw) -> dict | None:
    """Keep only the format keys/values the sheet editor understands."""
    if not isinstance(raw, dict):
        return None
    out: dict = {}
    for key in ("bold", "italic", "strike"):
        if isinstance(raw.get(key), bool):
            out[key] = raw[key]
    for key in ("color", "fill"):
        value = raw.get(key)
        if isinstance(value, str) and re.match(r"^#[0-9a-fA-F]{3,8}$", value):
            out[key] = value
    if raw.get("align") in {"left", "center", "right"}:
        out["align"] = raw["align"]
    if raw.get("numberFormat") in _SHEET_NUMBER_FORMATS:
        out["numberFormat"] = raw["numberFormat"]
    currency = raw.get("currency")
    if isinstance(currency, str) and re.match(r"^[A-Za-z]{3}$", currency):
        out["currency"] = currency.upper()
    decimals = raw.get("decimals")
    if isinstance(decimals, int) and not isinstance(decimals, bool) and 0 <= decimals <= 10:
        out["decimals"] = decimals
    return out or None


def _find_project_sheet_page(*, workspace: Workspace, project, wanted: str):
    """Resolve the sheet page a tool call targets. Returns (page, error)."""
    sheet_pages = list(
        ProjectPage.objects.filter(
            workspace=workspace,
            project=project,
            deleted_at__isnull=True,
            page__deleted_at__isnull=True,
            page__page_type=Page.PAGE_TYPE_SHEET,
        )
        .select_related("page")
        .order_by("-page__updated_at")
    )
    if not sheet_pages:
        return None, "tool_error: this project has no spreadsheet yet. Use `create_sheet` to make one first."
    if wanted:
        match = next((pp for pp in sheet_pages if pp.page.name.strip().lower() == wanted.lower()), None)
        if match is None:
            names = ", ".join(f"'{pp.page.name}'" for pp in sheet_pages[:10])
            return None, f"tool_error: no spreadsheet named '{wanted}' in this project. Available: {names}"
    elif len(sheet_pages) > 1:
        names = ", ".join(f"'{pp.page.name}'" for pp in sheet_pages[:10])
        return None, f"tool_error: this project has multiple spreadsheets ({names}). Pass the one to edit as `sheet`."
    else:
        match = sheet_pages[0]
    return match.page, None


def _load_active_sheet_grid(page) -> tuple[dict, list, dict, str]:
    """Load (description_json, sheets, active grid, active_id), creating an
    empty grid when the snapshot is missing or malformed."""
    dj = page.description_json if isinstance(page.description_json, dict) else {}
    snap = dj.get("sheet_snapshot") if isinstance(dj.get("sheet_snapshot"), dict) else {}
    sheets = snap.get("sheets") if isinstance(snap.get("sheets"), list) else []
    active_id = snap.get("activeId")
    grid = None
    if sheets:
        grid = next((g for g in sheets if isinstance(g, dict) and g.get("id") == active_id), None) or (
            sheets[0] if isinstance(sheets[0], dict) else None
        )
    if grid is None:
        grid = {
            "id": f"sheet-{uuid4().hex[:12]}",
            "name": "Sheet 1",
            "rows": _SHEET_DEFAULT_ROWS,
            "cols": _SHEET_DEFAULT_COLS,
            "cells": {},
        }
        sheets = [grid]
        active_id = grid["id"]
    return dj, sheets, grid, active_id or grid["id"]


def _make_create_sheet_tool(*, workspace: Workspace, user, project_id: str | None) -> LLMTool:
    def _handler(args: dict) -> str:
        hint = args.get("project") or args.get("project_id")
        project = _resolve_agent_project(workspace=workspace, project_id=project_id, hint=hint)
        if project is None:
            if hint:
                return f"tool_error: no active project matching '{str(hint).strip()}' in this workspace"
            return (
                "tool_error: no project is currently open. Ask the user which project should contain "
                "the spreadsheet, then pass its name as `project`."
            )

        title = str(args.get("title") or "").strip()[:255]
        if not title:
            return "tool_error: `title` is required"

        matrix = _sheet_matrix_from_args(args.get("headers"), args.get("rows"))
        if not matrix:
            return "tool_error: provide the spreadsheet content as `rows` (a list of rows), optionally with `headers`"

        used_cols = max((len(row) for row in matrix), default=0)
        n_rows = min(max(len(matrix), _SHEET_DEFAULT_ROWS), _SHEET_MAX_ROWS)
        n_cols = min(max(used_cols, _SHEET_DEFAULT_COLS), _SHEET_MAX_COLS)
        cells = _sheet_cells_from_matrix(matrix)

        grid_id = f"sheet-{uuid4().hex[:12]}"
        snapshot = {
            "sheets": [{"id": grid_id, "name": "Sheet 1", "rows": n_rows, "cols": n_cols, "cells": cells}],
            "activeId": grid_id,
        }

        page = Page(
            workspace=workspace,
            name=title,
            page_type=Page.PAGE_TYPE_SHEET,
            description_html="",
            description_json={"sheet_snapshot": snapshot},
            description_binary=None,
            owned_by=user,
        )
        page.save(created_by_id=user.id)
        ProjectPage(workspace=workspace, project=project, page=page).save(created_by_id=user.id)

        return (
            "ok: created spreadsheet "
            f"'{page.name}' (id={page.id}, url=/{workspace.slug}/projects/{project.id}/pages/{page.id})"
        )

    return LLMTool(
        name="create_sheet",
        description=(
            "Create a spreadsheet page in a DragonFruit project. Use this when the user asks to create, "
            "build, make, or generate a spreadsheet, sheet, table of data, budget, tracker, or similar "
            "tabular document. Pass the tabular data as `rows` (and optionally `headers` for the header "
            "row). Defaults to the currently open project; if the user names a different project, pass "
            "that name as `project`. Formulas are supported — a cell value beginning with '=' (e.g. "
            "'=SUM(B2:B10)') is evaluated by the spreadsheet."
        ),
        parameters_schema={
            "type": "object",
            "properties": {
                "project": {
                    "type": "string",
                    "description": "Optional project name, identifier, or id. Omit to use the currently open project.",
                },
                "title": {"type": "string", "description": "Spreadsheet title.", "maxLength": 255},
                "headers": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional column header labels, written as the first row.",
                },
                "rows": {
                    "type": "array",
                    "items": {"type": "array", "items": {"type": ["string", "number", "boolean", "null"]}},
                    "description": (
                        "Spreadsheet data as a list of rows; each row is a list of cell values (strings, "
                        "numbers, or formulas beginning with '='). Written below `headers` if provided."
                    ),
                },
            },
            "required": ["title", "rows"],
        },
        handler=_handler,
    )


def _make_update_sheet_tool(*, workspace: Workspace, user, project_id: str | None) -> LLMTool:
    def _handler(args: dict) -> str:
        hint = args.get("project") or args.get("project_id")
        project = _resolve_agent_project(workspace=workspace, project_id=project_id, hint=hint)
        if project is None:
            if hint:
                return f"tool_error: no active project matching '{str(hint).strip()}' in this workspace"
            return (
                "tool_error: no project is currently open. Ask the user which project the spreadsheet "
                "is in, then pass its name as `project`."
            )

        page, err = _find_project_sheet_page(
            workspace=workspace, project=project, wanted=str(args.get("sheet") or args.get("title") or "").strip()
        )
        if page is None:
            return err

        matrix = _sheet_matrix_from_args(args.get("headers"), args.get("rows"))
        if not matrix:
            return "tool_error: provide the new content as `rows` (a list of rows), optionally with `headers`"

        mode = str(args.get("mode") or "replace").strip().lower()

        dj, sheets, grid, active_id = _load_active_sheet_grid(page)
        existing_cells = grid.get("cells") if isinstance(grid.get("cells"), dict) else {}

        if mode == "append":
            # Find the highest occupied row so new rows land beneath the data.
            max_row = 0
            for key in existing_cells:
                m = re.match(r"^[A-Za-z]+(\d+)$", key)
                if m:
                    max_row = max(max_row, int(m.group(1)))
            new_cells = dict(existing_cells)
            new_cells.update(_sheet_cells_from_matrix(matrix, row_offset=max_row))
            appended_from = max_row
        else:
            new_cells = _sheet_cells_from_matrix(matrix)
            appended_from = 0

        used_cols = max((len(row) for row in matrix), default=0)
        needed_rows = appended_from + len(matrix)
        grid["cells"] = new_cells
        grid["rows"] = min(max(int(grid.get("rows") or 0), needed_rows, _SHEET_DEFAULT_ROWS), _SHEET_MAX_ROWS)
        grid["cols"] = min(max(int(grid.get("cols") or 0), used_cols, _SHEET_DEFAULT_COLS), _SHEET_MAX_COLS)

        dj["sheet_snapshot"] = {"sheets": sheets, "activeId": active_id or grid["id"]}
        page.description_json = dj
        page.description_binary = None
        page.save()

        verb = "appended rows to" if mode == "append" else "updated"
        return (
            f"ok: {verb} spreadsheet '{page.name}' "
            f"(id={page.id}, url=/{workspace.slug}/projects/{project.id}/pages/{page.id})"
        )

    return LLMTool(
        name="update_sheet",
        description=(
            "Edit an existing spreadsheet page in a DragonFruit project. Use when the user asks to update, "
            "edit, add rows to, or fill in an existing sheet. By default it replaces the sheet's contents "
            "with the `rows` you provide; pass mode='append' to add `rows` beneath the existing data. If "
            "the project has more than one spreadsheet, pass its title as `sheet`."
        ),
        parameters_schema={
            "type": "object",
            "properties": {
                "project": {
                    "type": "string",
                    "description": "Optional project name, identifier, or id. Omit to use the currently open project.",
                },
                "sheet": {
                    "type": "string",
                    "description": (
                        "Title of the spreadsheet to edit. Required only if the project has multiple "
                        "spreadsheets."
                    ),
                },
                "mode": {
                    "type": "string",
                    "enum": ["replace", "append"],
                    "description": "replace (default) overwrites all cells; append adds rows below the existing data.",
                },
                "headers": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional column header labels (written as the first row; omit when appending).",
                },
                "rows": {
                    "type": "array",
                    "items": {"type": "array", "items": {"type": ["string", "number", "boolean", "null"]}},
                    "description": (
                        "New spreadsheet data as a list of rows; each row is a list of cell values or "
                        "formulas."
                    ),
                },
            },
            "required": ["rows"],
        },
        handler=_handler,
    )


def _make_set_cells_tool(*, workspace: Workspace, user, project_id: str | None) -> LLMTool:
    """Surgical spreadsheet edits: set/clear/format individual cells without
    touching the rest of the sheet (unlike update_sheet's whole-matrix write)."""

    def _handler(args: dict) -> str:
        hint = args.get("project") or args.get("project_id")
        project = _resolve_agent_project(workspace=workspace, project_id=project_id, hint=hint)
        if project is None:
            if hint:
                return f"tool_error: no active project matching '{str(hint).strip()}' in this workspace"
            return (
                "tool_error: no project is currently open. Ask the user which project the spreadsheet "
                "is in, then pass its name as `project`."
            )

        page, err = _find_project_sheet_page(
            workspace=workspace, project=project, wanted=str(args.get("sheet") or "").strip()
        )
        if page is None:
            return err

        edits = args.get("cells")
        if not isinstance(edits, list) or not edits:
            return "tool_error: `cells` must be a non-empty list of {cell, value?, format?} edits"

        dj, sheets, grid, active_id = _load_active_sheet_grid(page)
        cells = dict(grid.get("cells") if isinstance(grid.get("cells"), dict) else {})
        formats = dict(grid.get("formats") if isinstance(grid.get("formats"), dict) else {})

        applied = 0
        errors: list[str] = []
        max_row = max_col = -1
        for entry in edits:
            if not isinstance(entry, dict):
                errors.append("skipped a non-object entry")
                continue
            pos = _parse_sheet_cell_id(entry.get("cell"))
            if pos is None:
                errors.append(f"invalid cell ref '{entry.get('cell')}'")
                continue
            row, col = pos
            if row >= _SHEET_MAX_ROWS or col >= _SHEET_MAX_COLS:
                errors.append(f"cell '{entry.get('cell')}' is outside the {_SHEET_MAX_ROWS}x{_SHEET_MAX_COLS} limit")
                continue
            cid = f"{_sheet_column_label(col)}{row + 1}"
            touched = False
            if "value" in entry:
                text = _sheet_cell_text(entry.get("value"))
                if text == "":
                    cells.pop(cid, None)
                else:
                    cells[cid] = text
                touched = True
            fmt = _sanitize_sheet_format(entry.get("format"))
            if fmt:
                formats[cid] = {**(formats.get(cid) if isinstance(formats.get(cid), dict) else {}), **fmt}
                touched = True
            if not touched:
                errors.append(f"'{cid}' had neither a value nor a recognized format")
                continue
            applied += 1
            max_row = max(max_row, row)
            max_col = max(max_col, col)

        if applied == 0:
            return "tool_error: no valid edits; " + "; ".join(errors[:5])

        grid["cells"] = cells
        grid["formats"] = formats
        grid["rows"] = min(max(int(grid.get("rows") or 0), max_row + 1, _SHEET_DEFAULT_ROWS), _SHEET_MAX_ROWS)
        grid["cols"] = min(max(int(grid.get("cols") or 0), max_col + 1, _SHEET_DEFAULT_COLS), _SHEET_MAX_COLS)

        dj["sheet_snapshot"] = {"sheets": sheets, "activeId": active_id}
        page.description_json = dj
        page.description_binary = None
        page.save()

        note = f" ({'; '.join(errors[:3])})" if errors else ""
        return (
            f"ok: updated {applied} cell(s) in spreadsheet '{page.name}'{note} "
            f"(id={page.id}, url=/{workspace.slug}/projects/{project.id}/pages/{page.id})"
        )

    return LLMTool(
        name="set_cells",
        description=(
            "Edit specific cells of an existing spreadsheet without touching the rest — set or clear "
            "values/formulas and apply formatting. Use this for targeted requests like 'change B3 to 500', "
            "'make the header row bold', 'format column C as USD', or 'highlight A2 in green' — NOT "
            "`update_sheet`, which rewrites the whole sheet. Fill colors should be light tints (e.g. "
            "#bbf7d0 green, #bfdbfe blue, #fecaca red) so the dark text stays readable."
        ),
        parameters_schema={
            "type": "object",
            "properties": {
                "project": {
                    "type": "string",
                    "description": "Optional project name, identifier, or id. Omit to use the currently open project.",
                },
                "sheet": {
                    "type": "string",
                    "description": (
                        "Title of the spreadsheet to edit. Required only if the project has multiple "
                        "spreadsheets."
                    ),
                },
                "cells": {
                    "type": "array",
                    "description": "The cell edits to apply.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "cell": {"type": "string", "description": "A1-style reference, e.g. 'B3'."},
                            "value": {
                                "type": ["string", "number", "boolean", "null"],
                                "description": (
                                    "New value or '='-formula. null or '' clears the cell. Omit to only "
                                    "change formatting."
                                ),
                            },
                            "format": {
                                "type": "object",
                                "description": "Formatting to merge into the cell.",
                                "properties": {
                                    "bold": {"type": "boolean"},
                                    "italic": {"type": "boolean"},
                                    "strike": {"type": "boolean"},
                                    "color": {"type": "string", "description": "Text color hex, e.g. '#c5221f'."},
                                    "fill": {"type": "string", "description": "Background hex; use light tints."},
                                    "align": {"type": "string", "enum": ["left", "center", "right"]},
                                    "numberFormat": {
                                        "type": "string",
                                        "enum": sorted(_SHEET_NUMBER_FORMATS),
                                    },
                                    "currency": {"type": "string", "description": "ISO 4217 code, e.g. 'USD'."},
                                    "decimals": {"type": "integer", "minimum": 0, "maximum": 10},
                                },
                            },
                        },
                        "required": ["cell"],
                    },
                },
            },
            "required": ["cells"],
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


def _text_from_fetched_response(response: requests.Response) -> str:
    content_type = response.headers.get("content-type", "").lower()
    body = response.content[:_FETCH_URL_MAX_BYTES]
    text = body.decode(response.encoding or "utf-8", errors="replace")

    if "html" not in content_type:
        return text.strip()

    soup = BeautifulSoup(text, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    return soup.get_text("\n", strip=True)


def _make_fetch_url_tool() -> LLMTool:
    def _handler(args: dict) -> str:
        url = str(args.get("url") or "").strip()
        if not url:
            return "tool_error: `url` is required"

        try:
            response, final_url = safe_get(url, headers=_FETCH_URL_HEADERS, timeout=8)
        except (ValueError, RuntimeError, requests.RequestException) as exc:
            return f"tool_error: could not fetch URL: {exc}"

        if response.status_code >= 400:
            return f"tool_error: URL returned HTTP {response.status_code}: {final_url}"

        text = _text_from_fetched_response(response)
        if not text:
            return f"tool_error: URL had no readable text: {final_url}"

        truncated = len(response.content) > _FETCH_URL_MAX_BYTES
        note = "\n[Note: fetched content truncated]" if truncated else ""
        return f"Fetched URL: {final_url}\n\n{text[:_FETCH_URL_MAX_BYTES]}{note}"

    return LLMTool(
        name="fetch_url",
        description=(
            "Fetch the readable text from an exact public http(s) URL the user provided. "
            "Use this when the user asks you to inspect a source link, markdown file, brief, or document URL."
        ),
        parameters_schema={
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "Public http(s) URL to fetch"},
            },
            "required": ["url"],
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
        hint = args.get("project") or args.get("project_id")
        name = str(args.get("name") or "").strip()[:255]
        if not name:
            return "tool_error: `name` is required"

        project = _resolve_agent_project(workspace=workspace, project_id=project_id, hint=hint)
        if project is None:
            if hint:
                return f"tool_error: no active project matching '{str(hint).strip()}' in this workspace"
            return "tool_error: no project is currently open. Ask the user which project should contain the task, then pass its name as `project`."

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
        description=(
            "Create a task/work item in a DragonFruit project. Defaults to the currently open "
            "project; if the user names a different project, pass that name as `project`."
        ),
        parameters_schema={
            "type": "object",
            "properties": {
                "project": {
                    "type": "string",
                    "description": (
                        "Optional project name, identifier, or id. Omit to use the currently open project."
                    ),
                },
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


def _make_wikipedia_lookup_tool() -> LLMTool:
    def _handler(args: dict) -> str:
        query = str(args.get("query") or "").strip()
        lang = str(args.get("lang") or "en").strip() or "en"
        if not query:
            return "wikipedia_error: `query` is required"
        try:
            hits = search_wikipedia(query, lang=lang, limit=3)
            if not hits:
                return f"No Wikipedia article found for '{query}'."
            top = hits[0]
            summary = wikipedia_summary(top["title"], lang=lang)
            if summary is None:
                return f"No Wikipedia article found for '{query}'."
            extract = (summary.get("extract") or "")[:1500]
            url = summary.get("url") or ""
            title = summary.get("title") or top["title"]
            if url:
                return f"{title}: {extract}\n(source: {url})"
            return f"{title}: {extract}"
        except Exception as exc:  # noqa: BLE001
            return f"wikipedia_error: {exc}"

    return LLMTool(
        name="lookup_wikipedia",
        description=(
            "Look up a real-world entity, concept, person, place, event, or scientific topic on Wikipedia. "
            "Returns a brief summary and a citable URL. Use this to ground factual answers and avoid stating "
            "facts from memory — prefer it for history, science, geography, definitions, and notable entities."
        ),
        parameters_schema={
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The entity or topic to look up"},
                "lang": {
                    "type": "string",
                    "description": "Wikipedia language code (default: en)",
                },
            },
            "required": ["query"],
        },
        handler=_handler,
    )


def _make_wikipedia_brief_tool(*, workspace: Workspace, user, project_id: str | None) -> LLMTool:
    """"Brief me on X" — research a topic on Wikipedia and create a sourced doc."""
    create_tool = _make_create_document_tool(workspace=workspace, user=user, project_id=project_id)

    def _handler(args: dict) -> str:
        topic = str(args.get("topic") or "").strip()
        if not topic:
            return "tool_error: `topic` is required"
        lang = str(args.get("lang") or "en").strip() or "en"

        try:
            hits = search_wikipedia(topic, lang=lang, limit=5)
        except Exception as exc:  # noqa: BLE001
            return f"wikipedia_error: {exc}"
        if not hits:
            return f"No Wikipedia articles found for '{topic}'."

        summaries = []
        for hit in hits:
            try:
                summary = wikipedia_summary(hit["title"], lang=lang)
            except Exception:  # noqa: BLE001 — skip articles that fail to load
                summary = None
            if summary and summary.get("extract"):
                summaries.append(summary)
        if not summaries:
            return f"No Wikipedia articles found for '{topic}'."

        primary = summaries[0]
        sections = [f"<h2>Overview</h2>{paragraphs_html(primary['extract'])}"]
        if len(summaries) > 1:
            related = "".join(
                f"<h3>{escape_text(s['title'])}</h3>{paragraphs_html((s.get('extract') or '')[:800])}"
                for s in summaries[1:]
            )
            sections.append(f"<h2>Related concepts</h2>{related}")
        sources = "".join(f"<li>{link_html(s['url'], s['title'])}</li>" for s in summaries if s.get("url"))
        if sources:
            sections.append(f"<h2>Sources</h2><ul>{sources}</ul>")

        return create_tool.handler(
            {
                "title": f"Brief: {primary['title']}"[:255],
                "description_html": "".join(sections),
            }
        )

    return LLMTool(
        name="create_wikipedia_brief",
        description=(
            "Research a topic on Wikipedia and create a sourced one-page brief document in the current "
            "project: overview, related concepts, and a Sources section with real article URLs. Use this "
            "when the user asks for a brief, backgrounder, or researched introduction to a topic."
        ),
        parameters_schema={
            "type": "object",
            "properties": {
                "topic": {"type": "string", "description": "The topic to research and brief"},
                "lang": {"type": "string", "description": "Wikipedia language code (default: en)"},
            },
            "required": ["topic"],
        },
        handler=_handler,
    )


def _fallback_tool_confirmation(result) -> str:
    """Give users a useful reply if the model stops after an action tool call."""
    for tool_call in reversed(result.tool_calls):
        action_tools = {
            "create_document",
            "update_project_brief",
            "create_task",
            "create_sticky",
            "create_sheet",
            "update_sheet",
            "set_cells",
        }
        if tool_call.get("name") not in action_tools:
            continue
        return _tool_call_confirmation(tool_call)
    return ""


def _successful_tool_confirmation(result, tool_name: str) -> str:
    for tool_call in reversed(result.tool_calls):
        if tool_call.get("name") != tool_name:
            continue
        if str(tool_call.get("result") or "").startswith("ok:"):
            return _tool_call_confirmation(tool_call)
    return ""


def _tool_call_confirmation(tool_call: dict) -> str:
    tool_result = tool_call.get("result") or ""
    if not tool_result.startswith("ok:"):
        return tool_result

    url = ""
    marker = "url="
    if marker in tool_result:
        url = tool_result.split(marker, 1)[1].rstrip(")")

    # The brief tool carries no title arg and can create OR update the page.
    if tool_call.get("name") == "update_project_brief":
        verb = "Updated" if "ok: updated" in tool_result else "Created"
        return f"{verb} the [project brief]({url})." if url else f"{verb} the project brief."

    args = tool_call.get("arguments", {})

    # update_sheet / set_cells edit an existing spreadsheet (matched by `sheet`),
    # so they read as "Updated", and the result's quoted name is the source of truth.
    if tool_call.get("name") in {"update_sheet", "set_cells"}:
        verb = "Appended rows to" if "ok: appended" in tool_result else "Updated"
        name = ""
        if "'" in tool_result:
            name = tool_result.split("'", 2)[1]
        label = str(args.get("sheet") or name or "the spreadsheet").strip()
        return f"{verb} [{label}]({url})." if url else f"{verb} {label}."

    title = str(args.get("title") or args.get("name") or "item").strip()
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


class AgentChatDocWriteEndpoint(BaseAPIView):
    """Stream Atlas document-writing proposals as reviewable editor edits."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug, session_id):
        content = (request.data.get("prompt") or "").strip()
        project_id = (request.data.get("project_id") or "").strip() or None
        page_id = (request.data.get("page_id") or "").strip() or None
        mode = (request.data.get("mode") or "create").strip().lower()
        if mode not in {"create", "update"}:
            mode = "create"
        intent = (request.data.get("intent") or ("insert" if mode == "create" else "update")).strip().lower()
        if intent not in {"insert", "replace", "delete", "update"}:
            intent = "insert" if mode == "create" else "update"
        if not content:
            return Response({"error": "prompt is required"}, status=status.HTTP_400_BAD_REQUEST)

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
        page = _get_accessible_doc_page(
            workspace=session.workspace,
            user=request.user,
            page_id=page_id or (str(session.page_id) if session.page_id else None),
            project_id=project_id,
        )
        if page is None:
            return Response({"error": "Page not found"}, status=status.HTTP_404_NOT_FOUND)
        if session.scope_type != "page" and session.user_id != request.user.id:
            return Response({"error": "Session not found"}, status=status.HTTP_404_NOT_FOUND)

        document_markdown = str(request.data.get("document_markdown") or "")[:40_000]
        selection_text = str(request.data.get("selection_text") or "")[:8_000]
        context_note = str(request.data.get("context_note") or "").strip()[:12_000]
        blocks = _document_blocks_from_json(request.data.get("document_json"))
        agent = session.agent

        def stream():
            review_session_id = f"atlas-doc-write-{user_msg.id}"
            yield _doc_write_event(
                "session_started",
                session_id=review_session_id,
                mode=mode,
                user_message=AgentChatMessageSerializer(user_msg).data,
            )

            if not agent.is_enabled:
                yield _doc_write_event("error", error="Atlas is disabled. Re-enable it in Atlas Settings.")
                return

            try:
                provider = LLMProvider.from_agent(agent)
            except LLMConfigError as exc:
                yield _doc_write_event("error", error=str(exc))
                return

            # Deterministic literal find-replace. The LLM tends to miss
            # occurrences on a mechanical word swap (notably the H1 title), so
            # when the prompt is a clean "replace X for Y" we build the edits
            # ourselves from the document JSON — covering every matching block
            # and every occurrence — and skip the model entirely. Anything that
            # doesn't parse as a literal replace falls through to the LLM path.
            find_replace = parse_find_replace(content)
            if find_replace is not None:
                search, replacement = find_replace
                deterministic = build_find_replace_proposals(blocks, search, replacement)
                if deterministic:
                    for proposal in deterministic:
                        yield _doc_write_event(
                            "proposal_started",
                            proposal_id=proposal["id"],
                            operation=proposal["operation"],
                            target_block_id=proposal["target_block_id"],
                            target_original_text=proposal["target_original_text"],
                        )
                        yield _doc_write_event(
                            "proposal_delta",
                            proposal_id=proposal["id"],
                            content_text=proposal["content_text"],
                            content_html=proposal["content_html"],
                        )
                        yield _doc_write_event(
                            "proposal_completed",
                            proposal_id=proposal["id"],
                            operation=proposal["operation"],
                            target_block_id=proposal["target_block_id"],
                            target_original_text=proposal["target_original_text"],
                            content_text=proposal["content_text"],
                            content_html=proposal["content_html"],
                        )
                    completed_count = len(deterministic)
                    assistant_msg = AgentChatMessage.objects.create(
                        session=session,
                        role="assistant",
                        content=(
                            f"I drafted {completed_count} reviewable document "
                            f"{'edit' if completed_count == 1 else 'edits'} in the page."
                        ),
                        prompt_tokens=0,
                        completion_tokens=0,
                        total_tokens=0,
                        cost_usd=0,
                    )
                    session.save(update_fields=["updated_at", "last_activity_at"])
                    yield _doc_write_event(
                        "session_completed",
                        assistant_message=AgentChatMessageSerializer(assistant_msg).data,
                    )
                    return
                # No block contains the search term — nothing to do
                # deterministically. Fall through to the LLM path rather than
                # silently returning zero edits.

            block_context = "\n".join(
                f"- id: {block['id']}\n  type: {block['type']}\n  text: {block['text']}" for block in blocks
            )

            # Phase C: pre-fetch Wikipedia grounding for definitional requests so
            # the streaming path (which has no tool access) can cite real sources.
            reference_material = ""
            if _DEFINITIONAL_DOC_REQUEST_RE.search(content):
                reference_material = _fetch_doc_write_reference_material(content)

            user_prompt = "\n\n".join(
                part
                for part in [
                    f"Mode: {mode}",
                    f"Intent: {intent}",
                    f"User request:\n{content}",
                    reference_material if reference_material else "",
                    f"Selected text:\n{selection_text}" if selection_text else "",
                    (
                        "Private Atlas context (do not quote this block unless the user asks):\n"
                        f"{context_note}\n\n"
                        "Use this context only to resolve references and improve grounding."
                    )
                    if context_note
                    else "",
                    f"Document blocks with stable ids:\n{block_context}" if block_context else "",
                    f"Document markdown:\n{document_markdown}" if document_markdown else "",
                ]
                if part
            )

            block_map = {block["id"]: block for block in blocks}
            usage_out: dict = {}
            completed_count = 0

            # Live path: parse the `@@ATLAS` block protocol as tokens arrive so
            # each proposal surfaces (and types out) in the editor immediately.
            try:
                for name, payload in _stream_doc_write_events(
                    provider.stream_text(
                        system_prompt=_DOC_WRITE_STREAM_SYSTEM_PROMPT,
                        user_prompt=user_prompt,
                        request_timeout=60,
                        usage_out=usage_out,
                        # Drafting prose needs little deliberation; skipping the
                        # model's thinking phase is what makes the proposals
                        # actually stream in live instead of arriving in a burst.
                        reasoning_effort="minimal",
                    ),
                    mode=mode,
                    intent=intent,
                    block_map=block_map,
                ):
                    if name == "proposal_completed":
                        completed_count += 1
                    yield _doc_write_event(name, **payload)
            except Exception:  # noqa: BLE001
                logger.exception("agent doc-write stream failed agent=%s session=%s", agent.id, session.id)

            # Fallback: streaming produced nothing usable (model ignored the
            # protocol or the stream errored before any block) — make one
            # blocking call so the user still gets reviewable edits.
            if completed_count == 0:
                try:
                    result = provider.chat(
                        system_prompt=_DOC_WRITE_SYSTEM_PROMPT,
                        user_prompt=user_prompt,
                        request_timeout=25,
                    )
                    fallback = _normalise_doc_write_proposals(
                        _extract_json_object(result.final_text),
                        mode=mode,
                        intent=intent,
                        blocks=blocks,
                        fallback_text=result.final_text,
                    )
                    usage_out.setdefault("prompt_tokens", getattr(result, "prompt_tokens", 0))
                    usage_out.setdefault("completion_tokens", getattr(result, "completion_tokens", 0))
                except Exception:  # noqa: BLE001
                    logger.exception("agent doc-write fallback failed agent=%s session=%s", agent.id, session.id)
                    fallback = _normalise_doc_write_proposals(
                        {},
                        mode=mode,
                        intent=intent,
                        blocks=blocks,
                        fallback_text=_fallback_doc_write_text(content, mode=mode),
                    )
                for proposal in fallback:
                    yield _doc_write_event(
                        "proposal_started",
                        proposal_id=proposal["id"],
                        operation=proposal["operation"],
                        target_block_id=proposal["target_block_id"],
                        target_original_text=proposal["target_original_text"],
                    )
                    yield _doc_write_event(
                        "proposal_delta",
                        proposal_id=proposal["id"],
                        content_text=proposal["content_text"],
                        content_html=proposal["content_html"],
                    )
                    yield _doc_write_event(
                        "proposal_completed",
                        proposal_id=proposal["id"],
                        operation=proposal["operation"],
                        target_block_id=proposal["target_block_id"],
                        target_original_text=proposal["target_original_text"],
                        content_text=proposal["content_text"],
                        content_html=proposal["content_html"],
                    )
                completed_count = len(fallback)

            prompt_tokens = usage_out.get("prompt_tokens", 0)
            completion_tokens = usage_out.get("completion_tokens", 0)
            assistant_msg = AgentChatMessage.objects.create(
                session=session,
                role="assistant",
                content=(
                    f"I drafted {completed_count} reviewable document "
                    f"{'edit' if completed_count == 1 else 'edits'} in the page."
                ),
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=prompt_tokens + completion_tokens,
                cost_usd=estimate_cost_usd(agent.provider_model or "", prompt_tokens, completion_tokens),
            )
            session.save(update_fields=["updated_at", "last_activity_at"])
            yield _doc_write_event(
                "session_completed",
                assistant_message=AgentChatMessageSerializer(assistant_msg).data,
            )

        user_msg = AgentChatMessage.objects.create(
            session=session,
            user=request.user,
            role="user",
            content=content,
            attachments=[],
        )
        if (session.title in ("", "New chat")) and session.messages.filter(role="user").count() == 1:
            session.title = _generate_title(content)
            session.save(update_fields=["title", "updated_at"])

        response = StreamingHttpResponse(stream(), content_type="application/x-ndjson")
        # Keep the NDJSON flowing token-by-token instead of arriving as one
        # block. Three buffers can defeat streaming:
        #   - Django's GZipMiddleware compresses the (small) stream and zlib
        #     holds it until close — declaring an encoding makes it skip us.
        #   - nginx response buffering (X-Accel-Buffering).
        #   - intermediary re-chunking/transforms (no-transform).
        response["Content-Encoding"] = "identity"
        response["Cache-Control"] = "no-cache, no-transform"
        response["X-Accel-Buffering"] = "no"
        return response


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
        context_note = str(request.data.get("context_note") or "").strip()[:12_000]
        force_document_tool = _coerce_bool(request.data.get("force_document_tool"))
        use_agent_tools = _should_use_agent_tools(request.data.get("tool_mode"))
        fact_check_mode = _coerce_bool(request.data.get("fact_check"))
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

        # A "write the project brief" request routes to update_project_brief, so
        # keep it out of the generic create_document flow (whose fallbacks would
        # otherwise spawn a duplicate normal doc if the model calls the brief tool).
        is_brief_request = use_agent_tools and _looks_like_brief_request(content)
        is_document_request = (
            use_agent_tools
            and not is_brief_request
            and (force_document_tool or _looks_like_document_request(content))
        )
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
        # Atlas has one fixed personality across every workspace — we ignore
        # the per-workspace `agent.system_prompt` so the assistant's voice
        # can't drift. The matching task/page-comment personas live in
        # plane/bgtasks/agent_dispatch_task.py; the web mirror is ATLAS_IDENTITY.
        atlas_persona = ATLAS_PERSONA
        if transcript_lines:
            system = atlas_persona + "\n\nConversation so far:\n" + "\n".join(transcript_lines)
        else:
            system = atlas_persona
        system = f"{system}\n\n{_CHAT_INTENT_SYSTEM_PROMPT}"
        if fact_check_mode:
            system = (
                f"{system}\n\n"
                "FACT-CHECK MODE is ON for this conversation:\n"
                "- verify every factual claim in your answer with `lookup_wikipedia` before stating it\n"
                "- append a numbered citation marker like [1] after each verified claim\n"
                "- end the answer with a 'Sources' list mapping each number to the Wikipedia URL used\n"
                "- if a claim cannot be verified on Wikipedia, label it clearly as unverified instead of citing"
            )
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
        elif is_brief_request:
            system = (
                f"{system}\n\n"
                "Interpreted request: write THE project's Brief (the page the Brief tab renders).\n"
                "- call `update_project_brief` exactly once with the complete brief body as `description_html`\n"
                "- do NOT call `create_document`: a standalone document will not appear in the Brief tab\n"
                "- ground the brief in any document content the user attached or shared this turn\n"
                "- after the tool succeeds, reply with a short confirmation"
            )
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
                "Use this context to resolve references (like 'this/that' or the @mentioned docs and "
                "tasks below) and as authoritative source material when answering — the content of a "
                "referenced entity is already provided here, so rely on it directly instead of searching "
                "for it by name."
            )
        composio_config = get_composio_config_for_workspace(session.workspace)
        if composio_config is not None:
            write_status = "enabled" if composio_config.allow_write_tools else "disabled"
            system = (
                f"{system}\n\n"
                "Composio external-app tools are available for this request. "
                f"Composio write execution is {write_status}. "
                "For any write/destructive external action, first summarize the exact app action and arguments "
                "and ask the user to approve before execution."
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
                _make_fetch_url_tool(),
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
                    brief_request=is_brief_request,
                ),
                _make_update_project_brief_tool(
                    workspace=session.workspace,
                    user=request.user,
                    project_id=project_id,
                ),
                _make_create_task_tool(
                    workspace=session.workspace,
                    user=request.user,
                    project_id=project_id,
                ),
                _make_create_sheet_tool(
                    workspace=session.workspace,
                    user=request.user,
                    project_id=project_id,
                ),
                _make_update_sheet_tool(
                    workspace=session.workspace,
                    user=request.user,
                    project_id=project_id,
                ),
                _make_set_cells_tool(
                    workspace=session.workspace,
                    user=request.user,
                    project_id=project_id,
                ),
                _make_create_sticky_tool(
                    workspace=session.workspace,
                    user=request.user,
                ),
                _make_wikipedia_lookup_tool(),
                _make_wikipedia_brief_tool(
                    workspace=session.workspace,
                    user=request.user,
                    project_id=project_id,
                ),
            ]
            tools.extend(
                build_composio_tools(
                    user_id=f"{session.workspace.id}:{request.user.id}",
                    model=provider.model,
                    workspace=session.workspace,
                )
            )

        # Streaming path: token-by-token NDJSON for the conversational case.
        # Document requests keep the blocking JSON path — their reply is a
        # tool-confirmation built from post-run inspection, not streamed prose,
        # and the client detects the non-NDJSON content-type and handles it.
        wants_stream = _coerce_bool(request.data.get("stream"))
        if wants_stream and not is_document_request:

            def chat_stream():
                buffer_parts: list[str] = []
                run_result = None
                yield _chat_stream_event("start", user_message=AgentChatMessageSerializer(user_msg).data)
                try:
                    for kind, value in provider.stream_run(
                        system_prompt=system,
                        user_prompt=user_prompt,
                        tools=tools,
                        max_iterations=8,
                    ):
                        if kind == "delta":
                            if value:
                                buffer_parts.append(value)
                                yield _chat_stream_event("delta", value=value)
                        else:  # "result"
                            run_result = value
                except Exception:  # noqa: BLE001 — surface any provider error
                    logger.exception("agent chat stream failed agent=%s session=%s", agent.id, session.id)
                    # Nothing streamed yet? Retry once via the blocking path so the
                    # user still gets an answer on providers that can't stream
                    # tool-use. If text already streamed, keep it as the reply.
                    if not "".join(buffer_parts).strip():
                        try:
                            run_result = provider.run(
                                system_prompt=system,
                                user_prompt=user_prompt,
                                tools=tools,
                                max_iterations=8,
                            )
                        except Exception as exc2:  # noqa: BLE001
                            logger.exception(
                                "agent chat stream fallback failed agent=%s session=%s", agent.id, session.id
                            )
                            err = f"{exc2.__class__.__name__}: {exc2}"
                            assistant_err = AgentChatMessage.objects.create(
                                session=session, role="assistant", content="", error_message=err
                            )
                            yield _chat_stream_event(
                                "error",
                                error=err,
                                user_message=AgentChatMessageSerializer(user_msg).data,
                                assistant_message=AgentChatMessageSerializer(assistant_err).data,
                            )
                            return

                run_result = run_result or LLMRunResult()
                streamed_text = "".join(buffer_parts).strip()
                assistant_content = (
                    streamed_text or (run_result.final_text or "").strip() or _fallback_tool_confirmation(run_result)
                )
                # If nothing streamed (model only ran tools, or a blocking
                # fallback produced the text) surface it as one delta so the
                # bubble fills in before the final reload.
                if not streamed_text and assistant_content:
                    yield _chat_stream_event("delta", value=assistant_content)
                cost = estimate_cost_usd(
                    agent.provider_model or "", run_result.prompt_tokens, run_result.completion_tokens
                )
                assistant_msg = AgentChatMessage.objects.create(
                    session=session,
                    role="assistant",
                    content=assistant_content,
                    prompt_tokens=run_result.prompt_tokens,
                    completion_tokens=run_result.completion_tokens,
                    total_tokens=run_result.prompt_tokens + run_result.completion_tokens,
                    cost_usd=cost,
                )
                session.save(update_fields=["updated_at", "last_activity_at"])
                yield _chat_stream_event(
                    "done",
                    user_message=AgentChatMessageSerializer(user_msg).data,
                    assistant_message=AgentChatMessageSerializer(assistant_msg).data,
                )

            response = StreamingHttpResponse(chat_stream(), content_type="application/x-ndjson")
            # Same buffer-defeating headers as the doc-write stream so tokens
            # flow through Django/nginx instead of arriving as one block.
            response["Content-Encoding"] = "identity"
            response["Cache-Control"] = "no-cache, no-transform"
            response["X-Accel-Buffering"] = "no"
            return response

        try:
            result = provider.run(
                system_prompt=system,
                user_prompt=user_prompt,
                tools=tools,
                # Enough turns to research (web/wikipedia/workspace lookups) AND
                # then synthesize an answer. At 3 the loop often hit the cap
                # mid-research and returned empty; provider.run also now forces
                # a final tool-less synthesis turn as a backstop.
                max_iterations=8,
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

        successful_document_confirmation = (
            _successful_tool_confirmation(result, "create_document") if is_document_request else ""
        )
        assistant_content = (
            _tool_call_confirmation(fallback_tool_call)
            if fallback_tool_call is not None
            else successful_document_confirmation or (result.final_text or "").strip() or _fallback_tool_confirmation(result)
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
