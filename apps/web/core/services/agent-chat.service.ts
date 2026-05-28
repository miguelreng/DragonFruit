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
  scope_type: "personal" | "page";
  page: string | null;
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
  user: string | null;
  user_display_name: string;
  user_avatar_url: string;
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

export type TAtlasDocWriteMode = "create" | "update";

export type TAtlasDocEditOperation = "insert_after" | "replace" | "delete";

export type TAtlasDocWriteEvent =
  | {
      event: "session_started";
      session_id: string;
      mode: TAtlasDocWriteMode;
      user_message: TAgentChatMessage;
    }
  | {
      event: "proposal_started";
      proposal_id: string;
      operation: TAtlasDocEditOperation;
      target_block_id: string;
      target_original_text: string;
    }
  | {
      event: "proposal_delta";
      proposal_id: string;
      content_text: string;
      content_html: string;
    }
  | {
      event: "proposal_completed";
      proposal_id: string;
      operation: TAtlasDocEditOperation;
      target_block_id: string;
      target_original_text: string;
      content_text: string;
      content_html: string;
    }
  | {
      event: "session_completed";
      assistant_message: TAgentChatMessage;
    }
  | {
      event: "error";
      error: string;
    };

export type TAtlasDocWritePayload = {
  page_id: string;
  project_id?: string;
  prompt: string;
  mode: TAtlasDocWriteMode;
  cursor_position?: number;
  selection_text?: string | null;
  document_markdown?: string;
  document_json?: object | null;
};

export class AgentChatService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async listSessions(
    workspaceSlug: string,
    params?: { scope_type?: "personal" | "page"; page_id?: string; project_id?: string }
  ): Promise<{ sessions: TAgentChatSession[] }> {
    return this.get(`/api/workspaces/${workspaceSlug}/agent-chats/sessions/`, { params })
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createSession(
    workspaceSlug: string,
    data: {
      agent_id?: string;
      title?: string;
      scope_type?: "personal" | "page";
      page_id?: string;
      project_id?: string;
    } = {}
  ): Promise<TAgentChatSession> {
    return this.post(`/api/workspaces/${workspaceSlug}/agent-chats/sessions/`, data)
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getSession(
    workspaceSlug: string,
    sessionId: string,
    params?: { project_id?: string }
  ): Promise<{ session: TAgentChatSession; messages: TAgentChatMessage[] }> {
    return this.get(`/api/workspaces/${workspaceSlug}/agent-chats/sessions/${sessionId}/`, { params })
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
    attachments?: TAgentChatAttachmentPayload[],
    context?: { project_id?: string; tool_mode?: "auto" | "none"; context_note?: string }
  ): Promise<TAgentChatPostResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/agent-chats/sessions/${sessionId}/messages/`, {
      content,
      attachments: attachments ?? [],
      project_id: context?.project_id,
      tool_mode: context?.tool_mode,
      context_note: context?.context_note,
    })
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async streamDocWrite(
    workspaceSlug: string,
    sessionId: string,
    payload: TAtlasDocWritePayload,
    onEvent: (event: TAtlasDocWriteEvent) => void
  ): Promise<void> {
    const response = await fetch(
      `${this.baseURL}/api/workspaces/${workspaceSlug}/agent-chats/sessions/${sessionId}/doc-writes/`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      let message = response.statusText || "Doc write failed.";
      try {
        const body = await response.json();
        message = body?.error || body?.detail || message;
      } catch {
        // Keep the status text fallback.
      }
      throw new Error(message);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("Streaming is not available in this browser.");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      // eslint-disable-next-line no-await-in-loop -- Streams have to be consumed sequentially.
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        onEvent(JSON.parse(trimmed) as TAtlasDocWriteEvent);
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) onEvent(JSON.parse(buffer.trim()) as TAtlasDocWriteEvent);
  }
}
