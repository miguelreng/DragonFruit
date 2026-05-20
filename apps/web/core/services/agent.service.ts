/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// services
import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

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
    assigned: boolean;
    mentioned: boolean;
    state_change: boolean;
    comment: boolean;
  };
  is_enabled: boolean;
  max_concurrent_runs: number;
  draft_mode: boolean;
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
};

export type TAgentRun = {
  id: string;
  agent: string;
  issue: string | null;
  trigger_event: "assigned" | "mentioned" | "state_change" | "comment" | "manual";
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  error: string;
  dispatched_at: string | null;
  completed_at: string | null;
  cancel_requested: boolean;
  created_at: string;
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
}
