/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type TProjectContextSourceProvider = "google_drive" | "manual";
export type TProjectContextSourceStatus = "pending" | "active" | "stale" | "error" | "disconnected";

export type TProjectContextSourceSelection = {
  included_paths: string[];
  manifest_hash?: string;
};

export type TProjectContextSource = {
  id: string;
  workspace: string;
  project: string;
  connection: string | null;
  provider: TProjectContextSourceProvider;
  root_external_id: string;
  display_name: string;
  status: TProjectContextSourceStatus;
  selection_config: TProjectContextSourceSelection;
  last_refreshed_at: string | null;
  last_error_code: string;
  file_count: number;
  created_at: string;
  updated_at: string;
};

export type TProjectContextConnection = {
  id: string;
  provider: "google_drive";
  account_email: string;
  is_active: boolean;
  scopes: string;
};

export type TGoogleDriveFolder = {
  id: string;
  name: string;
  modified_time: string | null;
};

export type TProjectSourceRevision = {
  id: string;
  source_file: string;
  provider_revision: string;
  content_hash: string;
  size_bytes: number;
  is_truncated: boolean;
  created_at: string;
};

export type TProjectSourceFile = {
  id: string;
  source: string;
  external_id: string;
  relative_path: string;
  mime_type: string;
  size_bytes: number;
  is_eligible: boolean;
  exclusion_reason: string;
  latest_revision: TProjectSourceRevision | null;
  created_at: string;
  updated_at: string;
};

export type TProjectContextPack = {
  project_id: string;
  character_budget: number;
  used_characters: number;
  sections: Array<{
    source_id: string;
    source_name: string;
    path: string;
    revision_id: string;
    content_hash: string;
    content: string;
    is_truncated: boolean;
  }>;
};

export class ProjectContextSourceService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getSources(workspaceSlug: string, projectId: string): Promise<TProjectContextSource[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/context-sources/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async startGoogleDrive(workspaceSlug: string, projectId: string): Promise<{ authorize_url: string }> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/context-sources/google/start/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async finishGoogleDrive(code: string, state: string | null): Promise<{
    connection: TProjectContextConnection;
    workspace_slug: string;
    project_id: string;
  }> {
    return this.post(`/api/users/me/project-context-connections/google/callback/`, { code, state })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getGoogleDriveFolders(
    workspaceSlug: string,
    projectId: string,
    connectionId: string,
    parentId = "root"
  ): Promise<{ folders: TGoogleDriveFolder[] }> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/context-sources/google/connections/${connectionId}/folders/`,
      { params: { parent_id: parentId } }
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createGoogleDriveSource(
    workspaceSlug: string,
    projectId: string,
    payload: { connection_id: string; root_external_id: string; display_name: string }
  ): Promise<TProjectContextSource> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/context-sources/`, {
      provider: "google_drive",
      ...payload,
      selection_config: { included_paths: [] },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async refreshSource(
    workspaceSlug: string,
    projectId: string,
    sourceId: string
  ): Promise<{ source: TProjectContextSource; files_discovered: number; eligible_files: number; limited: boolean }> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/context-sources/${sourceId}/refresh/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateSource(
    workspaceSlug: string,
    projectId: string,
    sourceId: string,
    payload: Partial<Pick<TProjectContextSource, "display_name" | "selection_config">>
  ): Promise<TProjectContextSource> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/context-sources/${sourceId}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteSource(workspaceSlug: string, projectId: string, sourceId: string): Promise<void> {
    await this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/context-sources/${sourceId}/`);
  }

  async getSourceFiles(workspaceSlug: string, projectId: string, sourceId: string): Promise<TProjectSourceFile[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/context-sources/${sourceId}/files/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getContextPack(workspaceSlug: string, projectId: string): Promise<TProjectContextPack> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/context-pack/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
