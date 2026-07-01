# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Data migration: convert each AgentAutomation into an equivalent 3-node
Workflow (trigger -> condition -> ask_atlas action).

This is Phase 1 parity for the workflow graph engine — the issue-created signal
now dispatches Workflows, so existing automations must exist as workflows to
keep firing. Idempotent via Workflow.source_automation; reversible by deleting
migrated workflows.
"""

from django.db import migrations


# Canvas coordinates matching the builder's default tree layout.
_TRIGGER_XY = (470.0, 48.0)
_CONDITION_XY = (470.0, 204.0)
_ACTION_XY = (290.0, 388.0)


def forwards(apps, schema_editor):
    AgentAutomation = apps.get_model("db", "AgentAutomation")
    Workflow = apps.get_model("db", "Workflow")
    WorkflowNode = apps.get_model("db", "WorkflowNode")
    WorkflowEdge = apps.get_model("db", "WorkflowEdge")

    already = set(
        Workflow.objects.filter(source_automation__isnull=False).values_list(
            "source_automation_id", flat=True
        )
    )

    for automation in AgentAutomation.objects.filter(deleted_at__isnull=True).select_related("agent"):
        if automation.id in already:
            continue

        workflow = Workflow.objects.create(
            workspace_id=automation.workspace_id,
            agent_id=automation.agent_id,
            name=automation.name,
            is_enabled=automation.is_enabled,
            source_automation_id=automation.id,
        )
        trigger = WorkflowNode.objects.create(
            workflow=workflow,
            kind="trigger",
            config={"event": automation.trigger_event or "issue_created", "object": "issue"},
            x=_TRIGGER_XY[0],
            y=_TRIGGER_XY[1],
        )
        condition = WorkflowNode.objects.create(
            workflow=workflow,
            kind="condition",
            config={"filters": automation.conditions or {}},
            x=_CONDITION_XY[0],
            y=_CONDITION_XY[1],
        )
        action = WorkflowNode.objects.create(
            workflow=workflow,
            kind="action",
            config={"type": "ask_atlas", "params": {}},
            x=_ACTION_XY[0],
            y=_ACTION_XY[1],
        )
        WorkflowEdge.objects.create(
            workflow=workflow, from_node=trigger, to_node=condition, branch=""
        )
        WorkflowEdge.objects.create(
            workflow=workflow, from_node=condition, to_node=action, branch="true"
        )


def backwards(apps, schema_editor):
    Workflow = apps.get_model("db", "Workflow")
    # Nodes and edges cascade on Workflow delete.
    Workflow.objects.filter(source_automation__isnull=False).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0159_workflow_graph_engine"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
