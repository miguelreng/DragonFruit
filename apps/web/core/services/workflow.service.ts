/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type TWorkflowNodeKind = "trigger" | "condition" | "action";
export type TWorkflowBranch = "" | "true" | "false";

/** A node's `config` shape depends on its kind (see backend workflow.py). */
export type TWorkflowNode = {
  id: string;
  kind: TWorkflowNodeKind;
  config: Record<string, unknown>;
  x: number;
  y: number;
};

export type TWorkflowEdge = {
  id?: string;
  from_node: string;
  to_node: string;
  branch: TWorkflowBranch;
};

export type TWorkflow = {
  id: string;
  workspace: string;
  agent: string | null;
  agent_name?: string;
  name: string;
  is_enabled: boolean;
  nodes: TWorkflowNode[];
  edges: TWorkflowEdge[];
  created_at: string;
  updated_at: string;
};

export type TWorkflowNodeRun = {
  id: string;
  node: string | null;
  status: string;
  output: Record<string, unknown>;
  error: string;
  agent_run: string | null;
  created_at: string;
};

export type TWorkflowRun = {
  id: string;
  workflow: string;
  trigger_event: string;
  issue: string | null;
  status: string;
  error: string;
  started_at: string | null;
  finished_at: string | null;
  total_tokens: number;
  cost_usd: string;
  node_runs: TWorkflowNodeRun[];
  created_at: string;
};

/** Graph payload sent on create/update — node ids are client-supplied; the
 * server recreates rows and maps those ids onto the edges, returning real ids. */
export type TWorkflowWritePayload = {
  name?: string;
  agent?: string | null;
  is_enabled?: boolean;
  nodes?: Array<Pick<TWorkflowNode, "id" | "kind" | "config" | "x" | "y">>;
  edges?: Array<Pick<TWorkflowEdge, "from_node" | "to_node" | "branch">>;
};

export class WorkflowService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string): Promise<TWorkflow[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/workflows/`)
      .then((res) => res?.data ?? [])
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async create(workspaceSlug: string, payload: TWorkflowWritePayload): Promise<TWorkflow> {
    return this.post(`/api/workspaces/${workspaceSlug}/workflows/`, payload)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async update(workspaceSlug: string, workflowId: string, payload: TWorkflowWritePayload): Promise<TWorkflow> {
    return this.patch(`/api/workspaces/${workspaceSlug}/workflows/${workflowId}/`, payload)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async destroy(workspaceSlug: string, workflowId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/workflows/${workflowId}/`)
      .then(() => undefined)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async runs(workspaceSlug: string, workflowId: string): Promise<TWorkflowRun[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/workflows/${workflowId}/runs/`)
      .then((res) => res?.data ?? [])
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async test(workspaceSlug: string, workflowId: string, payload: { issue_id: string }): Promise<unknown> {
    return this.post(`/api/workspaces/${workspaceSlug}/workflows/${workflowId}/test/`, payload)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }
}
