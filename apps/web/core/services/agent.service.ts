/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// services
import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

/** An MCP server as returned by the API (ciphertext stripped — only presence is exposed). */
export type TMcpServerSummary = {
  name: string;
  url: string;
  enabled: boolean;
  has_auth_header: boolean;
};

/**
 * An MCP server as WRITTEN back via `mcp_servers_set`. Send the full desired
 * set on each update. Omit `auth_header` on an existing entry (matched by
 * `name`) to preserve its stored token; pass a string to set/rotate it, or
 * "" to wipe it.
 */
export type TMcpServerWrite = {
  name: string;
  url: string;
  enabled?: boolean;
  auth_header?: string;
};

export type TAgent = {
  id: string;
  workspace: string;
  bot_user_id: string;
  bot_user_email: string;
  name: string;
  description: string;
  avatar_url: string;
  system_prompt: string;
  provider_model: string;
  api_base_url: string;
  has_api_key: boolean;
  triggers: {
    issue_created: boolean;
    assigned: boolean;
    mentioned: boolean;
    state_change: boolean;
    comment: boolean;
  };
  tool_policies: Record<string, "auto" | "ask" | "never">;
  is_enabled: boolean;
  max_concurrent_runs: number;
  draft_mode: boolean;
  mcp_servers: TMcpServerSummary[];
  created_at: string;
  updated_at: string;
};

export type TAgentCreatePayload = {
  name: string;
  description?: string;
  avatar_url?: string;
  system_prompt?: string;
  provider_model?: string;
  api_base_url?: string;
  api_key?: string;
};

export type TAgentUpdatePayload = Partial<TAgentCreatePayload> & {
  is_enabled?: boolean;
  draft_mode?: boolean;
  max_concurrent_runs?: number;
  triggers?: Partial<TAgent["triggers"]>;
  tool_policies?: Record<string, "auto" | "ask" | "never">;
  mcp_servers_set?: TMcpServerWrite[];
};

export type TAgentToolCall = {
  kind?: string;
  phase?: string;
  name?: string;
  arguments?: Record<string, unknown>;
  result?: string;
  iteration?: number;
};

export type TAgentRun = {
  id: string;
  agent: string;
  issue: string | null;
  trigger_event: "issue_created" | "assigned" | "mentioned" | "state_change" | "comment" | "manual";
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  error: string;
  dispatched_at: string | null;
  completed_at: string | null;
  cancel_requested: boolean;
  iterations: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  tool_calls: TAgentToolCall[];
  created_at: string;
};

export type TAgentDraftKind = "issue" | "page";
export type TAgentMemory = {
  id: string;
  workspace: string;
  agent: string | null;
  key: string;
  value: string;
  tags: string[];
  source: string;
  use_count: number;
  last_accessed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TAgentCostSummaryWindow = {
  runs: number;
  cost_usd: number;
  total_tokens: number;
};

export type TAgentCostSummaryByAgent = {
  agent_id: string;
  name: string;
  runs: number;
  cost_usd: number;
  total_tokens: number;
};

export type TAgentCostSummary = {
  all_time: TAgentCostSummaryWindow;
  this_month: TAgentCostSummaryWindow;
  last_7_days: TAgentCostSummaryWindow;
  by_agent_last_30_days: TAgentCostSummaryByAgent[];
};

export type TAgentAutomation = {
  id: string;
  workspace: string;
  agent: string;
  agent_name: string;
  name: string;
  trigger_event: "issue_created";
  conditions: TAgentAutomationConditions;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type TAgentAutomationConditions = {
  project_ids?: string[];
  priorities?: Array<"urgent" | "high" | "medium" | "low" | "none">;
  label_ids?: string[];
  issue_type_ids?: string[];
};

export class AgentService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string): Promise<TAgent[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/agents/`)
      .then((res) => res?.data ?? [])
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async retrieve(workspaceSlug: string, agentId: string): Promise<TAgent> {
    return this.get(`/api/workspaces/${workspaceSlug}/agents/${agentId}/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async create(workspaceSlug: string, payload: TAgentCreatePayload): Promise<TAgent> {
    return this.post(`/api/workspaces/${workspaceSlug}/agents/`, payload)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async update(workspaceSlug: string, agentId: string, payload: TAgentUpdatePayload): Promise<TAgent> {
    return this.patch(`/api/workspaces/${workspaceSlug}/agents/${agentId}/`, payload)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async destroy(workspaceSlug: string, agentId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/agents/${agentId}/`)
      .then(() => undefined)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async runs(workspaceSlug: string, agentId: string): Promise<TAgentRun[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/agents/${agentId}/runs/`)
      .then((res) => res?.data ?? [])
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  /**
   * Hard-stop an agent: disables it AND sets `cancel_requested` on every
   * pending/running run. The Celery loop polls that flag between turns
   * and bails. Returns the updated agent with a `cancelled_runs` count
   * so the UI can surface "stopped N in-flight runs" if it wants to.
   *
   * Distinct from `update(..., { is_enabled: false })`, which just
   * pauses new dispatches and lets any in-flight run finish naturally.
   */
  async stop(workspaceSlug: string, agentId: string): Promise<TAgent & { cancelled_runs?: number }> {
    return this.post(`/api/workspaces/${workspaceSlug}/agents/${agentId}/stop/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  /**
   * Cancel one specific in-flight run without disabling the agent.
   * Sets `cancel_requested=true` on the row; the LLM loop polls it
   * between turns. No-op if the run is already terminal.
   */
  async cancelRun(workspaceSlug: string, agentId: string, runId: string): Promise<TAgentRun> {
    return this.post(`/api/workspaces/${workspaceSlug}/agents/${agentId}/runs/${runId}/cancel/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  /**
   * Approve a draft comment posted by an agent (issue or page comment).
   * Flips is_draft=false; the comment becomes visible in the normal
   * activity feed.
   */
  async approveDraft(
    workspaceSlug: string,
    kind: TAgentDraftKind,
    commentId: string
  ): Promise<{ id: string; is_draft: boolean }> {
    return this.post(`/api/workspaces/${workspaceSlug}/agent-drafts/${kind}/${commentId}/approve/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  /**
   * Discard a draft comment posted by an agent. Soft-deletes the row.
   * Refuses if the comment has already been approved (use the normal
   * comment-delete endpoint for that case).
   */
  async discardDraft(workspaceSlug: string, kind: TAgentDraftKind, commentId: string): Promise<void> {
    return this.post(`/api/workspaces/${workspaceSlug}/agent-drafts/${kind}/${commentId}/discard/`)
      .then(() => undefined)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  /**
   * Aggregated cost summary for the workspace's agent runs. Powers the
   * home-page cost widget.
   */
  async costSummary(workspaceSlug: string): Promise<TAgentCostSummary> {
    return this.get(`/api/workspaces/${workspaceSlug}/agents/cost-summary/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async listMemory(
    workspaceSlug: string,
    params?: { agent_id?: string; q?: string; limit?: number }
  ): Promise<TAgentMemory[]> {
    const qs = new URLSearchParams();
    if (params?.agent_id) qs.set("agent_id", params.agent_id);
    if (params?.q) qs.set("q", params.q);
    if (params?.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.get(`/api/workspaces/${workspaceSlug}/agent-memory/${suffix}`)
      .then((res) => res?.data ?? [])
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async createMemory(
    workspaceSlug: string,
    payload: Pick<TAgentMemory, "agent" | "key" | "value" | "tags" | "source">
  ): Promise<TAgentMemory> {
    return this.post(`/api/workspaces/${workspaceSlug}/agent-memory/`, payload)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async listAutomations(workspaceSlug: string): Promise<TAgentAutomation[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/agent-automations/`)
      .then((res) => res?.data ?? [])
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async createAutomation(
    workspaceSlug: string,
    payload: {
      name: string;
      agent: string;
      trigger_event: "issue_created";
      conditions?: TAgentAutomationConditions;
      is_enabled?: boolean;
    }
  ): Promise<TAgentAutomation> {
    return this.post(`/api/workspaces/${workspaceSlug}/agent-automations/`, payload)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async updateAutomation(
    workspaceSlug: string,
    automationId: string,
    payload: Partial<Pick<TAgentAutomation, "name" | "agent" | "conditions" | "is_enabled">>
  ): Promise<TAgentAutomation> {
    return this.patch(`/api/workspaces/${workspaceSlug}/agent-automations/${automationId}/`, payload)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async deleteAutomation(workspaceSlug: string, automationId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/agent-automations/${automationId}/`)
      .then(() => undefined)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async cloneAutomation(workspaceSlug: string, automationId: string): Promise<TAgentAutomation> {
    return this.post(`/api/workspaces/${workspaceSlug}/agent-automations/${automationId}/clone/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async testAutomation(
    workspaceSlug: string,
    automationId: string,
    payload: { issue_id: string }
  ): Promise<{ queued: boolean; automation_id: string; agent_id: string; issue_id: string; trigger_event: string }> {
    return this.post(`/api/workspaces/${workspaceSlug}/agent-automations/${automationId}/test/`, payload)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }
}
