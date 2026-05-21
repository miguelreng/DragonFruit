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
import logging

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers.agent import (
    AgentChatMessageSerializer,
    AgentChatSessionSerializer,
)
from plane.db.models import (
    Agent,
    AgentChatMessage,
    AgentChatSession,
    Workspace,
)
from plane.llm.pricing import estimate_cost_usd
from plane.llm.provider import LLMConfigError, LLMProvider

from ..base import BaseAPIView


logger = logging.getLogger(__name__)


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


class AgentChatSessionEndpoint(BaseAPIView):
    """List + create chat sessions for the requesting user."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)
        sessions = (
            AgentChatSession.objects.filter(
                workspace=workspace,
                user=request.user,
                deleted_at__isnull=True,
            )
            .select_related("agent")
            .order_by("-last_activity_at")
        )
        return Response(
            {"sessions": AgentChatSessionSerializer(sessions, many=True).data},
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug):
        agent_id = request.data.get("agent_id")
        title = (request.data.get("title") or "").strip()
        if not agent_id:
            return Response({"error": "agent_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)
        agent = Agent.objects.filter(id=agent_id, workspace=workspace, deleted_at__isnull=True).first()
        if agent is None:
            return Response({"error": "Agent not found in this workspace"}, status=status.HTTP_400_BAD_REQUEST)
        session = AgentChatSession.objects.create(
            workspace=workspace,
            user=request.user,
            agent=agent,
            title=title or "New chat",
        )
        return Response(AgentChatSessionSerializer(session).data, status=status.HTTP_201_CREATED)


class AgentChatSessionDetailEndpoint(BaseAPIView):
    """Retrieve, rename, or delete a single session."""

    def _get(self, slug, session_id, user):
        return (
            AgentChatSession.objects.filter(
                id=session_id,
                workspace__slug=slug,
                user=user,
                deleted_at__isnull=True,
            )
            .select_related("agent")
            .first()
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, session_id):
        session = self._get(slug, session_id, request.user)
        if session is None:
            return Response({"error": "Session not found"}, status=status.HTTP_404_NOT_FOUND)
        messages = list(session.messages.filter(deleted_at__isnull=True).order_by("created_at"))
        return Response(
            {
                "session": AgentChatSessionSerializer(session).data,
                "messages": AgentChatMessageSerializer(messages, many=True).data,
            },
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def patch(self, request, slug, session_id):
        session = self._get(slug, session_id, request.user)
        if session is None:
            return Response({"error": "Session not found"}, status=status.HTTP_404_NOT_FOUND)
        if "title" in request.data:
            new_title = (request.data.get("title") or "").strip()
            if not new_title:
                return Response({"error": "title cannot be empty"}, status=status.HTTP_400_BAD_REQUEST)
            session.title = new_title[:200]
            session.save(update_fields=["title", "updated_at"])
        return Response(AgentChatSessionSerializer(session).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def delete(self, request, slug, session_id):
        session = self._get(slug, session_id, request.user)
        if session is None:
            return Response({"error": "Session not found"}, status=status.HTTP_404_NOT_FOUND)
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
        # Empty content is only allowed when there's at least one
        # attachment — the LLM gets enough to work with from "what's
        # this CSV?" without any typed message.
        if not content and not raw_attachments:
            return Response({"error": "content is required"}, status=status.HTTP_400_BAD_REQUEST)

        session = (
            AgentChatSession.objects.filter(
                id=session_id,
                workspace__slug=slug,
                user=request.user,
                deleted_at__isnull=True,
            )
            .select_related("agent", "workspace")
            .first()
        )
        if session is None:
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
            err = "This agent is disabled. Re-enable it in Settings → Agents."
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

        try:
            provider = LLMProvider.from_agent(agent)
        except LLMConfigError as exc:
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

        try:
            result = provider.chat(system_prompt=system, user_prompt=user_prompt)
        except Exception as exc:  # noqa: BLE001 — surface any provider error
            logger.exception("agent chat call failed agent=%s session=%s", agent.id, session.id)
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

        assistant_content = (result.final_text or "").strip()
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
