/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type {
  TProjectBookmark,
  TProjectBookmarkBulkImportResult,
  TProjectBookmarkComment,
  TProjectBookmarkCreatePayload,
} from "@plane/types";
import { APIService } from "@/services/api.service";

export type TBookmarkQueryParams = {
  query?: string;
  tag?: string;
  project_id?: string;
};

export type TBookmarkUrlMetadata = {
  title: string;
  description: string;
  url: string;
  metadata: TProjectBookmark["metadata"];
};

export class BookmarkService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async fetchUrlMetadata(workspaceSlug: string, url: string): Promise<TBookmarkUrlMetadata> {
    return this.post(`/api/workspaces/${workspaceSlug}/bookmark-metadata/`, { url })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listProjectBookmarks(
    workspaceSlug: string,
    projectId: string,
    params?: TBookmarkQueryParams
  ): Promise<{ results: TProjectBookmark[]; total_pages?: number }> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/bookmarks/`, { params })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listWorkspaceBookmarks(
    workspaceSlug: string,
    params?: TBookmarkQueryParams
  ): Promise<{ results: TProjectBookmark[]; total_pages?: number }> {
    return this.get(`/api/workspaces/${workspaceSlug}/bookmarks/`, { params })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async retrieveBookmark(workspaceSlug: string, projectId: string, bookmarkId: string): Promise<TProjectBookmark> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/bookmarks/${bookmarkId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createBookmark(
    workspaceSlug: string,
    projectId: string,
    payload: TProjectBookmarkCreatePayload
  ): Promise<TProjectBookmark> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/bookmarks/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async bulkCreateBookmarks(
    workspaceSlug: string,
    projectId: string,
    payloads: TProjectBookmarkCreatePayload[]
  ): Promise<TProjectBookmarkBulkImportResult> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/bookmarks/bulk/`, { bookmarks: payloads })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateBookmark(
    workspaceSlug: string,
    projectId: string,
    bookmarkId: string,
    payload: TProjectBookmarkCreatePayload
  ): Promise<TProjectBookmark> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/bookmarks/${bookmarkId}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteBookmark(workspaceSlug: string, projectId: string, bookmarkId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/bookmarks/${bookmarkId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listBookmarkComments(
    workspaceSlug: string,
    projectId: string,
    bookmarkId: string
  ): Promise<TProjectBookmarkComment[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/bookmarks/${bookmarkId}/comments/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createBookmarkComment(
    workspaceSlug: string,
    projectId: string,
    bookmarkId: string,
    payload: { comment: string }
  ): Promise<TProjectBookmarkComment> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/bookmarks/${bookmarkId}/comments/`,
      payload
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateBookmarkComment(
    workspaceSlug: string,
    projectId: string,
    bookmarkId: string,
    commentId: string,
    payload: { comment: string }
  ): Promise<TProjectBookmarkComment> {
    return this.patch(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/bookmarks/${bookmarkId}/comments/${commentId}/`,
      payload
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteBookmarkComment(
    workspaceSlug: string,
    projectId: string,
    bookmarkId: string,
    commentId: string
  ): Promise<void> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/bookmarks/${bookmarkId}/comments/${commentId}/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
