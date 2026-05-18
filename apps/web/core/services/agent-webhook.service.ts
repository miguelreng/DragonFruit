/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type TAgentWebhookConfig =
  | { configured: false }
  | {
      configured: true;
      id: string;
      url: string;
      is_enabled: boolean;
      has_secret: boolean;
      created_at: string | null;
      updated_at: string | null;
      /** Returned exactly once on create or rotation. */
      secret?: string;
    };

export type TAgentDispatchPayload = {
  prompt: string;
  project_id?: string | null;
  page_id?: string | null;
  block_id?: string | null;
  selection_text?: string | null;
};

export class AgentWebhookService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async fetchConfig(workspaceSlug: string): Promise<TAgentWebhookConfig> {
    return this.get(`/api/workspaces/${workspaceSlug}/agent-webhook/`).then((r) => r?.data);
  }

  async upsert(
    workspaceSlug: string,
    data: { url: string; is_enabled?: boolean; rotate_secret?: boolean }
  ): Promise<TAgentWebhookConfig> {
    return this.put(`/api/workspaces/${workspaceSlug}/agent-webhook/`, data).then((r) => r?.data);
  }

  async remove(workspaceSlug: string): Promise<void> {
    await this.delete(`/api/workspaces/${workspaceSlug}/agent-webhook/`);
  }

  async dispatch(
    workspaceSlug: string,
    payload: TAgentDispatchPayload
  ): Promise<{ dispatched: boolean; dispatch_id: string }> {
    return this.post(`/api/workspaces/${workspaceSlug}/agent-webhook/dispatch/`, payload).then((r) => r?.data);
  }
}
