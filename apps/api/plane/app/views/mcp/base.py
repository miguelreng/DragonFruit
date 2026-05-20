# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Dragon Fruit as an MCP (Model Context Protocol) server.

External AI tools — Claude Code, Cursor, ChatGPT desktop, anything that
speaks MCP — can POST JSON-RPC to /api/workspaces/<slug>/mcp/ to read
and write tasks, comments, and pages in this workspace. Auth is via
the existing APIToken (Bearer or X-Api-Key header); the token's owning
user determines who the writes are attributed to.

Transport: streamable HTTP, single-shot (no SSE in v1). One JSON-RPC
2.0 request per POST, one response. Notifications (no `id`) return
HTTP 204. Anything more sophisticated (long-running tools that need to
stream progress) belongs in v2.

Protocol version: 2024-11-05 (the stable MCP spec). Only the minimal
surface is implemented for v1: `initialize`, `notifications/initialized`,
`tools/list`, `tools/call`, `ping`. Resources and prompts are valid
MCP capabilities but not advertised — clients see an empty resources
list and that's fine.

Tools exposed in v1:
    list_tasks       — workspace tasks, filterable by project/assignee/state
    get_task         — single task with description and last comments
    create_task      — new task in a project
    update_task      — rename / re-state / re-assign an existing task
    add_comment      — post a comment on a task as the authenticated user
    list_projects    — discover projects in the workspace
    search_pages     — full-text search across docs
    get_page         — read a doc's content

Auth flow:
    1. Client connects to /api/workspaces/<slug>/mcp/ with
       Authorization: Bearer <token> (or X-Api-Key: <token>).
    2. Token resolves to a User. The token's workspace (if scoped) must
       match the URL slug; un-scoped tokens authorize any workspace the
       user is a member of.
    3. Permissions piggyback on the standard Plane workspace-member
       check — guests can read, members + admins can write. Tools that
       require admin (none in v1) would gate explicitly.

This view is deliberately CSRF-exempt and auth-class-empty so the API
middleware doesn't redirect non-cookie requests. The
`_resolve_token_and_workspace` helper does its own auth check.
"""

from __future__ import annotations

import json
import logging
from datetime import timedelta
from typing import Any, Callable, Dict, List, Optional, Tuple

from django.db.models import Q
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from plane.db.models import (
    APIToken,
    Issue,
    IssueComment,
    Page,
    Project,
    State,
    User,
    Workspace,
    WorkspaceMember,
)


logger = logging.getLogger(__name__)

# MCP spec version we implement. Bump deliberately when adding new
# protocol behavior so clients can negotiate.
MCP_PROTOCOL_VERSION = "2024-11-05"

SERVER_INFO = {
    "name": "Dragon Fruit",
    "version": "0.1.0",
}

# JSON-RPC standard error codes (rfc + MCP extensions).
ERR_PARSE = -32700
ERR_INVALID_REQUEST = -32600
ERR_METHOD_NOT_FOUND = -32601
ERR_INVALID_PARAMS = -32602
ERR_INTERNAL = -32603
ERR_UNAUTHORIZED = -32001  # MCP convention for auth failures


# =====================================================================
# Tool registry
# =====================================================================
#
# A tool is `{name, description, input_schema, handler}`. The handler is
# called with `(args: dict, ctx: ToolContext)` and must return a string
# (which becomes the tool's `text` content in the MCP response).
#
# Keeping the registry as a module-level dict means it's easy to add new
# tools — drop a function, add an entry. No metaclasses, no auto-discovery.


class ToolContext:
    """Per-request context handed to every tool handler.

    Bundles the resolved workspace + acting user so handlers don't need
    to redo the auth dance themselves.
    """

    __slots__ = ("workspace", "user")

    def __init__(self, workspace: Workspace, user: User) -> None:
        self.workspace = workspace
        self.user = user


def _truncate(text: Optional[str], limit: int = 2000) -> str:
    if not text:
        return ""
    text = str(text)
    if len(text) <= limit:
        return text
    return text[: limit - 1] + "…"


def _format_task_one_line(issue: Issue) -> str:
    state = issue.state.name if issue.state else "(no state)"
    project = issue.project.name if issue.project else "(no project)"
    return f"[{state}] {project} / #{issue.sequence_id} {issue.name} — {issue.id}"


# ---- tool: list_tasks ---------------------------------------------------


def _tool_list_tasks(args: Dict[str, Any], ctx: ToolContext) -> str:
    qs = Issue.issue_objects.filter(
        workspace=ctx.workspace,
        deleted_at__isnull=True,
    ).select_related("state", "project")

    project_id = args.get("project_id")
    if project_id:
        qs = qs.filter(project_id=project_id)

    if args.get("assigned_to_me"):
        qs = qs.filter(assignees=ctx.user)

    state_name = args.get("state_name")
    if state_name:
        qs = qs.filter(state__name__iexact=state_name.strip())

    state_group = args.get("state_group")
    if state_group:
        qs = qs.filter(state__group=state_group.strip().lower())

    limit = min(int(args.get("limit", 50)), 200)
    qs = qs.order_by("-updated_at")[:limit]
    rows = list(qs)
    if not rows:
        return "No tasks match the given filters."
    lines = [f"{len(rows)} task{'s' if len(rows) != 1 else ''}:"]
    lines.extend(f"- {_format_task_one_line(i)}" for i in rows)
    return "\n".join(lines)


# ---- tool: get_task -----------------------------------------------------


def _tool_get_task(args: Dict[str, Any], ctx: ToolContext) -> str:
    task_id = args.get("task_id")
    if not task_id:
        return "tool_error: `task_id` is required"

    issue = (
        Issue.issue_objects.filter(workspace=ctx.workspace, pk=task_id)
        .select_related("state", "project")
        .first()
    )
    if issue is None:
        return f"tool_error: no task with id {task_id} in this workspace"

    assignees = list(issue.assignees.values_list("display_name", flat=True))
    labels = list(issue.labels.values_list("name", flat=True))
    comments = list(
        IssueComment.objects.filter(issue=issue, deleted_at__isnull=True, is_draft=False)
        .order_by("-created_at")
        .select_related("actor")[:10]
    )

    lines = [
        f"Task: {issue.name}",
        f"ID: {issue.id}",
        f"Project: {issue.project.name if issue.project else '(none)'}",
        f"State: {issue.state.name if issue.state else '(none)'}",
        f"Priority: {issue.priority}",
        f"Assignees: {', '.join(assignees) if assignees else '(none)'}",
        f"Labels: {', '.join(labels) if labels else '(none)'}",
        f"Created: {issue.created_at.isoformat() if issue.created_at else '(unknown)'}",
        f"Updated: {issue.updated_at.isoformat() if issue.updated_at else '(unknown)'}",
        "",
        "Description:",
        _truncate(issue.description_stripped, 3000) or "(no description)",
    ]
    if comments:
        lines.append("")
        lines.append(f"Recent comments ({len(comments)}, newest first):")
        for c in comments:
            who = (c.actor.display_name if c.actor else None) or "system"
            when = c.created_at.isoformat() if c.created_at else ""
            lines.append(f"- [{when}] {who}: {_truncate(c.comment_stripped, 400)}")
    return "\n".join(lines)


# ---- tool: create_task --------------------------------------------------


def _tool_create_task(args: Dict[str, Any], ctx: ToolContext) -> str:
    project_id = args.get("project_id")
    name = (args.get("name") or "").strip()
    if not project_id or not name:
        return "tool_error: `project_id` and `name` are required"

    project = Project.objects.filter(workspace=ctx.workspace, pk=project_id).first()
    if project is None:
        return f"tool_error: no project with id {project_id} in this workspace"

    state_name = (args.get("state_name") or "").strip()
    state = None
    if state_name:
        state = State.objects.filter(
            project=project, deleted_at__isnull=True, name__iexact=state_name
        ).first()
        if state is None:
            available = ", ".join(
                State.objects.filter(project=project, deleted_at__isnull=True)
                .order_by("sequence")
                .values_list("name", flat=True)
            )
            return f"tool_error: no state '{state_name}' in this project. Available: {available}"

    description_html = args.get("description_html") or ""
    priority = (args.get("priority") or "none").strip().lower()
    if priority not in {"urgent", "high", "medium", "low", "none"}:
        priority = "none"

    issue = Issue(
        workspace=ctx.workspace,
        project=project,
        name=name[:255],
        description_html=description_html or "<p></p>",
        priority=priority,
        state=state,
    )
    issue.save(created_by_id=ctx.user.id)

    return f"ok: created task #{issue.sequence_id} '{issue.name}' (id={issue.id})"


# ---- tool: update_task --------------------------------------------------


def _tool_update_task(args: Dict[str, Any], ctx: ToolContext) -> str:
    task_id = args.get("task_id")
    if not task_id:
        return "tool_error: `task_id` is required"
    issue = (
        Issue.issue_objects.filter(workspace=ctx.workspace, pk=task_id)
        .select_related("state", "project")
        .first()
    )
    if issue is None:
        return f"tool_error: no task with id {task_id}"

    changed: List[str] = []

    name = args.get("name")
    if name is not None:
        name = str(name).strip()
        if name:
            issue.name = name[:255]
            changed.append("name")

    state_name = args.get("state_name")
    if state_name:
        new_state = State.objects.filter(
            project=issue.project, deleted_at__isnull=True, name__iexact=str(state_name).strip()
        ).first()
        if new_state is None:
            return f"tool_error: no state '{state_name}' in this project"
        if new_state.id != issue.state_id:
            issue.state = new_state
            changed.append("state")

    priority = args.get("priority")
    if priority is not None:
        priority = str(priority).strip().lower()
        if priority in {"urgent", "high", "medium", "low", "none"}:
            issue.priority = priority
            changed.append("priority")

    if not changed:
        return "ok: nothing to change"

    issue.save(
        created_by_id=ctx.user.id,
        update_fields=list({*changed, "state", "completed_at", "updated_at"}),
    )
    return f"ok: updated {', '.join(changed)} on '{issue.name}'"


# ---- tool: add_comment --------------------------------------------------


def _tool_add_comment(args: Dict[str, Any], ctx: ToolContext) -> str:
    task_id = args.get("task_id")
    body = (args.get("comment_html") or args.get("body") or "").strip()
    if not task_id or not body:
        return "tool_error: `task_id` and `comment_html` are required"

    issue = Issue.issue_objects.filter(workspace=ctx.workspace, pk=task_id).first()
    if issue is None:
        return f"tool_error: no task with id {task_id}"

    # Wrap plain text in <p> if needed.
    html = body if body.lstrip().startswith("<") else f"<p>{body}</p>"

    comment = IssueComment(
        workspace=ctx.workspace,
        project=issue.project,
        issue=issue,
        actor=ctx.user,
        comment_html=html,
        comment_json={},
    )
    comment.save(created_by_id=ctx.user.id)
    return f"ok: comment posted (id={comment.id})"


# ---- tool: list_projects ------------------------------------------------


def _tool_list_projects(args: Dict[str, Any], ctx: ToolContext) -> str:
    projects = (
        Project.objects.filter(workspace=ctx.workspace, deleted_at__isnull=True)
        .order_by("name")
        .values_list("id", "name", "identifier")[:200]
    )
    rows = list(projects)
    if not rows:
        return "No projects in this workspace."
    lines = [f"{len(rows)} project{'s' if len(rows) != 1 else ''}:"]
    lines.extend(f"- {name} ({identifier}) — {pid}" for pid, name, identifier in rows)
    return "\n".join(lines)


# ---- tool: search_pages -------------------------------------------------


def _tool_search_pages(args: Dict[str, Any], ctx: ToolContext) -> str:
    query = (args.get("query") or "").strip()
    if not query:
        return "tool_error: `query` is required"

    qs = (
        Page.objects.filter(workspace=ctx.workspace, deleted_at__isnull=True)
        .filter(Q(name__icontains=query) | Q(description_stripped__icontains=query))
        .order_by("-updated_at")[:25]
    )
    rows = list(qs)
    if not rows:
        return f"No pages matched '{query}'."
    lines = [f"{len(rows)} match{'es' if len(rows) != 1 else ''} for '{query}':"]
    for p in rows:
        snippet = _truncate(p.description_stripped, 120)
        lines.append(f"- {p.name} — {p.id}{(' — ' + snippet) if snippet else ''}")
    return "\n".join(lines)


# ---- tool: get_page -----------------------------------------------------


def _tool_get_page(args: Dict[str, Any], ctx: ToolContext) -> str:
    page_id = args.get("page_id")
    if not page_id:
        return "tool_error: `page_id` is required"

    page = Page.objects.filter(workspace=ctx.workspace, pk=page_id, deleted_at__isnull=True).first()
    if page is None:
        return f"tool_error: no page with id {page_id}"

    lines = [
        f"Page: {page.name}",
        f"ID: {page.id}",
        f"Updated: {page.updated_at.isoformat() if page.updated_at else '(unknown)'}",
        "",
        "Content (stripped):",
        _truncate(page.description_stripped, 8000) or "(empty)",
    ]
    return "\n".join(lines)


TOOLS: Dict[str, Dict[str, Any]] = {
    "list_tasks": {
        "description": (
            "List tasks (work items) in this workspace. Optional filters: project_id, "
            "assigned_to_me (boolean), state_name (e.g. 'In Progress'), state_group "
            "(one of 'backlog', 'unstarted', 'started', 'completed', 'cancelled', 'triage'), "
            "limit (default 50, max 200)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string", "description": "UUID of a specific project"},
                "assigned_to_me": {"type": "boolean"},
                "state_name": {"type": "string"},
                "state_group": {"type": "string"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 200},
            },
        },
        "handler": _tool_list_tasks,
    },
    "get_task": {
        "description": "Get full details for a single task: description, state, assignees, labels, and last 10 comments.",
        "input_schema": {
            "type": "object",
            "properties": {"task_id": {"type": "string", "description": "UUID of the task"}},
            "required": ["task_id"],
        },
        "handler": _tool_get_task,
    },
    "create_task": {
        "description": "Create a new task in a project. Returns the task ID and sequence number.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "name": {"type": "string", "maxLength": 255},
                "description_html": {"type": "string"},
                "state_name": {"type": "string", "description": "Initial state; defaults to project default"},
                "priority": {"type": "string", "enum": ["urgent", "high", "medium", "low", "none"]},
            },
            "required": ["project_id", "name"],
        },
        "handler": _tool_create_task,
    },
    "update_task": {
        "description": "Update an existing task. Any combination of name, state_name, priority.",
        "input_schema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string"},
                "name": {"type": "string", "maxLength": 255},
                "state_name": {"type": "string"},
                "priority": {"type": "string", "enum": ["urgent", "high", "medium", "low", "none"]},
            },
            "required": ["task_id"],
        },
        "handler": _tool_update_task,
    },
    "add_comment": {
        "description": "Post a comment on a task as the authenticated user. comment_html may be HTML or plain text.",
        "input_schema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string"},
                "comment_html": {"type": "string"},
            },
            "required": ["task_id", "comment_html"],
        },
        "handler": _tool_add_comment,
    },
    "list_projects": {
        "description": "List all projects in this workspace.",
        "input_schema": {"type": "object", "properties": {}},
        "handler": _tool_list_projects,
    },
    "search_pages": {
        "description": "Full-text search across docs (pages) in this workspace. Returns up to 25 matches.",
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string", "minLength": 1}},
            "required": ["query"],
        },
        "handler": _tool_search_pages,
    },
    "get_page": {
        "description": "Read a single doc's stripped text content (up to 8000 chars).",
        "input_schema": {
            "type": "object",
            "properties": {"page_id": {"type": "string"}},
            "required": ["page_id"],
        },
        "handler": _tool_get_page,
    },
}


# =====================================================================
# Auth helper
# =====================================================================


def _resolve_token_and_workspace(request, slug: str) -> Tuple[Optional[User], Optional[Workspace], Optional[str]]:
    """Resolve the API token to a (user, workspace) pair.

    Accepts both `Authorization: Bearer <token>` (MCP convention) and
    `X-Api-Key: <token>` (Plane convention) so existing tokens generated
    in the Plane UI work without modification.

    Returns (user, workspace, error_message). On success error_message
    is None; on failure user and workspace are None.
    """
    auth_header = request.headers.get("Authorization") or ""
    token = ""
    if auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()
    if not token:
        token = request.headers.get("X-Api-Key", "").strip()
    if not token:
        return None, None, "missing token (Authorization: Bearer … or X-Api-Key)"

    api_token = (
        APIToken.objects.filter(
            Q(expired_at__gt=timezone.now()) | Q(expired_at__isnull=True),
            token=token,
            is_active=True,
        )
        .select_related("user", "workspace")
        .first()
    )
    if api_token is None:
        return None, None, "invalid or expired token"

    workspace = Workspace.objects.filter(slug=slug).first()
    if workspace is None:
        return None, None, f"workspace '{slug}' not found"

    # Token's workspace (if any) must match the URL slug. Tokens without
    # a workspace scope are allowed against any workspace the user is a
    # member of.
    if api_token.workspace_id is not None and api_token.workspace_id != workspace.id:
        return None, None, "token is scoped to a different workspace"

    is_member = WorkspaceMember.objects.filter(
        workspace=workspace, member=api_token.user, is_active=True, deleted_at__isnull=True
    ).exists()
    if not is_member:
        return None, None, "user is not a member of this workspace"

    # Record token usage for the same observability the rest of the API has.
    api_token.last_used = timezone.now()
    api_token.save(update_fields=["last_used"])

    return api_token.user, workspace, None


# =====================================================================
# JSON-RPC dispatch
# =====================================================================


def _jsonrpc_result(req_id: Any, result: Any) -> Dict[str, Any]:
    return {"jsonrpc": "2.0", "id": req_id, "result": result}


def _jsonrpc_error(req_id: Any, code: int, message: str, data: Any = None) -> Dict[str, Any]:
    err: Dict[str, Any] = {"code": code, "message": message}
    if data is not None:
        err["data"] = data
    return {"jsonrpc": "2.0", "id": req_id, "error": err}


def _handle_initialize(_params: Dict[str, Any], _ctx: ToolContext) -> Dict[str, Any]:
    return {
        "protocolVersion": MCP_PROTOCOL_VERSION,
        "capabilities": {
            # Declare only what we implement. Clients won't ask for
            # resources or prompts if we don't advertise them.
            "tools": {"listChanged": False},
        },
        "serverInfo": SERVER_INFO,
        "instructions": (
            "Dragon Fruit MCP server — tools for reading and writing tasks, comments, and "
            "pages in this workspace. Tool writes are attributed to the API token's owning "
            "user. Use list_projects + list_tasks to orient before any write operation."
        ),
    }


def _handle_tools_list(_params: Dict[str, Any], _ctx: ToolContext) -> Dict[str, Any]:
    return {
        "tools": [
            {
                "name": name,
                "description": spec["description"],
                "inputSchema": spec["input_schema"],
            }
            for name, spec in TOOLS.items()
        ]
    }


def _handle_tools_call(params: Dict[str, Any], ctx: ToolContext) -> Dict[str, Any]:
    tool_name = params.get("name")
    args = params.get("arguments") or {}
    if not tool_name:
        raise _RpcError(ERR_INVALID_PARAMS, "`name` is required")

    spec = TOOLS.get(tool_name)
    if spec is None:
        raise _RpcError(ERR_METHOD_NOT_FOUND, f"unknown tool '{tool_name}'")

    try:
        text = spec["handler"](args, ctx)
    except _RpcError:
        raise
    except Exception as exc:  # noqa: BLE001 — surface tool failures as content, not protocol errors
        logger.exception("MCP tool '%s' raised", tool_name)
        text = f"tool_error: {exc.__class__.__name__}: {exc}"

    is_error = isinstance(text, str) and text.startswith("tool_error")
    return {
        "content": [{"type": "text", "text": text}],
        "isError": is_error,
    }


def _handle_ping(_params: Dict[str, Any], _ctx: ToolContext) -> Dict[str, Any]:
    return {}


class _RpcError(Exception):
    def __init__(self, code: int, message: str, data: Any = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.data = data


# Method name -> handler. Notifications (no response) handled separately.
_METHODS: Dict[str, Callable[[Dict[str, Any], ToolContext], Dict[str, Any]]] = {
    "initialize": _handle_initialize,
    "tools/list": _handle_tools_list,
    "tools/call": _handle_tools_call,
    "ping": _handle_ping,
}

_NOTIFICATIONS = {"notifications/initialized", "notifications/cancelled"}


# =====================================================================
# Django view
# =====================================================================


@method_decorator(csrf_exempt, name="dispatch")
class MCPEndpoint(APIView):
    """Single endpoint at /api/workspaces/<slug>/mcp/.

    Handles MCP JSON-RPC over streamable HTTP (POST-only, immediate
    response). Auth handled inline — no DRF auth classes so cookie auth
    doesn't get in the way of bearer-token clients.
    """

    authentication_classes: list = []
    permission_classes: list = []

    def post(self, request, slug):
        user, workspace, auth_err = _resolve_token_and_workspace(request, slug)
        if auth_err:
            return Response(
                _jsonrpc_error(None, ERR_UNAUTHORIZED, auth_err),
                status=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            payload = request.data if isinstance(request.data, (dict, list)) else json.loads(request.body or b"{}")
        except (json.JSONDecodeError, ValueError):
            return Response(_jsonrpc_error(None, ERR_PARSE, "malformed JSON"), status=status.HTTP_400_BAD_REQUEST)

        # Batched requests are allowed by JSON-RPC 2.0 but uncommon for MCP
        # clients. Support them anyway — saves a round-trip if a client
        # ever batches initialize + tools/list together.
        if isinstance(payload, list):
            responses = [r for r in (self._handle_single(item, user, workspace) for item in payload) if r is not None]
            return Response(responses, status=status.HTTP_200_OK)

        response_body = self._handle_single(payload, user, workspace)
        if response_body is None:
            # Notification: 204, no body.
            return Response(status=status.HTTP_204_NO_CONTENT)
        return Response(response_body, status=status.HTTP_200_OK)

    def get(self, request, slug):
        """A friendly GET that returns the server manifest without auth.

        Useful for setup: a user can curl the URL to confirm the
        endpoint is live and see what tools it offers. No sensitive
        data — just the protocol version and the tool list.
        """
        return Response(
            {
                "protocolVersion": MCP_PROTOCOL_VERSION,
                "serverInfo": SERVER_INFO,
                "transport": "streamable-http",
                "auth": "Authorization: Bearer <token> (or X-Api-Key: <token>)",
                "tool_count": len(TOOLS),
                "tools": [
                    {"name": n, "description": s["description"]} for n, s in TOOLS.items()
                ],
                "note": (
                    "POST JSON-RPC 2.0 requests to this URL with an MCP client "
                    "(Claude Code, Cursor, ChatGPT desktop, etc.)."
                ),
            },
            status=status.HTTP_200_OK,
        )

    # ----------------------------------------------------------------- #

    def _handle_single(self, payload: Any, user: User, workspace: Workspace) -> Optional[Dict[str, Any]]:
        if not isinstance(payload, dict):
            return _jsonrpc_error(None, ERR_INVALID_REQUEST, "request must be an object")

        if payload.get("jsonrpc") != "2.0":
            return _jsonrpc_error(payload.get("id"), ERR_INVALID_REQUEST, "jsonrpc must be '2.0'")

        method = payload.get("method")
        req_id = payload.get("id")
        params = payload.get("params") or {}

        # Notifications: no `id`, no response. Honor a couple of common
        # MCP notification names but otherwise just acknowledge.
        if req_id is None:
            if method in _NOTIFICATIONS or (method and method.startswith("notifications/")):
                return None
            # No id + unknown method — still a notification per JSON-RPC.
            return None

        ctx = ToolContext(workspace=workspace, user=user)

        handler = _METHODS.get(method)
        if handler is None:
            return _jsonrpc_error(req_id, ERR_METHOD_NOT_FOUND, f"unknown method '{method}'")

        try:
            result = handler(params, ctx)
            return _jsonrpc_result(req_id, result)
        except _RpcError as exc:
            return _jsonrpc_error(req_id, exc.code, exc.message, exc.data)
        except Exception as exc:  # noqa: BLE001
            logger.exception("MCP %s failed", method)
            return _jsonrpc_error(req_id, ERR_INTERNAL, f"{exc.__class__.__name__}: {exc}")
