/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TWorkflowEdge, TWorkflowNode, TWorkflowNodeKind } from "@/services/workflow.service";

// Canvas layout constants shared by the starter graph + auto-placement of new nodes.
export const NODE_W = 300;
export const V_STEP = 150;
export const BRANCH_DX = 180;
export const SPINE_X = 620;
export const TOP_Y = 48;

export const TRIGGER_EVENTS: Array<{ value: string; label: string }> = [
  { value: "issue_created", label: "Task created" },
  { value: "issue_updated", label: "Task updated" },
  { value: "assigned", label: "Assigned" },
  { value: "mentioned", label: "Mentioned" },
  { value: "state_change", label: "State changed" },
  { value: "comment", label: "New comment" },
];

export const ACTION_TYPES: Array<{ value: string; label: string; live: boolean }> = [
  { value: "ask_atlas", label: "Ask Atlas", live: true },
  { value: "post_comment", label: "Post comment", live: false },
  { value: "change_state", label: "Change state", live: false },
  { value: "add_label", label: "Add label", live: false },
  { value: "post_to_slack", label: "Post to Slack", live: false },
  { value: "send_email", label: "Send email", live: false },
  { value: "webhook", label: "Webhook", live: false },
];

const TRIGGER_LABEL: Record<string, string> = Object.fromEntries(
  TRIGGER_EVENTS.map((t) => [t.value, t.label])
);
const ACTION_LABEL: Record<string, string> = Object.fromEntries(ACTION_TYPES.map((a) => [a.value, a.label]));

/** A client-side id for new nodes; the server re-issues real ids on save. */
export const newNodeId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `n-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

export type TConditionFilters = {
  project_ids?: string[];
  priorities?: string[];
  label_ids?: string[];
  issue_type_ids?: string[];
};

export const getFilters = (node: TWorkflowNode): TConditionFilters =>
  ((node.config?.filters as TConditionFilters) ?? {}) as TConditionFilters;

export const conditionSummary = (filters: TConditionFilters): string => {
  const parts: string[] = [];
  if (filters.project_ids?.length)
    parts.push(`${filters.project_ids.length} project${filters.project_ids.length > 1 ? "s" : ""}`);
  if (filters.priorities?.length) parts.push(`priority: ${filters.priorities.join(", ")}`);
  if (filters.label_ids?.length)
    parts.push(`${filters.label_ids.length} label${filters.label_ids.length > 1 ? "s" : ""}`);
  if (filters.issue_type_ids?.length)
    parts.push(`${filters.issue_type_ids.length} type${filters.issue_type_ids.length > 1 ? "s" : ""}`);
  return parts.length ? parts.join(" · ") : "All matching tasks";
};

/** Title + subtitle shown on a node card, derived from its kind + config. */
export const nodeDisplay = (node: TWorkflowNode, agentName: string): { title: string; subtitle: string } => {
  if (node.kind === "trigger") {
    const event = String(node.config?.event ?? "issue_created");
    return { title: TRIGGER_LABEL[event] ?? "Trigger", subtitle: "Starts the workflow" };
  }
  if (node.kind === "condition") {
    return { title: "Match conditions", subtitle: conditionSummary(getFilters(node)) };
  }
  const type = String(node.config?.type ?? "ask_atlas");
  const label = ACTION_LABEL[type] ?? "Action";
  return { title: type === "ask_atlas" ? `Ask ${agentName}` : label, subtitle: "Runs when reached" };
};

export const nodeKindLabel = (kind: TWorkflowNodeKind): string =>
  kind === "trigger" ? "Trigger" : kind === "condition" ? "Condition" : "Action";

/** A fresh trigger → condition → action graph for a new workflow. */
export const starterGraph = (): { nodes: TWorkflowNode[]; edges: TWorkflowEdge[] } => {
  const trigger: TWorkflowNode = {
    id: newNodeId(),
    kind: "trigger",
    config: { event: "issue_created", object: "issue" },
    x: SPINE_X - NODE_W / 2,
    y: TOP_Y,
  };
  const condition: TWorkflowNode = {
    id: newNodeId(),
    kind: "condition",
    config: { filters: {} },
    x: SPINE_X - NODE_W / 2,
    y: TOP_Y + V_STEP,
  };
  const action: TWorkflowNode = {
    id: newNodeId(),
    kind: "action",
    config: { type: "ask_atlas", params: {} },
    x: SPINE_X - NODE_W / 2 - BRANCH_DX,
    y: TOP_Y + V_STEP * 2,
  };
  return {
    nodes: [trigger, condition, action],
    edges: [
      { from_node: trigger.id, to_node: condition.id, branch: "" },
      { from_node: condition.id, to_node: action.id, branch: "true" },
    ],
  };
};

/** Place a newly-added child node relative to its parent. */
export const placeChild = (parent: TWorkflowNode, branch: "" | "true" | "false"): { x: number; y: number } => {
  const dx = branch === "true" ? -BRANCH_DX : branch === "false" ? BRANCH_DX : 0;
  return { x: parent.x + dx, y: parent.y + V_STEP };
};
