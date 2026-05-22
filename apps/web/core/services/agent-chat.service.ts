/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
// services
import { APIService } from "@/services/api.service";

export type TAgentChatSession = {
  id: string;
  workspace: string;
  user: string;
  agent: string;
  agent_name: string;
  agent_avatar_url: string;
  title: string;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
};

/**
 * Stored attachment metadata. Comes back from the API on user-message
 * rows; images carry a `data_url` so the panel re-renders thumbnails
 * without a separate fetch, CSV/text carry a `text_excerpt` (truncated
 * server-side at ~50KB), and other types land as metadata-only.
 */
export type TAgentChatAttachment = {
  name: string;
  mime_type: string;
  size: number;
  kind: "image" | "text" | "pdf" | "other";
  data_url?: string;
  text_excerpt?: string;
  text_truncated?: boolean;
  dropped?: boolean;
};

/**
 * Outgoing attachment shape. The composer reads each file to base64
 * client-side and POSTs in this shape — server normalises + persists.
 */
export type TAgentChatAttachmentPayload = {
  name: string;
  mime_type: string;
  content_base64: string;
};

export type TAgentChatMessage = {
  id: string;
  session: string;
  role: "user" | "assistant";
  content: string;
  attachments: TAgentChatAttachment[];
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  error_message: string;
  created_at: string;
};

export type TAgentChatPostResponse = {
  user_message: TAgentChatMessage;
  assistant_message: TAgentChatMessage;
};

export class AgentChatService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async listSessions(workspaceSlug: string): Promise<{ sessions: TAgentChatSession[] }> {
    return this.get(`/api/workspaces/${workspaceSlug}/agent-chats/sessions/`)
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createSession(workspaceSlug: string, data: { agent_id: string; title?: string }): Promise<TAgentChatSession> {
    return this.post(`/api/workspaces/${workspaceSlug}/agent-chats/sessions/`, data)
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getSession(
    workspaceSlug: string,
    sessionId: string
  ): Promise<{ session: TAgentChatSession; messages: TAgentChatMessage[] }> {
    return this.get(`/api/workspaces/${workspaceSlug}/agent-chats/sessions/${sessionId}/`)
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async renameSession(workspaceSlug: string, sessionId: string, title: string): Promise<TAgentChatSession> {
    return this.patch(`/api/workspaces/${workspaceSlug}/agent-chats/sessions/${sessionId}/`, { title })
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteSession(workspaceSlug: string, sessionId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/agent-chats/sessions/${sessionId}/`)
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async sendMessage(
    workspaceSlug: string,
    sessionId: string,
    content: string,
    attachments?: TAgentChatAttachmentPayload[]
  ): Promise<TAgentChatPostResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/agent-chats/sessions/${sessionId}/messages/`, {
      content,
      attachments: attachments ?? [],
    })
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
