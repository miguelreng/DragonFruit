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
    models = ["gpt-3.5-turbo", "gpt-4o-mini", "gpt-4o", "o1-mini", "o1-preview"]
    default_model = "gpt-4o-mini"


class AnthropicProvider(LLMProvider):
    name = "Anthropic"
    models = [
        # Claude 4.x
        "claude-opus-4-7",
        "claude-sonnet-4-6",
        "claude-haiku-4-5",
        # Claude 3.5 / 3.x (legacy, still callable)
        "claude-3-5-sonnet-20240620",
        "claude-3-haiku-20240307",
        "claude-3-opus-20240229",
        "claude-3-sonnet-20240229",
        "claude-2.1",
        "claude-2",
        "claude-instant-1.2",
        "claude-instant-1",
    ]
    default_model = "claude-sonnet-4-6"


class GeminiProvider(LLMProvider):
    name = "Gemini"
    models = ["gemini-pro", "gemini-1.5-pro-latest", "gemini-pro-vision"]
    default_model = "gemini-pro"


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
       and `llm_api_key` is set. The API key is Fernet-encrypted at rest.
    2. Instance-level settings / `LLM_*` env vars.
    """
    api_key: str | None = None
    provider_key: str | None = None
    model: str | None = None

    if workspace is not None and workspace.llm_api_key:
        decrypted = decrypt_data(workspace.llm_api_key)
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
            return (
                None,
                "Gemini provider isn't wired up server-side yet. Use OpenAI or Anthropic.",
            )

        return None, f"Unsupported provider: {provider}"
    except Exception as e:
        log_exception(e)
        error_type = e.__class__.__name__
        if error_type == "AuthenticationError":
            return None, f"Invalid API key for {provider}"
        if "ratelimit" in error_type.lower() or "rate_limit" in str(e).lower():
            return None, f"Rate limit exceeded for {provider}"
        return None, f"Error occurred while generating response from {provider}"


def get_llm_response(task, prompt, api_key: str, model: str, provider: str) -> Tuple[str | None, str | None]:
    """
    Backwards-compatible helper used by GPTIntegrationEndpoint and friends.
    Single-message chat with no system prompt; now provider-aware.
    """
    return call_llm_chat(
        system=None,
        user=f"{task}\n{prompt}",
        api_key=api_key,
        model=model,
        provider=provider,
    )


class GPTIntegrationEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id):
        workspace = Workspace.objects.filter(slug=slug).first()
        api_key, model, provider = get_llm_config(workspace=workspace)

        if not api_key or not model or not provider:
            return Response(
                {"error": "LLM provider API key and model are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        task = request.data.get("task", False)
        if not task:
            return Response({"error": "Task is required"}, status=status.HTTP_400_BAD_REQUEST)

        text, error = get_llm_response(task, request.data.get("prompt", False), api_key, model, provider)
        if not text and error:
            return Response(
                {"error": "An internal error has occurred."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
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
                {"error": "LLM provider API key and model are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        task = request.data.get("task", False)
        if not task:
            return Response({"error": "Task is required"}, status=status.HTTP_400_BAD_REQUEST)

        text, error = get_llm_response(task, request.data.get("prompt", False), api_key, model, provider)
        if not text and error:
            return Response(
                {"error": "An internal error has occurred."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
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
    PATCH → update workspace LLM config. `llm_api_key` is encrypted at rest.
            Send `llm_api_key: null` (or omit + set `clear: true`) to remove the workspace override.
    """

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)
        decrypted = decrypt_data(workspace.llm_api_key) if workspace.llm_api_key else ""
        return Response(
            {
                "llm_provider": workspace.llm_provider or "",
                "llm_model": workspace.llm_model or "",
                "llm_api_key_masked": _mask_api_key(decrypted),
                "has_workspace_override": bool(workspace.llm_api_key),
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
            workspace.llm_api_key = None
            workspace.save(update_fields=["llm_provider", "llm_model", "llm_api_key"])
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
            workspace.llm_api_key = encrypt_data(api_key) if api_key else None
            update_fields.append("llm_api_key")

        if update_fields:
            workspace.save(update_fields=update_fields)

        decrypted = decrypt_data(workspace.llm_api_key) if workspace.llm_api_key else ""
        return Response(
            {
                "llm_provider": workspace.llm_provider or "",
                "llm_model": workspace.llm_model or "",
                "llm_api_key_masked": _mask_api_key(decrypted),
                "has_workspace_override": bool(workspace.llm_api_key),
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
