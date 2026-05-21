/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// helpers
import { API_BASE_URL } from "@plane/constants";
// plane web constants
import type { AI_EDITOR_TASKS } from "@/constants/ai";
// services
import { APIService } from "@/services/api.service";
// types
// FIXME:
// import { IGptResponse } from "@plane/types";
// helpers

export type TTaskPayload = {
  casual_score?: number;
  formal_score?: number;
  task: AI_EDITOR_TASKS;
  text_input: string;
};

export type TTranscriptDocSection = {
  heading: string;
  body_markdown: string;
};

export type TTranscriptDocActionItem = {
  title: string;
  description: string;
};

export type TTranscriptToDocResponse = {
  sections: TTranscriptDocSection[];
  action_items: TTranscriptDocActionItem[];
  model: string;
  provider: string;
};

export type TWorkspaceLLMProvider = {
  name: string;
  models: string[];
  default_model: string;
};

export type TWorkspaceLLMConfig = {
  llm_provider: string;
  llm_model: string;
  llm_api_key_masked: string;
  has_workspace_override: boolean;
  providers?: Record<string, TWorkspaceLLMProvider>;
};

export type TWorkspaceLLMConfigUpdate =
  | { clear: true }
  | {
      llm_provider?: string;
      llm_model?: string;
      llm_api_key?: string | null;
    };

export class AIService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async createGptTask(
    workspaceSlug: string,
    data: { prompt: string; task: string; include_workspace_context?: boolean }
  ): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/ai-assistant/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  async performEditorTask(
    workspaceSlug: string,
    data: TTaskPayload
  ): Promise<{
    response: string;
  }> {
    return this.post(`/api/workspaces/${workspaceSlug}/rephrase-grammar/`, data)
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async transcriptToDoc(
    workspaceSlug: string,
    projectId: string,
    data: { transcript: string; hint?: string }
  ): Promise<TTranscriptToDocResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/transcript-to-doc/`, data)
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getWorkspaceLLMConfig(workspaceSlug: string): Promise<TWorkspaceLLMConfig> {
    return this.get(`/api/workspaces/${workspaceSlug}/llm-config/`)
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateWorkspaceLLMConfig(workspaceSlug: string, data: TWorkspaceLLMConfigUpdate): Promise<TWorkspaceLLMConfig> {
    return this.patch(`/api/workspaces/${workspaceSlug}/llm-config/`, data)
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
