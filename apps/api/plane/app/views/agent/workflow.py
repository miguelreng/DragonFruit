# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""CRUD + run endpoints for the workflow graph engine.

A workflow is stored as nodes + edges. Writes replace the whole graph in one
call: the client sends its own node ids, the server recreates rows and maps
those ids onto the edges. The graph is validated as a DAG (one trigger, no
cycles, condition branches labelled true/false) before persisting.
"""

from django.db import transaction
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers.workflow import WorkflowRunSerializer, WorkflowSerializer
from plane.db.models import (
    Agent,
    Issue,
    Workflow,
    WorkflowEdge,
    WorkflowNode,
    WorkflowRun,
    Workspace,
)

from ..base import BaseAPIView

_NODE_KINDS = {"trigger", "condition", "action"}
_BRANCHES = {"", "true", "false"}


def _validate_and_normalise(nodes, edges):
    """Return (error_message | None). Nodes/edges are lists of dicts using
    client-supplied node ids. Validates a well-formed DAG."""
    if not isinstance(nodes, list) or not isinstance(edges, list):
        return "nodes and edges must be arrays"
    if not nodes:
        return "a workflow needs at least a trigger node"

    ids = []
    triggers = 0
    kinds = {}
    for n in nodes:
        nid = str(n.get("id") or "").strip()
        kind = n.get("kind")
        if not nid:
            return "each node needs an id"
        if kind not in _NODE_KINDS:
            return f"invalid node kind: {kind}"
        ids.append(nid)
        kinds[nid] = kind
        if kind == "trigger":
            triggers += 1
    if triggers != 1:
        return "a workflow must have exactly one trigger node"
    if len(set(ids)) != len(ids):
        return "duplicate node ids"

    id_set = set(ids)
    adjacency = {nid: [] for nid in ids}
    branch_count = {}
    for e in edges:
        f = str(e.get("from_node") or "").strip()
        t = str(e.get("to_node") or "").strip()
        branch = e.get("branch") or ""
        if f not in id_set or t not in id_set:
            return "edge references an unknown node"
        if branch not in _BRANCHES:
            return f"invalid branch: {branch}"
        if kinds[f] == "condition":
            if branch not in {"true", "false"}:
                return "condition edges must be labelled true/false"
            branch_count[f] = branch_count.get(f, 0) + 1
            if branch_count[f] > 2:
                return "a condition can have at most two outgoing edges"
        adjacency[f].append(t)

    # Cycle detection (DFS colouring).
    WHITE, GREY, BLACK = 0, 1, 2
    color = {nid: WHITE for nid in ids}

    def has_cycle(node):
        color[node] = GREY
        for nxt in adjacency[node]:
            if color[nxt] == GREY:
                return True
            if color[nxt] == WHITE and has_cycle(nxt):
                return True
        color[node] = BLACK
        return False

    for nid in ids:
        if color[nid] == WHITE and has_cycle(nid):
            return "workflow graph must be acyclic"
    return None


def _apply_graph(workflow, nodes, edges):
    """Replace the workflow's nodes + edges from the payload. Assumes the graph
    was validated. Returns nothing; raises on DB error (caller wraps in atomic)."""
    workflow.nodes.all().delete()  # edges cascade
    id_map = {}
    for n in nodes:
        row = WorkflowNode.objects.create(
            workflow=workflow,
            kind=n["kind"],
            config=n.get("config") or {},
            x=float(n.get("x") or 0),
            y=float(n.get("y") or 0),
        )
        id_map[str(n["id"])] = row
    for e in edges:
        WorkflowEdge.objects.create(
            workflow=workflow,
            from_node=id_map[str(e["from_node"])],
            to_node=id_map[str(e["to_node"])],
            branch=e.get("branch") or "",
        )


def _resolve_agent(workspace, agent_id):
    if not agent_id:
        return None
    return Agent.objects.filter(workspace=workspace, pk=agent_id, deleted_at__isnull=True).first()


class WorkflowEndpoint(BaseAPIView):
    """List + create workflows for a workspace."""

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        rows = (
            Workflow.objects.filter(workspace__slug=slug, deleted_at__isnull=True)
            .select_related("agent")
            .prefetch_related("nodes", "edges")
        )
        return Response(WorkflowSerializer(rows, many=True).data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        name = (request.data.get("name") or "").strip()
        if not name:
            return Response({"error": "name is required"}, status=status.HTTP_400_BAD_REQUEST)
        nodes = request.data.get("nodes") or []
        edges = request.data.get("edges") or []
        err = _validate_and_normalise(nodes, edges)
        if err:
            return Response({"error": err}, status=status.HTTP_400_BAD_REQUEST)

        workspace = Workspace.objects.filter(slug=slug).first()
        if not workspace:
            return Response({"error": "workspace not found"}, status=status.HTTP_404_NOT_FOUND)
        agent = _resolve_agent(workspace, request.data.get("agent"))

        with transaction.atomic():
            workflow = Workflow.objects.create(
                workspace=workspace,
                agent=agent,
                name=name[:180],
                is_enabled=bool(request.data.get("is_enabled", True)),
            )
            _apply_graph(workflow, nodes, edges)
        workflow = Workflow.objects.prefetch_related("nodes", "edges").get(pk=workflow.id)
        return Response(WorkflowSerializer(workflow).data, status=status.HTTP_201_CREATED)


class WorkflowDetailEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug, workflow_id):
        workflow = (
            Workflow.objects.filter(workspace__slug=slug, pk=workflow_id, deleted_at__isnull=True)
            .prefetch_related("nodes", "edges")
            .first()
        )
        if not workflow:
            return Response({"error": "workflow not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(WorkflowSerializer(workflow).data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def patch(self, request, slug, workflow_id):
        workflow = Workflow.objects.filter(workspace__slug=slug, pk=workflow_id, deleted_at__isnull=True).first()
        if not workflow:
            return Response({"error": "workflow not found"}, status=status.HTTP_404_NOT_FOUND)

        if "name" in request.data:
            name = (request.data.get("name") or "").strip()
            if not name:
                return Response({"error": "name cannot be empty"}, status=status.HTTP_400_BAD_REQUEST)
            workflow.name = name[:180]
        if "is_enabled" in request.data:
            workflow.is_enabled = bool(request.data.get("is_enabled"))
        if "agent" in request.data:
            workflow.agent = _resolve_agent(workflow.workspace, request.data.get("agent"))

        replace_graph = "nodes" in request.data or "edges" in request.data
        if replace_graph:
            nodes = request.data.get("nodes") or []
            edges = request.data.get("edges") or []
            err = _validate_and_normalise(nodes, edges)
            if err:
                return Response({"error": err}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            workflow.save()
            if replace_graph:
                _apply_graph(workflow, request.data.get("nodes") or [], request.data.get("edges") or [])
        workflow = Workflow.objects.prefetch_related("nodes", "edges").get(pk=workflow.id)
        return Response(WorkflowSerializer(workflow).data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug, workflow_id):
        workflow = Workflow.objects.filter(workspace__slug=slug, pk=workflow_id, deleted_at__isnull=True).first()
        if not workflow:
            return Response({"error": "workflow not found"}, status=status.HTTP_404_NOT_FOUND)
        workflow.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkflowRunListEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug, workflow_id):
        runs = (
            WorkflowRun.objects.filter(
                workflow__workspace__slug=slug,
                workflow_id=workflow_id,
                deleted_at__isnull=True,
            )
            .prefetch_related("node_runs")
            .order_by("-created_at")[:50]
        )
        return Response(WorkflowRunSerializer(runs, many=True).data, status=status.HTTP_200_OK)


class WorkflowTestRunEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug, workflow_id):
        workflow = Workflow.objects.filter(workspace__slug=slug, pk=workflow_id, deleted_at__isnull=True).first()
        if not workflow:
            return Response({"error": "workflow not found"}, status=status.HTTP_404_NOT_FOUND)
        issue_id = request.data.get("issue_id")
        if not issue_id:
            return Response({"error": "issue_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        issue = Issue.objects.filter(workspace__slug=slug, pk=issue_id, deleted_at__isnull=True).first()
        if not issue:
            return Response({"error": "issue not found"}, status=status.HTTP_404_NOT_FOUND)

        # Reuse the workflow's own trigger event so the run mirrors production.
        trigger = workflow.nodes.filter(kind="trigger").first()
        event = (trigger.config or {}).get("event", "issue_created") if trigger else "issue_created"
        run = WorkflowRun.objects.create(workflow=workflow, trigger_event=event, issue=issue, status="pending")
        from plane.bgtasks.workflow_task import run_workflow

        run_workflow.delay(str(run.id))
        return Response(
            {"queued": True, "workflow_id": str(workflow.id), "run_id": str(run.id)},
            status=status.HTTP_200_OK,
        )
