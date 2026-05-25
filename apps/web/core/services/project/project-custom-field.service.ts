/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { IProjectCustomField } from "@plane/types";
import { APIService } from "@/services/api.service";

export class ProjectCustomFieldService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string, projectId: string): Promise<IProjectCustomField[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/custom-fields/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(
    workspaceSlug: string,
    projectId: string,
    data: Partial<Pick<IProjectCustomField, "name" | "field_type" | "config" | "sort_order">>
  ): Promise<IProjectCustomField> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/custom-fields/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    fieldId: string,
    data: Partial<Pick<IProjectCustomField, "name" | "field_type" | "config" | "sort_order">>
  ): Promise<IProjectCustomField> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/custom-fields/${fieldId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async remove(workspaceSlug: string, projectId: string, fieldId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/custom-fields/${fieldId}/`)
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
