# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from plane.db.models import (
    Workflow,
    WorkflowNode,
    WorkflowEdge,
    WorkflowRun,
    WorkflowNodeRun,
)


class WorkflowNodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkflowNode
        fields = ["id", "kind", "config", "x", "y"]
        read_only_fields = ["id"]


class WorkflowEdgeSerializer(serializers.ModelSerializer):
    from_node = serializers.UUIDField()
    to_node = serializers.UUIDField()

    class Meta:
        model = WorkflowEdge
        fields = ["id", "from_node", "to_node", "branch"]
        read_only_fields = ["id"]


class WorkflowSerializer(serializers.ModelSerializer):
    agent_name = serializers.CharField(source="agent.name", read_only=True)
    nodes = WorkflowNodeSerializer(many=True, read_only=True)
    edges = WorkflowEdgeSerializer(many=True, read_only=True)

    class Meta:
        model = Workflow
        fields = [
            "id",
            "workspace",
            "agent",
            "agent_name",
            "name",
            "is_enabled",
            "nodes",
            "edges",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "workspace", "agent_name", "created_at", "updated_at"]


class WorkflowNodeRunSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkflowNodeRun
        fields = ["id", "node", "status", "output", "error", "agent_run", "created_at"]
        read_only_fields = fields


class WorkflowRunSerializer(serializers.ModelSerializer):
    node_runs = WorkflowNodeRunSerializer(many=True, read_only=True)

    class Meta:
        model = WorkflowRun
        fields = [
            "id",
            "workflow",
            "trigger_event",
            "issue",
            "status",
            "error",
            "started_at",
            "finished_at",
            "total_tokens",
            "cost_usd",
            "node_runs",
            "created_at",
        ]
        read_only_fields = fields
