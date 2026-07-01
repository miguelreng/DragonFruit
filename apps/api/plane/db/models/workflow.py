# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Workflow graph engine.

A Workflow is a directed acyclic graph of steps that runs server-side when its
trigger fires. It generalizes the older single-shape `AgentAutomation`
(trigger=issue_created + fixed condition filters + implicit "run the agent"):

    Workflow ──< WorkflowNode (trigger | condition | action)
             ──< WorkflowEdge (from_node -> to_node, optional true/false branch)

A run is recorded as a `WorkflowRun` with one `WorkflowNodeRun` per executed
node. Action nodes of type "ask_atlas" reuse the existing agent runner and link
the resulting `AgentRun` from their node run, so the LLM tool-use loop, cost
tracking, and pause/resume are all reused rather than rebuilt.

Phase 1 ships the model + a dispatcher that reproduces today's behavior (a
3-node trigger -> condition -> ask_atlas graph migrated from each
`AgentAutomation`). Later phases add more trigger/condition/action types.
"""

from django.db import models

from .base import BaseModel


# Trigger events a workflow can start on. Only "issue_created" is wired into the
# dispatcher in Phase 1; the rest mirror `AgentRun.TRIGGER_CHOICES` and become
# live in a later phase.
WORKFLOW_TRIGGER_CHOICES = (
    ("issue_created", "Task created"),
    ("issue_updated", "Task updated"),
    ("assigned", "Assigned"),
    ("mentioned", "Mentioned"),
    ("state_change", "State change"),
    ("comment", "Comment"),
)

# Action node types. Phase 1 only executes "ask_atlas"; the tool-backed direct
# actions and integration actions land in later phases.
WORKFLOW_ACTION_TYPES = (
    ("ask_atlas", "Ask Atlas"),
    ("post_comment", "Post comment"),
    ("change_state", "Change state"),
    ("add_label", "Add label"),
    ("post_to_slack", "Post to Slack"),
    ("send_email", "Send email"),
    ("webhook", "Webhook"),
)

NODE_KINDS = (
    ("trigger", "Trigger"),
    ("condition", "Condition"),
    ("action", "Action"),
)

EDGE_BRANCHES = (
    ("true", "If true"),
    ("false", "If false"),
)

RUN_STATUS_CHOICES = (
    ("pending", "Pending"),
    ("running", "Running"),
    ("completed", "Completed"),
    ("failed", "Failed"),
    ("cancelled", "Cancelled"),
    ("needs_input", "Needs Input"),
)


class Workflow(BaseModel):
    """A named, enable-able automation graph scoped to a workspace."""

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="workflows",
    )
    # Default companion agent for `ask_atlas` action nodes that don't name their
    # own. Nullable so a workflow can be built before Atlas is configured.
    agent = models.ForeignKey(
        "db.Agent",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="workflows",
    )
    name = models.CharField(max_length=180)
    is_enabled = models.BooleanField(default=True)
    # Backlink to the AgentAutomation this was migrated from (Phase 1 parity),
    # so the two can be reconciled during the transition. Null for new graphs.
    source_automation = models.ForeignKey(
        "db.AgentAutomation",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="migrated_workflows",
    )

    class Meta:
        db_table = "workflows"
        verbose_name = "Workflow"
        verbose_name_plural = "Workflows"
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["workspace", "is_enabled"]),
        ]

    def __str__(self) -> str:
        return self.name


class WorkflowNode(BaseModel):
    """A single step in a workflow. `config` shape depends on `kind`:

    - trigger:   {"event": "issue_created", "object": "issue"}
    - condition: {"expression": {"op": "and", "clauses": [{"field","op","value"}]}}
    - action:    {"type": "ask_atlas", "params": {...}}
    """

    workflow = models.ForeignKey(
        Workflow,
        on_delete=models.CASCADE,
        related_name="nodes",
    )
    kind = models.CharField(max_length=16, choices=NODE_KINDS)
    config = models.JSONField(default=dict, blank=True)
    # Canvas coordinates — the builder layout persists here (server-side),
    # replacing the localStorage stopgap.
    x = models.FloatField(default=0)
    y = models.FloatField(default=0)

    class Meta:
        db_table = "workflow_nodes"
        verbose_name = "Workflow Node"
        verbose_name_plural = "Workflow Nodes"
        ordering = ("created_at",)
        indexes = [
            models.Index(fields=["workflow", "kind"]),
        ]

    def __str__(self) -> str:
        return f"{self.kind} ({self.workflow_id})"


class WorkflowEdge(BaseModel):
    """A directed connection between two nodes. `branch` is set only on edges
    leaving a condition node ("true"/"false"); empty otherwise."""

    workflow = models.ForeignKey(
        Workflow,
        on_delete=models.CASCADE,
        related_name="edges",
    )
    from_node = models.ForeignKey(
        WorkflowNode,
        on_delete=models.CASCADE,
        related_name="out_edges",
    )
    to_node = models.ForeignKey(
        WorkflowNode,
        on_delete=models.CASCADE,
        related_name="in_edges",
    )
    branch = models.CharField(max_length=8, choices=EDGE_BRANCHES, blank=True, default="")

    class Meta:
        db_table = "workflow_edges"
        verbose_name = "Workflow Edge"
        verbose_name_plural = "Workflow Edges"
        ordering = ("created_at",)
        indexes = [
            models.Index(fields=["workflow"]),
            models.Index(fields=["from_node"]),
        ]

    def __str__(self) -> str:
        return f"{self.from_node_id} -> {self.to_node_id}"


class WorkflowRun(BaseModel):
    """One execution of a workflow, triggered by an event."""

    workflow = models.ForeignKey(
        Workflow,
        on_delete=models.CASCADE,
        related_name="runs",
    )
    trigger_event = models.CharField(max_length=32, choices=WORKFLOW_TRIGGER_CHOICES)
    # The object that triggered the run (an Issue in Phase 1).
    issue = models.ForeignKey(
        "db.Issue",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="workflow_runs",
    )
    status = models.CharField(max_length=16, choices=RUN_STATUS_CHOICES, default="pending")
    error = models.TextField(blank=True, default="")
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    total_tokens = models.PositiveIntegerField(default=0)
    cost_usd = models.DecimalField(max_digits=12, decimal_places=6, default=0)

    class Meta:
        db_table = "workflow_runs"
        verbose_name = "Workflow Run"
        verbose_name_plural = "Workflow Runs"
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["workflow", "status"]),
        ]

    def __str__(self) -> str:
        return f"{self.workflow_id} :: {self.status}"


class WorkflowNodeRun(BaseModel):
    """Per-node execution record within a `WorkflowRun`. For `ask_atlas`
    action nodes, `agent_run` links the underlying agent invocation so the
    existing runs panel/telemetry carries over."""

    run = models.ForeignKey(
        WorkflowRun,
        on_delete=models.CASCADE,
        related_name="node_runs",
    )
    # Nullable so deleting a node from the graph doesn't wipe run history.
    node = models.ForeignKey(
        WorkflowNode,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="node_runs",
    )
    status = models.CharField(max_length=16, choices=RUN_STATUS_CHOICES, default="pending")
    input = models.JSONField(default=dict, blank=True)
    output = models.JSONField(default=dict, blank=True)
    agent_run = models.ForeignKey(
        "db.AgentRun",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="workflow_node_runs",
    )
    error = models.TextField(blank=True, default="")

    class Meta:
        db_table = "workflow_node_runs"
        verbose_name = "Workflow Node Run"
        verbose_name_plural = "Workflow Node Runs"
        ordering = ("created_at",)
        indexes = [
            models.Index(fields=["run"]),
        ]

    def __str__(self) -> str:
        return f"{self.run_id} :: {self.status}"
