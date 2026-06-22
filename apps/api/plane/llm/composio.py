# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Small REST client for Composio Tool Router sessions.

Composio has SDKs, but the Atlas tool loop already speaks plain
function-call schemas. Keeping this as a tiny `requests` wrapper avoids a
new runtime dependency and keeps API credentials on the backend.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import requests

from .provider import LLMTool


_DEFAULT_BASE_URL = "https://backend.composio.dev/api/v3.1"
_REQUEST_TIMEOUT_SECONDS = 30
_MAX_INLINE_RESULT_CHARS = 12_000


class ComposioClientError(RuntimeError):
    """Raised when Composio is not configured or returns an error."""


@dataclass(frozen=True)
class ComposioConfig:
    api_key: str
    base_url: str = _DEFAULT_BASE_URL
    toolkits: tuple[str, ...] = ()
    allow_write_tools: bool = False
    source: str = "workspace"


def _env_list(name: str) -> list[str]:
    return [item.strip().lower() for item in (os.environ.get(name) or "").split(",") if item.strip()]


def _split_toolkits(value: str | None) -> tuple[str, ...]:
    return tuple(item.strip().lower() for item in (value or "").split(",") if item.strip())


def composio_is_configured() -> bool:
    return bool((os.environ.get("COMPOSIO_API_KEY") or "").strip())


def composio_write_tools_enabled() -> bool:
    return (os.environ.get("COMPOSIO_ALLOW_WRITE_TOOLS") or "0").strip().lower() in {"1", "true", "yes", "on"}


def get_composio_config_for_workspace(workspace=None) -> Optional[ComposioConfig]:
    """Resolve workspace Composio config, with env fallback for operators."""
    if workspace is not None and getattr(workspace, "composio_api_key_encrypted", None):
        from plane.license.utils.encryption import decrypt_data

        api_key = decrypt_data(workspace.composio_api_key_encrypted) or ""
        if api_key:
            return ComposioConfig(
                api_key=api_key,
                base_url=(workspace.composio_base_url or _DEFAULT_BASE_URL).strip().rstrip("/") or _DEFAULT_BASE_URL,
                toolkits=_split_toolkits(workspace.composio_toolkits),
                allow_write_tools=bool(workspace.composio_allow_write_tools),
                source="workspace",
            )

    api_key = (os.environ.get("COMPOSIO_API_KEY") or "").strip()
    if not api_key:
        return None
    return ComposioConfig(
        api_key=api_key,
        base_url=(os.environ.get("COMPOSIO_BASE_URL") or _DEFAULT_BASE_URL).strip().rstrip("/") or _DEFAULT_BASE_URL,
        toolkits=tuple(_env_list("COMPOSIO_TOOLKITS")),
        allow_write_tools=composio_write_tools_enabled(),
        source="environment",
    )


class ComposioClient:
    """Lazy per-Atlas-request Composio Tool Router session."""

    def __init__(self, *, user_id: str, model: str = "", config: ComposioConfig) -> None:
        if not config.api_key:
            raise ComposioClientError("COMPOSIO_API_KEY is not configured")

        self.user_id = user_id
        self.model = model
        self.base_url = config.base_url.strip().rstrip("/") or _DEFAULT_BASE_URL
        self.toolkits = list(config.toolkits)
        self.allow_write_tools = config.allow_write_tools
        self._session_id: Optional[str] = None
        self._headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "x-api-key": config.api_key,
        }

    @property
    def session_id(self) -> str:
        if not self._session_id:
            self._session_id = self._create_session()
        return self._session_id

    def _request(self, method: str, path: str, *, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        url = f"{self.base_url}{path}"
        try:
            response = requests.request(
                method,
                url,
                headers=self._headers,
                json=payload,
                timeout=_REQUEST_TIMEOUT_SECONDS,
            )
        except requests.RequestException as exc:
            raise ComposioClientError(f"network error talking to Composio: {exc}") from exc

        if response.status_code >= 400:
            raise ComposioClientError(f"Composio HTTP {response.status_code}: {response.text[:500]}")
        try:
            body = response.json()
        except ValueError as exc:
            raise ComposioClientError("Composio returned a non-JSON response") from exc
        if not isinstance(body, dict):
            raise ComposioClientError("Composio returned an unexpected response shape")
        error = body.get("error")
        if error:
            if isinstance(error, dict):
                message = error.get("message") or error.get("slug") or json.dumps(error)
            else:
                message = str(error)
            raise ComposioClientError(f"Composio error: {message}")
        return body

    def _create_session(self) -> str:
        payload: Dict[str, Any] = {
            "user_id": self.user_id,
            "manage_connections": {"enable": True, "enable_wait_for_connections": False},
        }
        if self.toolkits:
            payload["toolkits"] = {"enabled": self.toolkits}

        body = self._request("POST", "/tool_router/session", payload=payload)
        session_id = str(body.get("session_id") or "").strip()
        if not session_id:
            raise ComposioClientError("Composio did not return a session_id")
        return session_id

    def execute_meta(self, slug: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        body = self._request(
            "POST",
            f"/tool_router/session/{self.session_id}/execute_meta",
            payload={"slug": slug, "arguments": arguments},
        )
        return body

    def execute_tool(self, tool_slug: str, arguments: Dict[str, Any], *, account: str = "") -> Dict[str, Any]:
        payload: Dict[str, Any] = {"tool_slug": tool_slug, "arguments": arguments}
        if account:
            payload["account"] = account
        return self._request("POST", f"/tool_router/session/{self.session_id}/execute", payload=payload)


def _format_composio_result(body: Dict[str, Any]) -> str:
    text = json.dumps(body, ensure_ascii=False, indent=2, default=str)
    if len(text) > _MAX_INLINE_RESULT_CHARS:
        return text[:_MAX_INLINE_RESULT_CHARS] + "\n[Composio result truncated]"
    return text


def build_composio_tools(*, user_id: str, model: str = "", workspace=None) -> List[LLMTool]:
    """Return Atlas tools backed by one lazy Composio session.

    If COMPOSIO_API_KEY is absent, return no tools so Atlas behaves as it
    did before this integration.
    """
    config = get_composio_config_for_workspace(workspace)
    if config is None:
        return []

    client = ComposioClient(user_id=user_id, model=model, config=config)

    def _search_tools(args: Dict[str, Any]) -> str:
        queries = args.get("queries") or []
        if isinstance(queries, str):
            queries = [queries]
        queries = [str(q).strip() for q in queries if str(q).strip()][:5]
        if not queries:
            return "tool_error: `queries` is required"

        arguments: Dict[str, Any] = {
            "queries": queries,
            "session": {"id": client.session_id},
        }
        if client.model:
            arguments["model"] = client.model
        return _format_composio_result(client.execute_meta("COMPOSIO_SEARCH_TOOLS", arguments))

    def _get_tool_schemas(args: Dict[str, Any]) -> str:
        slugs = args.get("tool_slugs") or []
        if isinstance(slugs, str):
            slugs = [slugs]
        slugs = [str(slug).strip().upper() for slug in slugs if str(slug).strip()][:20]
        if not slugs:
            return "tool_error: `tool_slugs` is required"

        include = args.get("include") or ["input_schema"]
        if isinstance(include, str):
            include = [include]
        include = [str(item).strip() for item in include if str(item).strip()]
        return _format_composio_result(
            client.execute_meta(
                "COMPOSIO_GET_TOOL_SCHEMAS",
                {"tool_slugs": slugs, "include": include or ["input_schema"], "session_id": client.session_id},
            )
        )

    def _manage_connections(args: Dict[str, Any]) -> str:
        toolkits = args.get("toolkits") or []
        if isinstance(toolkits, str):
            toolkits = [toolkits]
        toolkits = [str(toolkit).strip().lower() for toolkit in toolkits if str(toolkit).strip()][:10]
        if not toolkits:
            return "tool_error: `toolkits` is required"

        return _format_composio_result(
            client.execute_meta(
                "COMPOSIO_MANAGE_CONNECTIONS",
                {
                    "toolkits": toolkits,
                    "reinitiate_all": bool(args.get("reinitiate_all")),
                    "session_id": client.session_id,
                },
            )
        )

    def _execute_tool(args: Dict[str, Any]) -> str:
        if not client.allow_write_tools:
            return (
                "tool_error: Composio write execution is disabled for this workspace. Enable write actions "
                "in Settings → Integrations → Composio to allow Atlas to execute external app actions."
            )
        if args.get("confirmed_by_user") is not True:
            return "tool_error: executing Composio tools requires confirmed_by_user=true after explicit user approval"

        tool_slug = str(args.get("tool_slug") or "").strip().upper()
        arguments = args.get("arguments") or {}
        account = str(args.get("account") or "").strip()
        if not tool_slug:
            return "tool_error: `tool_slug` is required"
        if not isinstance(arguments, dict):
            return "tool_error: `arguments` must be an object"
        return _format_composio_result(client.execute_tool(tool_slug, arguments, account=account))

    return [
        LLMTool(
            name="composio_search_tools",
            description=(
                "Search Composio for tools across external apps like GitHub, Slack, Gmail, Google Sheets, "
                "Notion, Linear, and more. Use this before external-app work to discover valid tool slugs."
            ),
            parameters_schema={
                "type": "object",
                "properties": {
                    "queries": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "One or more natural-language external app actions to search for.",
                    }
                },
                "required": ["queries"],
            },
            handler=_search_tools,
        ),
        LLMTool(
            name="composio_get_tool_schemas",
            description="Fetch exact input schemas for Composio tool slugs returned by composio_search_tools.",
            parameters_schema={
                "type": "object",
                "properties": {
                    "tool_slugs": {"type": "array", "items": {"type": "string"}},
                    "include": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["tool_slugs"],
            },
            handler=_get_tool_schemas,
        ),
        LLMTool(
            name="composio_manage_connections",
            description=(
                "Check or start user authentication for Composio toolkits. Return any auth links to the user "
                "and wait for them to connect before executing app actions."
            ),
            parameters_schema={
                "type": "object",
                "properties": {
                    "toolkits": {"type": "array", "items": {"type": "string"}},
                    "reinitiate_all": {"type": "boolean"},
                },
                "required": ["toolkits"],
            },
            handler=_manage_connections,
        ),
        LLMTool(
            name="composio_execute_tool",
            description=(
                "Execute an external app action through Composio using a valid tool slug and arguments. "
                "Only use after searching schemas, managing required connections, and receiving explicit user "
                "approval for the exact action."
            ),
            parameters_schema={
                "type": "object",
                "properties": {
                    "tool_slug": {"type": "string"},
                    "arguments": {"type": "object"},
                    "account": {"type": "string"},
                    "confirmed_by_user": {
                        "type": "boolean",
                        "description": "True only when the user explicitly approved this exact external app action.",
                    },
                },
                "required": ["tool_slug", "arguments", "confirmed_by_user"],
            },
            handler=_execute_tool,
        ),
    ]


__all__ = [
    "ComposioClient",
    "ComposioConfig",
    "ComposioClientError",
    "build_composio_tools",
    "composio_is_configured",
    "composio_write_tools_enabled",
    "get_composio_config_for_workspace",
]
