/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { TIssue } from "@plane/types";
import { APIService } from "@/services/api.service";

export type TWorkItemTemplate = {
  id: string;
  workspace: string;
  name: string;
  description: string;
  default_name: string;
  default_description_html: string;
  default_priority: string;
  default_assignee_ids: string[];
  default_label_ids: string[];
  owned_by: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Workspace-scoped Work Item (Task) templates. Mirrors the shape of
 * `ProjectTemplateService` and `PageTemplateService`. Browse is open to
 * any workspace member; authoring (create / patch / delete) is admin-only
 * (enforced server-side).
 */
export class WorkItemTemplateService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string): Promise<TWorkItemTemplate[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/work-item-templates/`)
      .then((res) => res?.data ?? [])
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async retrieve(workspaceSlug: string, templateId: string): Promise<TWorkItemTemplate> {
    return this.get(`/api/workspaces/${workspaceSlug}/work-item-templates/${templateId}/`)
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, data: Partial<TWorkItemTemplate>): Promise<TWorkItemTemplate> {
    return this.post(`/api/workspaces/${workspaceSlug}/work-item-templates/`, data)
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    templateId: string,
    data: Partial<TWorkItemTemplate>
  ): Promise<TWorkItemTemplate> {
    return this.patch(`/api/workspaces/${workspaceSlug}/work-item-templates/${templateId}/`, data)
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async destroy(workspaceSlug: string, templateId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/work-item-templates/${templateId}/`)
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * Materialise a template into a fresh Issue inside the given project.
   * `data` may carry overrides for `name`, `description_html`, `priority`,
   * `state_id`, `assignee_ids`, `label_ids` — anything not passed falls
   * back to the template's defaults (server-side resolution).
   */
  async instantiate(
    workspaceSlug: string,
    projectId: string,
    templateId: string,
    data: Record<string, unknown> = {}
  ): Promise<TIssue> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/work-item-templates/${templateId}/instantiate/`,
      data
    )
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
