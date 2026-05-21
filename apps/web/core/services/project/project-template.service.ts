/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type TProjectTemplateInitialTask = {
  name: string;
  description?: string;
  priority?: "urgent" | "high" | "medium" | "low" | "none";
};

export type TProjectTemplate = {
  id: string;
  workspace: string;
  name: string;
  description: string;
  logo_props: Record<string, unknown>;
  project_description: string;
  network: number;
  initial_tasks: TProjectTemplateInitialTask[];
  owned_by: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Workspace-scoped project templates. Browse is open to any member;
 * authoring (create / patch / delete) and instantiate require admin —
 * enforced server-side.
 */
export class ProjectTemplateService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string): Promise<TProjectTemplate[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/project-templates/`)
      .then((res) => res?.data ?? [])
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async retrieve(workspaceSlug: string, templateId: string): Promise<TProjectTemplate> {
    return this.get(`/api/workspaces/${workspaceSlug}/project-templates/${templateId}/`)
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, data: Partial<TProjectTemplate>): Promise<TProjectTemplate> {
    return this.post(`/api/workspaces/${workspaceSlug}/project-templates/`, data)
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    templateId: string,
    data: Partial<TProjectTemplate>
  ): Promise<TProjectTemplate> {
    return this.patch(`/api/workspaces/${workspaceSlug}/project-templates/${templateId}/`, data)
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async destroy(workspaceSlug: string, templateId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/project-templates/${templateId}/`)
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * Materialise a template into a fresh project. `data` carries the
   * project-create payload (name, identifier, etc.) — same shape as
   * POST /projects/. The server merges in the template's defaults
   * for anything the caller didn't override, then bulk-creates the
   * template's `initial_tasks` inside the new project.
   */
  async instantiate(
    workspaceSlug: string,
    templateId: string,
    data: Record<string, unknown>
  ): Promise<{ id: string; identifier: string; name: string }> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/project-templates/${templateId}/instantiate/`,
      data
    )
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * Snapshot an existing project as a new template. Captures the
   * project's description/network/logo + the first ~50 top-level
   * issues as initial_tasks. Sub-issues, attachments, comments, labels,
   * custom fields are intentionally not captured — templates are seeds.
   */
  async saveAsTemplate(
    workspaceSlug: string,
    projectId: string,
    data: { name?: string; description?: string; include_tasks?: boolean }
  ): Promise<TProjectTemplate> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/save-as-template/`,
      data
    )
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
