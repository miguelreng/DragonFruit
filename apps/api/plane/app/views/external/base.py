# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python import
import json
import os
import re
from typing import List, Dict, Tuple

# Third party import
try:
    from anthropic import Anthropic
except ImportError:  # pragma: no cover - SDK is optional at install time
    Anthropic = None  # type: ignore[assignment]
from openai import OpenAI
import requests

from rest_framework import status
from rest_framework.response import Response

# Module import
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import ProjectLiteSerializer, WorkspaceLiteSerializer
from plane.db.models import Project, Workspace
from plane.llm.composio import ComposioClient, ComposioConfig, get_composio_config_for_workspace
from plane.license.utils.encryption import decrypt_data, encrypt_data
from plane.license.utils.instance_value import get_configuration_value
from plane.utils.exception_logger import log_exception

from ..base import BaseAPIView


class LLMProvider:
    """Base class for LLM provider configurations"""

    name: str = ""
    models: List[str] = []
    default_model: str = ""

    @classmethod
    def get_config(cls) -> Dict[str, str | List[str]]:
        return {
            "name": cls.name,
            "models": cls.models,
            "default_model": cls.default_model,
        }


class OpenAIProvider(LLMProvider):
    name = "OpenAI"
    models = [
        # GPT-5.5 (frontier)
        "gpt-5.5",
        "gpt-5.5-pro",
        # GPT-5.4
        "gpt-5.4",
        "gpt-5.4-mini",
        "gpt-5.4-nano",
        # GPT-5
        "gpt-5",
        "gpt-5-pro",
        "gpt-5-mini",
        "gpt-5-nano",
        # GPT-4.1
        "gpt-4.1",
        "gpt-4.1-mini",
        # o-series reasoning
        "o3",
        "o3-pro",
        # GPT-4o (legacy, still callable)
        "gpt-4o",
        "gpt-4o-mini",
    ]
    default_model = "gpt-5.4-mini"


class AnthropicProvider(LLMProvider):
    name = "Anthropic"
    models = [
        # Claude 4.x (current)
        "claude-opus-4-7",
        "claude-sonnet-4-6",
        "claude-haiku-4-5",
        # Claude 4.x (legacy, still callable)
        "claude-opus-4-6",
        "claude-sonnet-4-5",
        "claude-opus-4-5",
        "claude-opus-4-1",
    ]
    default_model = "claude-sonnet-4-6"


class GeminiProvider(LLMProvider):
    name = "Gemini"
    models = [
        # Gemini 3
        "gemini-3.5-flash",
        "gemini-3.1-flash-lite",
        # Gemini 2.5
        "gemini-2.5-pro",
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
    ]
    default_model = "gemini-2.5-flash"


SUPPORTED_PROVIDERS = {
    "openai": OpenAIProvider,
    "anthropic": AnthropicProvider,
    "gemini": GeminiProvider,
}


def get_llm_config(workspace=None) -> Tuple[str | None, str | None, str | None]:
    """
    Helper to get LLM configuration values, returns:
        - api_key, model, provider_key

    Resolution order:
    1. Workspace-level BYO key (`workspace.llm_*` fields), if a workspace is provided
       and `llm_api_key_encrypted` is set. The API key is Fernet-encrypted at rest.
    2. Instance-level settings / `LLM_*` env vars.
    """
    api_key: str | None = None
    provider_key: str | None = None
    model: str | None = None

    if workspace is not None and workspace.llm_api_key_encrypted:
        decrypted = decrypt_data(workspace.llm_api_key_encrypted)
        if decrypted:
            api_key = decrypted
            provider_key = (workspace.llm_provider or "openai").strip()
            model = (workspace.llm_model or "").strip() or None

    if not api_key:
        api_key, provider_key, model = get_configuration_value(
            [
                {
                    "key": "LLM_API_KEY",
                    "default": os.environ.get("LLM_API_KEY", None),
                },
                {
                    "key": "LLM_PROVIDER",
                    "default": os.environ.get("LLM_PROVIDER", "openai"),
                },
                {
                    "key": "LLM_MODEL",
                    "default": os.environ.get("LLM_MODEL", None),
                },
            ]
        )

    if not provider_key:
        log_exception(ValueError("Missing LLM provider"))
        return None, None, None

    provider = SUPPORTED_PROVIDERS.get(provider_key.lower())
    if not provider:
        log_exception(ValueError(f"Unsupported provider: {provider_key}"))
        return None, None, None

    if not api_key:
        log_exception(ValueError(f"Missing API key for provider: {provider.name}"))
        return None, None, None

    # If no model specified, use provider's default
    if not model:
        model = provider.default_model

    # Validate model is supported by provider
    if model not in provider.models:
        log_exception(
            ValueError(
                f"Model {model} not supported by {provider.name}. Supported models: {', '.join(provider.models)}"
            )
        )
        return None, None, None

    return api_key, model, provider_key


def call_llm_chat(
    *,
    system: str | None,
    user: str,
    api_key: str,
    model: str,
    provider: str,
    temperature: float = 0.2,
    max_tokens: int = 4096,
) -> Tuple[str | None, str | None]:
    """
    Provider-aware chat completion. Returns (text, error).

    Routes to the correct SDK per provider rather than blindly hitting OpenAI's URL.
    """
    provider_lower = provider.lower()
    try:
        if provider_lower == "anthropic":
            if Anthropic is None:
                return (
                    None,
                    "Anthropic SDK is not installed. Add `anthropic` to requirements.",
                )
            client = Anthropic(api_key=api_key)
            response = client.messages.create(
                model=model,
                max_tokens=max_tokens,
                temperature=temperature,
                system=system or "",
                messages=[{"role": "user", "content": user}],
            )
            # response.content is a list of content blocks; take the first text block.
            for block in response.content:
                text = getattr(block, "text", None)
                if text:
                    return text, None
            return None, "Anthropic returned no text content."

        if provider_lower == "openai":
            client = OpenAI(api_key=api_key)
            messages = []
            if system:
                messages.append({"role": "system", "content": system})
            messages.append({"role": "user", "content": user})
            completion = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
            )
            return completion.choices[0].message.content, None

        if provider_lower == "gemini":
            import litellm  # local import — heavy module, only load when used

            completion = litellm.completion(
                model=f"gemini/{model}",
                api_key=api_key,
                messages=(
                    ([{"role": "system", "content": system}] if system else [])
                    + [{"role": "user", "content": user}]
                ),
                temperature=temperature,
                max_tokens=max_tokens,
            )
            text = completion.choices[0].message.content
            return (text, None) if text else (None, "Gemini returned no text content.")

        return None, f"Unsupported provider: {provider}"
    except Exception as e:
        log_exception(e)
        error_type = e.__class__.__name__
        if error_type == "AuthenticationError":
            return None, f"Invalid API key for {provider}"
        if "ratelimit" in error_type.lower() or "rate_limit" in str(e).lower():
            return None, f"Rate limit exceeded for {provider}"
        return None, f"Error occurred while generating response from {provider}"


def get_llm_response(
    task,
    prompt,
    api_key: str,
    model: str,
    provider: str,
    system: str | None = None,
) -> Tuple[str | None, str | None]:
    """
    Backwards-compatible helper used by GPTIntegrationEndpoint and friends.
    Single-message chat; optionally takes a system prompt for context-aware
    callers like the Power-K Ask AI section.
    """
    return call_llm_chat(
        system=system,
        user=f"{task}\n{prompt}",
        api_key=api_key,
        model=model,
        provider=provider,
    )


ASK_AI_BASE_SYSTEM_PROMPT = (
    "You are an assistant embedded inside a project & task management workspace. "
    "Users ask casual questions like 'what's on my plate?', 'what should I do next?', "
    "'any urgent stuff?'. Always interpret those as questions about their open tasks "
    "in this workspace, not about real-world objects. "
    "Answer in 1-3 short sentences. If task context is provided below, ground your "
    "answer in it and reference task names verbatim. If no context is provided or "
    "the question is unrelated to tasks, answer plainly and briefly."
)


def _build_workspace_context_block(*, workspace, user, limit: int = 25) -> str:
    """
    Return a compact, LLM-friendly summary of the requesting user's open tasks in
    this workspace. Empty string if there's nothing to ground in.
    """
    from plane.db.models import Issue  # local import to avoid circulars at module load

    open_groups = ("backlog", "unstarted", "started")
    qs = (
        Issue.issue_objects.filter(
            workspace=workspace,
            assignees=user,
            state__group__in=open_groups,
        )
        .select_related("state", "project")
        .order_by("-priority", "target_date", "-updated_at")[:limit]
    )

    rows = []
    for issue in qs:
        bits = [f"[{issue.project.identifier}-{issue.sequence_id}] {issue.name}"]
        if issue.state:
            bits.append(f"state={issue.state.name}")
        if issue.priority and issue.priority != "none":
            bits.append(f"priority={issue.priority}")
        if issue.target_date:
            bits.append(f"due={issue.target_date.isoformat()}")
        rows.append(" | ".join(bits))

    if not rows:
        return "The user currently has no open tasks assigned to them in this workspace."
    return "User's open tasks (most relevant first):\n- " + "\n- ".join(rows)


def _llm_error_status(error: str | None) -> int:
    if not error:
        return status.HTTP_502_BAD_GATEWAY
    lowered = error.lower()
    if "invalid api key" in lowered or "authentication" in lowered:
        return status.HTTP_401_UNAUTHORIZED
    if "rate limit" in lowered:
        return status.HTTP_429_TOO_MANY_REQUESTS
    return status.HTTP_502_BAD_GATEWAY


class GPTIntegrationEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id):
        workspace = Workspace.objects.filter(slug=slug).first()
        api_key, model, provider = get_llm_config(workspace=workspace)

        if not api_key or not model or not provider:
            return Response(
                {"error": "No LLM is configured. Set a provider, model, and API key in Settings → AI."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        task = request.data.get("task", False)
        if not task:
            return Response({"error": "Task is required"}, status=status.HTTP_400_BAD_REQUEST)

        prompt = request.data.get("prompt", False)
        if not prompt:
            return Response({"error": "Prompt is required"}, status=status.HTTP_400_BAD_REQUEST)

        text, error = get_llm_response(task, prompt, api_key, model, provider)
        if not text:
            return Response(
                {"error": error or "The LLM returned an empty response."},
                status=_llm_error_status(error),
            )

        project = Project.objects.get(pk=project_id)

        return Response(
            {
                "response": text,
                "response_html": text.replace("\n", "<br/>"),
                "project_detail": ProjectLiteSerializer(project).data,
                "workspace_detail": WorkspaceLiteSerializer(workspace).data if workspace else None,
            },
            status=status.HTTP_200_OK,
        )


class WorkspaceGPTIntegrationEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        api_key, model, provider = get_llm_config(workspace=workspace)

        if not api_key or not model or not provider:
            return Response(
                {"error": "No LLM is configured. Set a provider, model, and API key in Settings → AI."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        task = request.data.get("task", False)
        if not task:
            return Response({"error": "Task is required"}, status=status.HTTP_400_BAD_REQUEST)

        prompt = request.data.get("prompt", False)
        if not prompt:
            return Response({"error": "Prompt is required"}, status=status.HTTP_400_BAD_REQUEST)

        # When the caller (e.g. Power-K Ask AI) flags this as a workspace-aware
        # question, ground the model in the user's open tasks so it stops
        # answering "I can't see your plate" for "what's on my plate?".
        system_prompt: str | None = None
        if request.data.get("include_workspace_context") and workspace is not None:
            context_block = _build_workspace_context_block(workspace=workspace, user=request.user)
            system_prompt = f"{ASK_AI_BASE_SYSTEM_PROMPT}\n\n{context_block}"

        text, error = get_llm_response(task, prompt, api_key, model, provider, system=system_prompt)
        if not text:
            return Response(
                {"error": error or "The LLM returned an empty response."},
                status=_llm_error_status(error),
            )

        return Response(
            {
                "response": text,
                "response_html": text.replace("\n", "<br/>"),
            },
            status=status.HTTP_200_OK,
        )


TRANSCRIPT_TO_DOC_SYSTEM_PROMPT = (
    "You convert meeting transcripts into a structured spec. "
    "Return STRICT JSON only, with no surrounding prose, no markdown fences. "
    "Schema: "
    '{"sections":[{"heading":string,"body_markdown":string}],'
    '"action_items":[{"title":string,"description":string}]}'
    "\n"
    "Rules:\n"
    "- sections: 2-6 sections. Suggested headings: Summary, Decisions, Risks, Open questions, Notes.\n"
    "- body_markdown: 1-6 short bullet lines, each starting with '- '. No nested lists.\n"
    "- action_items: every commitment, follow-up, or 'someone will…'. Title <= 80 chars, imperative.\n"
    "- description: one sentence of context; empty string if none.\n"
    "- If transcript is empty or unintelligible, return {\"sections\":[],\"action_items\":[]}.\n"
)


def _extract_json_object(text: str) -> dict | None:
    """LLM responses occasionally wrap JSON in fences or chatter. Pull the first {...} block."""
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None


class TranscriptToDocEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id):
        workspace = Workspace.objects.filter(slug=slug).first()
        api_key, model, provider = get_llm_config(workspace=workspace)
        if not api_key or not model or not provider:
            return Response(
                {"error": "LLM provider API key and model are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        transcript = (request.data.get("transcript") or "").strip()
        if not transcript:
            return Response(
                {"error": "Transcript is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        hint = (request.data.get("hint") or "").strip()
        user_prompt_parts = []
        if hint:
            user_prompt_parts.append(f"Context: {hint}")
        user_prompt_parts.append("Transcript:\n" + transcript)
        user_prompt = "\n\n".join(user_prompt_parts)

        raw, llm_error = call_llm_chat(
            system=TRANSCRIPT_TO_DOC_SYSTEM_PROMPT,
            user=user_prompt,
            api_key=api_key,
            model=model,
            provider=provider,
            temperature=0.2,
        )
        if llm_error or not raw:
            return Response(
                {"error": llm_error or "An internal error occurred while drafting the spec."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        parsed = _extract_json_object(raw)
        if parsed is None or not isinstance(parsed, dict):
            log_exception(ValueError("transcript-to-doc: LLM returned non-JSON output"))
            return Response(
                {"error": "The model didn't return a valid spec. Try again with a shorter transcript."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        sections = parsed.get("sections") or []
        action_items = parsed.get("action_items") or []
        if not isinstance(sections, list) or not isinstance(action_items, list):
            return Response(
                {"error": "Malformed spec from the model."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        # Light shape sanitization — drop anything that doesn't match the schema.
        clean_sections = [
            {
                "heading": str(s.get("heading", "")).strip()[:120],
                "body_markdown": str(s.get("body_markdown", "")).strip(),
            }
            for s in sections
            if isinstance(s, dict) and s.get("heading")
        ]
        clean_action_items = [
            {
                "title": str(a.get("title", "")).strip()[:160],
                "description": str(a.get("description", "")).strip()[:600],
            }
            for a in action_items
            if isinstance(a, dict) and a.get("title")
        ]

        return Response(
            {
                "sections": clean_sections,
                "action_items": clean_action_items,
                "model": model,
                "provider": provider,
            },
            status=status.HTTP_200_OK,
        )


def _mask_api_key(key: str | None) -> str:
    if not key:
        return ""
    if len(key) <= 8:
        return "•" * len(key)
    return f"{key[:4]}…{key[-4:]}"


class WorkspaceLLMConfigEndpoint(BaseAPIView):
    """
    GET  → current workspace LLM config (provider, model, masked key, available models per provider).
    PATCH → update workspace LLM config. `llm_api_key` is encrypted at rest
            (stored in the `llm_api_key_encrypted` column; the API contract
            still uses the unsuffixed name on write).
            Send `llm_api_key: null` (or omit + set `clear: true`) to remove the workspace override.
    """

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)
        decrypted = (
            decrypt_data(workspace.llm_api_key_encrypted) if workspace.llm_api_key_encrypted else ""
        )
        return Response(
            {
                "llm_provider": workspace.llm_provider or "",
                "llm_model": workspace.llm_model or "",
                "llm_api_key_masked": _mask_api_key(decrypted),
                "has_workspace_override": bool(workspace.llm_api_key_encrypted),
                "providers": {
                    key: {
                        "name": cls.name,
                        "models": cls.models,
                        "default_model": cls.default_model,
                    }
                    for key, cls in SUPPORTED_PROVIDERS.items()
                },
            },
            status=status.HTTP_200_OK,
        )

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def patch(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        clear = bool(request.data.get("clear", False))
        if clear:
            workspace.llm_provider = None
            workspace.llm_model = None
            workspace.llm_api_key_encrypted = None
            workspace.save(
                update_fields=["llm_provider", "llm_model", "llm_api_key_encrypted"]
            )
            return Response({"status": "cleared"}, status=status.HTTP_200_OK)

        provider = (request.data.get("llm_provider") or "").strip().lower()
        model = (request.data.get("llm_model") or "").strip()
        api_key = request.data.get("llm_api_key")

        if provider and provider not in SUPPORTED_PROVIDERS:
            return Response(
                {"error": f"Unsupported provider: {provider}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if provider and model and model not in SUPPORTED_PROVIDERS[provider].models:
            return Response(
                {
                    "error": (
                        f"Model {model} not supported by {SUPPORTED_PROVIDERS[provider].name}. "
                        f"Supported: {', '.join(SUPPORTED_PROVIDERS[provider].models)}"
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        update_fields: list[str] = []
        if "llm_provider" in request.data:
            workspace.llm_provider = provider or None
            update_fields.append("llm_provider")
        if "llm_model" in request.data:
            workspace.llm_model = model or None
            update_fields.append("llm_model")
        if api_key is not None:
            # Empty string clears; otherwise encrypt and store.
            workspace.llm_api_key_encrypted = encrypt_data(api_key) if api_key else None
            update_fields.append("llm_api_key_encrypted")

        if update_fields:
            workspace.save(update_fields=update_fields)

        decrypted = (
            decrypt_data(workspace.llm_api_key_encrypted) if workspace.llm_api_key_encrypted else ""
        )
        return Response(
            {
                "llm_provider": workspace.llm_provider or "",
                "llm_model": workspace.llm_model or "",
                "llm_api_key_masked": _mask_api_key(decrypted),
                "has_workspace_override": bool(workspace.llm_api_key_encrypted),
            },
            status=status.HTTP_200_OK,
        )


def _normalise_composio_toolkits(value) -> list[str]:
    if isinstance(value, list):
        raw_items = value
    else:
        raw_items = str(value or "").split(",")
    return [str(item).strip().lower() for item in raw_items if str(item).strip()]


def _workspace_composio_payload(workspace: Workspace) -> dict:
    effective = get_composio_config_for_workspace(workspace)
    workspace_key = decrypt_data(workspace.composio_api_key_encrypted) if workspace.composio_api_key_encrypted else ""
    return {
        "configured": effective is not None,
        "source": effective.source if effective else "",
        "has_workspace_override": bool(workspace.composio_api_key_encrypted),
        "composio_api_key_masked": _mask_api_key(workspace_key),
        "composio_base_url": workspace.composio_base_url or "",
        "composio_toolkits": _normalise_composio_toolkits(workspace.composio_toolkits),
        "composio_allow_write_tools": bool(workspace.composio_allow_write_tools),
        "effective_toolkits": list(effective.toolkits) if effective else [],
        "effective_allow_write_tools": bool(effective.allow_write_tools) if effective else False,
    }


class WorkspaceComposioConfigEndpoint(BaseAPIView):
    """
    GET   → current workspace Composio config, with only a masked key.
    PATCH → update workspace-scoped Composio config.
    POST  → test the effective config by creating a Tool Router session and searching tools.
    """

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(_workspace_composio_payload(workspace), status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def patch(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        if bool(request.data.get("clear", False)):
            workspace.composio_api_key_encrypted = None
            workspace.composio_base_url = None
            workspace.composio_toolkits = None
            workspace.composio_allow_write_tools = False
            workspace.save(
                update_fields=[
                    "composio_api_key_encrypted",
                    "composio_base_url",
                    "composio_toolkits",
                    "composio_allow_write_tools",
                ]
            )
            return Response(_workspace_composio_payload(workspace), status=status.HTTP_200_OK)

        update_fields: list[str] = []
        if "composio_api_key" in request.data:
            api_key = request.data.get("composio_api_key")
            workspace.composio_api_key_encrypted = encrypt_data(api_key) if api_key else None
            update_fields.append("composio_api_key_encrypted")
        if "composio_base_url" in request.data:
            base_url = str(request.data.get("composio_base_url") or "").strip()
            workspace.composio_base_url = base_url or None
            update_fields.append("composio_base_url")
        if "composio_toolkits" in request.data:
            toolkits = _normalise_composio_toolkits(request.data.get("composio_toolkits"))
            workspace.composio_toolkits = ",".join(toolkits) if toolkits else None
            update_fields.append("composio_toolkits")
        if "composio_allow_write_tools" in request.data:
            workspace.composio_allow_write_tools = bool(request.data.get("composio_allow_write_tools"))
            update_fields.append("composio_allow_write_tools")

        if update_fields:
            workspace.save(update_fields=update_fields)
        return Response(_workspace_composio_payload(workspace), status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        config = get_composio_config_for_workspace(workspace)
        if config is None:
            return Response({"error": "Composio is not configured"}, status=status.HTTP_400_BAD_REQUEST)

        query = str(request.data.get("query") or "find github issue tools").strip()
        try:
            client = ComposioClient(
                user_id=f"{workspace.id}:{request.user.id}:settings-test",
                model="",
                config=ComposioConfig(
                    api_key=config.api_key,
                    base_url=config.base_url,
                    toolkits=config.toolkits,
                    allow_write_tools=False,
                    source=config.source,
                ),
            )
            result = client.execute_meta(
                "COMPOSIO_SEARCH_TOOLS",
                {"queries": [query], "session": {"id": client.session_id}},
            )
        except Exception as exc:  # noqa: BLE001
            return Response({"ok": False, "error": str(exc)}, status=status.HTTP_200_OK)

        return Response(
            {
                "ok": True,
                "session_id": client.session_id,
                "source": config.source,
                "preview": result,
            },
            status=status.HTTP_200_OK,
        )


class UnsplashEndpoint(BaseAPIView):
    def get(self, request):
        (UNSPLASH_ACCESS_KEY,) = get_configuration_value(
            [
                {
                    "key": "UNSPLASH_ACCESS_KEY",
                    "default": os.environ.get("UNSPLASH_ACCESS_KEY"),
                }
            ]
        )
        # Check unsplash access key
        if not UNSPLASH_ACCESS_KEY:
            return Response([], status=status.HTTP_200_OK)

        # Query parameters
        query = request.GET.get("query", False)
        page = request.GET.get("page", 1)
        per_page = request.GET.get("per_page", 20)

        url = (
            f"https://api.unsplash.com/search/photos/?client_id={UNSPLASH_ACCESS_KEY}&query={query}&page=${page}&per_page={per_page}"
            if query
            else f"https://api.unsplash.com/photos/?client_id={UNSPLASH_ACCESS_KEY}&page={page}&per_page={per_page}"
        )

        headers = {"Content-Type": "application/json"}

        resp = requests.get(url=url, headers=headers)
        return Response(resp.json(), status=resp.status_code)
