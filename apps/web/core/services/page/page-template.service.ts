/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { TPage, TPageTemplate, TPageTemplateDetail } from "@plane/types";
import { APIService } from "@/services/api.service";

/**
 * Workspace-scoped page templates. Browse is open to any member; authoring
 * (create / patch / delete / save-as) requires admin — enforced server-side.
 */
export class PageTemplateService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string): Promise<TPageTemplate[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/page-templates/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async retrieve(workspaceSlug: string, templateId: string): Promise<TPageTemplateDetail> {
    return this.get(`/api/workspaces/${workspaceSlug}/page-templates/${templateId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, data: Partial<TPageTemplateDetail>): Promise<TPageTemplateDetail> {
    return this.post(`/api/workspaces/${workspaceSlug}/page-templates/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    templateId: string,
    data: Partial<TPageTemplateDetail>
  ): Promise<TPageTemplateDetail> {
    return this.patch(`/api/workspaces/${workspaceSlug}/page-templates/${templateId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async destroy(workspaceSlug: string, templateId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/page-templates/${templateId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Create a new page in the given project, pre-populated from a template. */
  async instantiate(
    workspaceSlug: string,
    projectId: string,
    templateId: string,
    data: Partial<TPage> = {}
  ): Promise<TPage> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/page-templates/${templateId}/instantiate/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Save an existing page's body as a new template. */
  async saveFromPage(
    workspaceSlug: string,
    pageId: string,
    data: { name: string; description?: string }
  ): Promise<TPageTemplateDetail> {
    return this.post(`/api/workspaces/${workspaceSlug}/pages/${pageId}/save-as-template/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
