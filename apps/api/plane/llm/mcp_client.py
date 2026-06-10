# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Synchronous JSON-RPC client for external MCP servers.

The companion piece to apps/api/plane/app/views/mcp/ (which makes
Dragon Fruit *be* an MCP server). This module lets Dragon Fruit's own
agents *consume* MCP servers run by anyone — GitHub's official server,
a teammate's local server, the Dragon Fruit server in another
workspace, etc.

Why synchronous: the agent dispatcher runs in a Celery worker (sync),
and bringing in an async HTTP client would mean threading asyncio
through the whole tool-use loop. `requests` is good enough — every
tool call is one HTTP round-trip with a short timeout, parallelism is
delivered by Celery process pools, not by async.

Tool-name collisions: when an agent has multiple MCP servers
configured and two of them expose a tool with the same name (e.g.
both `github` and `gitlab` ship a `list_issues`), we'd dispatch the
wrong one. To avoid that, all wrapped tools get the server's name
prefixed with `__` — `github__list_issues`, `gitlab__list_issues`.
The agent sees the prefixed name; we strip the prefix before
forwarding to the underlying MCP server.
"""

from __future__ import annotations

import ipaddress
import json
import logging
import socket
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import requests

from .provider import LLMTool


logger = logging.getLogger(__name__)


# Timeouts, in seconds. Tool calls get a longer budget because some
# MCP tools (search across a large repo, etc.) legitimately take time.
_INIT_TIMEOUT = 10
_LIST_TIMEOUT = 10
_CALL_TIMEOUT = 30

_MCP_PROTOCOL_VERSION = "2024-11-05"


class MCPClientError(RuntimeError):
    """Raised when an MCP server returns an error or is unreachable.

    Distinct from generic RuntimeError so the dispatcher can catch
    "this MCP server is broken" specifically and degrade gracefully
    (skip the server, log, keep going with built-in tools).
    """


def validate_mcp_server_url(url: str) -> str:
    """Validate that a URL is safe to use as an MCP server endpoint.

    Blocks SSRF by rejecting non-http(s) schemes and any URL that
    resolves to a private, loopback, link-local, reserved, unspecified,
    or multicast address.

    Note: DNS-rebinding after this check is a known residual risk; the
    check at __init__ time mitigates the common case but cannot
    prevent a host that changes its DNS answer between validation and
    the actual request.

    Returns the URL unchanged on success; raises MCPClientError on
    any violation.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise MCPClientError("MCP server URL must be http or https")
    host = parsed.hostname
    if not host:
        raise MCPClientError("MCP server URL must include a host")
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        raise MCPClientError(f"MCP server host does not resolve: {host}") from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_unspecified
            or ip.is_multicast
        ):
            raise MCPClientError("MCP server URL resolves to a disallowed address")
    return url


class MCPClient:
    """One client instance per (server, dispatch) pair.

    Lifecycle: `initialize()` once, `list_tools()` once, then any number
    of `call_tool(name, args)`. We don't pool connections across
    dispatches — each agent run spins up fresh clients and tears them
    down, which keeps state out of the worker process between invocations.
    """

    def __init__(self, *, url: str, auth_header_value: Optional[str] = None) -> None:
        if not url:
            raise MCPClientError("url is required")
        url = validate_mcp_server_url(url)          # SSRF guard
        self.url = url.rstrip("/") + "/" if not url.endswith("/") else url
        # Force trailing slash so we POST to the same path every time —
        # MCP servers that respond to /mcp/ won't accept /mcp without
        # a redirect, and we don't want to deal with following 307s.
        self._auth_header = auth_header_value
        self._next_id = 1
        self._initialized = False

    # ------------------------------------------------------------------ #
    # JSON-RPC plumbing                                                   #
    # ------------------------------------------------------------------ #

    def _post(self, method: str, params: Optional[Dict[str, Any]] = None, *, timeout: int) -> Dict[str, Any]:
        req_id = self._next_id
        self._next_id += 1
        body = {"jsonrpc": "2.0", "id": req_id, "method": method}
        if params is not None:
            body["params"] = params

        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if self._auth_header:
            # The stored value is the full header content (e.g.
            # "Bearer ghp_xyz" or "Basic …"). If the operator gave us
            # just a token without a scheme, prepend "Bearer" — most
            # MCP servers expect it.
            value = self._auth_header
            if " " not in value:
                value = f"Bearer {value}"
            headers["Authorization"] = value

        try:
            resp = requests.post(self.url, data=json.dumps(body), headers=headers, timeout=timeout)
        except requests.RequestException as exc:
            raise MCPClientError(f"{method}: network error talking to {self.url}: {exc}") from exc

        if resp.status_code == 204:
            return {}
        if resp.status_code >= 400:
            raise MCPClientError(f"{method}: HTTP {resp.status_code} from {self.url}: {resp.text[:300]}")

        try:
            payload = resp.json()
        except ValueError as exc:
            raise MCPClientError(f"{method}: non-JSON response from {self.url}") from exc

        if isinstance(payload, list):
            raise MCPClientError(f"{method}: server returned a batched response (unsupported)")
        if not isinstance(payload, dict):
            raise MCPClientError(f"{method}: malformed response shape")

        if payload.get("error"):
            err = payload["error"]
            raise MCPClientError(f"{method}: server error {err.get('code')}: {err.get('message')}")

        return payload.get("result") or {}

    # ------------------------------------------------------------------ #
    # MCP protocol                                                        #
    # ------------------------------------------------------------------ #

    def initialize(self) -> Dict[str, Any]:
        """Run the MCP handshake. Required before any other RPC.

        We don't strictly need to call this for tools/list and
        tools/call on most servers — they tolerate skipping — but the
        spec says clients must, and some stricter servers refuse
        otherwise. Cheap to do, so do it.
        """
        result = self._post(
            "initialize",
            {
                "protocolVersion": _MCP_PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": {"name": "Dragon Fruit Agent", "version": "0.1.0"},
            },
            timeout=_INIT_TIMEOUT,
        )
        # Fire-and-forget the initialized notification. We don't care
        # about the response; some servers don't even reply.
        try:
            self._post("notifications/initialized", None, timeout=_INIT_TIMEOUT)
        except MCPClientError:
            pass
        self._initialized = True
        return result

    def list_tools(self) -> List[Dict[str, Any]]:
        """Fetch the server's tool catalog. List of `{name, description, inputSchema}`."""
        if not self._initialized:
            self.initialize()
        result = self._post("tools/list", {}, timeout=_LIST_TIMEOUT)
        tools = result.get("tools") or []
        if not isinstance(tools, list):
            raise MCPClientError("tools/list: expected a list, got something else")
        return tools

    def call_tool(self, name: str, arguments: Optional[Dict[str, Any]] = None) -> str:
        """Invoke one tool and return its text content.

        MCP returns content as a list of typed blocks (text, image,
        resource_link). For the agent's purposes we only care about
        text — concatenate any text blocks, ignore the rest, and
        return the joined string. If the server flagged `isError`,
        prefix the response with `tool_error:` so the LLM's loop
        recognizes it the same way it would a local tool error.
        """
        if not self._initialized:
            self.initialize()
        result = self._post(
            "tools/call",
            {"name": name, "arguments": arguments or {}},
            timeout=_CALL_TIMEOUT,
        )
        content = result.get("content") or []
        text_blocks = [
            block.get("text", "")
            for block in content
            if isinstance(block, dict) and block.get("type") == "text"
        ]
        body = "\n".join(t for t in text_blocks if t)
        if result.get("isError"):
            return f"tool_error: {body or 'remote tool returned isError'}"
        return body or "(empty response)"


# ====================================================================== #
# Wrapping remote tools as LLMTools                                       #
# ====================================================================== #


def wrap_mcp_server_as_tools(
    server_config: Dict[str, Any],
    *,
    decrypt_auth: Optional[Any] = None,
) -> List[LLMTool]:
    """Connect to an MCP server, discover its tools, return them as LLMTools.

    `server_config` is one entry from `Agent.mcp_servers`:
        {name, url, auth_header_encrypted?, enabled?}

    `decrypt_auth` is the Fernet decrypt callable — passed in so this
    module doesn't depend on plane.license.utils.encryption directly
    (keeps the LLM package decoupled from the license module).

    Tool names are prefixed with `<server_name>__` to avoid collisions
    across multiple MCP servers configured on the same agent. The
    handler strips the prefix before invoking the underlying server.
    """
    name = (server_config.get("name") or "").strip()
    url = (server_config.get("url") or "").strip()
    if not name or not url:
        raise MCPClientError("server config missing name or url")

    auth_value = None
    encrypted = server_config.get("auth_header_encrypted") or ""
    if encrypted:
        if decrypt_auth is None:
            raise MCPClientError("auth header is encrypted but no decrypt callable was provided")
        try:
            auth_value = decrypt_auth(encrypted)
        except Exception as exc:  # noqa: BLE001
            raise MCPClientError(f"failed to decrypt auth header for {name}: {exc}") from exc

    client = MCPClient(url=url, auth_header_value=auth_value)
    remote_tools = client.list_tools()

    wrapped: List[LLMTool] = []
    for t in remote_tools:
        remote_name = t.get("name")
        if not remote_name:
            continue

        prefixed = f"{name}__{remote_name}"
        # Closure over `remote_name` + `client` so the handler talks to
        # the right server. Default-arg trick avoids the classic Python
        # late-binding-in-loop bug.
        def _handler(args: Dict[str, Any], _remote_name: str = remote_name, _client: MCPClient = client) -> str:
            try:
                return _client.call_tool(_remote_name, args)
            except MCPClientError as exc:
                return f"tool_error: {exc}"

        wrapped.append(
            LLMTool(
                name=prefixed,
                description=(
                    f"[via MCP server '{name}'] " + (t.get("description") or "(no description)")
                ),
                parameters_schema=t.get("inputSchema") or {"type": "object", "properties": {}},
                handler=_handler,
            )
        )

    return wrapped


__all__ = ["MCPClient", "MCPClientError", "validate_mcp_server_url", "wrap_mcp_server_as_tools"]
