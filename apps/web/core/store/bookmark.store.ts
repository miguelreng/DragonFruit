/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { v4 as uuidv4 } from "uuid";
import type { TProjectBookmark, TProjectBookmarkBulkImportResult, TProjectBookmarkCreatePayload } from "@plane/types";
import { BookmarkService, type TBookmarkQueryParams } from "@/services/bookmark.service";

export interface IBookmarkStore {
  bookmarkMap: Record<string, TProjectBookmark>;
  projectBookmarkIds: Record<string, string[]>;
  workspaceBookmarkIds: Record<string, string[]>;
  service: BookmarkService;
  workspaceBookmarks: (workspaceSlug: string) => TProjectBookmark[];
  projectBookmarks: (projectId: string) => TProjectBookmark[];
  fetchProjectBookmarks: (
    workspaceSlug: string,
    projectId: string,
    params?: TBookmarkQueryParams
  ) => Promise<TProjectBookmark[]>;
  fetchWorkspaceBookmarks: (workspaceSlug: string, params?: TBookmarkQueryParams) => Promise<TProjectBookmark[]>;
  createBookmark: (
    workspaceSlug: string,
    projectId: string,
    payload: TProjectBookmarkCreatePayload
  ) => Promise<TProjectBookmark>;
  importBookmarks: (
    workspaceSlug: string,
    projectId: string,
    payloads: TProjectBookmarkCreatePayload[]
  ) => Promise<TProjectBookmarkBulkImportResult>;
  updateBookmark: (
    workspaceSlug: string,
    projectId: string,
    bookmarkId: string,
    payload: TProjectBookmarkCreatePayload
  ) => Promise<TProjectBookmark>;
  deleteBookmark: (workspaceSlug: string, projectId: string, bookmarkId: string) => Promise<void>;
}

export class BookmarkStore implements IBookmarkStore {
  bookmarkMap: Record<string, TProjectBookmark> = {};
  projectBookmarkIds: Record<string, string[]> = {};
  workspaceBookmarkIds: Record<string, string[]> = {};
  service = new BookmarkService();

  constructor() {
    makeObservable(this, {
      bookmarkMap: observable,
      projectBookmarkIds: observable,
      workspaceBookmarkIds: observable,
      allBookmarks: computed,
      fetchProjectBookmarks: action,
      fetchWorkspaceBookmarks: action,
      createBookmark: action,
      importBookmarks: action,
      updateBookmark: action,
      deleteBookmark: action,
    });
  }

  get allBookmarks() {
    return Object.values(this.bookmarkMap);
  }

  workspaceBookmarks = (workspaceSlug: string) =>
    (this.workspaceBookmarkIds[workspaceSlug] ?? []).map((id) => this.bookmarkMap[id]).filter(Boolean);

  projectBookmarks = (projectId: string) =>
    (this.projectBookmarkIds[projectId] ?? []).map((id) => this.bookmarkMap[id]).filter(Boolean);

  private mergeBookmarks(bookmarks: TProjectBookmark[]) {
    bookmarks.forEach((bookmark) => {
      this.bookmarkMap[bookmark.id] = bookmark;
    });
  }

  fetchProjectBookmarks = async (workspaceSlug: string, projectId: string, params?: TBookmarkQueryParams) => {
    const response = await this.service.listProjectBookmarks(workspaceSlug, projectId, params);
    const bookmarks = response.results ?? [];
    runInAction(() => {
      this.mergeBookmarks(bookmarks);
      this.projectBookmarkIds[projectId] = bookmarks.map((bookmark) => bookmark.id);
    });
    return bookmarks;
  };

  fetchWorkspaceBookmarks = async (workspaceSlug: string, params?: TBookmarkQueryParams) => {
    const response = await this.service.listWorkspaceBookmarks(workspaceSlug, params);
    const bookmarks = response.results ?? [];
    runInAction(() => {
      this.mergeBookmarks(bookmarks);
      this.workspaceBookmarkIds[workspaceSlug] = bookmarks.map((bookmark) => bookmark.id);
    });
    return bookmarks;
  };

  createBookmark = async (workspaceSlug: string, projectId: string, payload: TProjectBookmarkCreatePayload) => {
    const tempId = uuidv4();
    const optimistic: TProjectBookmark = {
      id: tempId,
      workspace_id: "",
      workspace_slug: workspaceSlug,
      project_id: projectId,
      title: payload.title ?? "Untitled bookmark",
      description: payload.description ?? "",
      url: payload.url ?? "",
      entity_type: payload.entity_type ?? "",
      entity_identifier: payload.entity_identifier ?? null,
      metadata: payload.metadata ?? {},
      tags: payload.tags ?? [],
      sort_order: Date.now(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    runInAction(() => {
      this.bookmarkMap[tempId] = optimistic;
      this.projectBookmarkIds[projectId] = [tempId, ...(this.projectBookmarkIds[projectId] ?? [])];
      this.workspaceBookmarkIds[workspaceSlug] = [tempId, ...(this.workspaceBookmarkIds[workspaceSlug] ?? [])];
    });
    try {
      const bookmark = await this.service.createBookmark(workspaceSlug, projectId, payload);
      runInAction(() => {
        delete this.bookmarkMap[tempId];
        this.bookmarkMap[bookmark.id] = bookmark;
        this.projectBookmarkIds[projectId] = [
          bookmark.id,
          ...(this.projectBookmarkIds[projectId] ?? []).filter((id) => id !== tempId),
        ];
        this.workspaceBookmarkIds[workspaceSlug] = [
          bookmark.id,
          ...(this.workspaceBookmarkIds[workspaceSlug] ?? []).filter((id) => id !== tempId),
        ];
      });
      return bookmark;
    } catch (error) {
      runInAction(() => {
        delete this.bookmarkMap[tempId];
        this.projectBookmarkIds[projectId] = (this.projectBookmarkIds[projectId] ?? []).filter((id) => id !== tempId);
        this.workspaceBookmarkIds[workspaceSlug] = (this.workspaceBookmarkIds[workspaceSlug] ?? []).filter(
          (id) => id !== tempId
        );
      });
      throw error;
    }
  };

  importBookmarks = async (workspaceSlug: string, projectId: string, payloads: TProjectBookmarkCreatePayload[]) => {
    const result = await this.service.bulkCreateBookmarks(workspaceSlug, projectId, payloads);
    const created = result.bookmarks ?? [];
    runInAction(() => {
      this.mergeBookmarks(created);
      const createdIds = created.map((bookmark) => bookmark.id);
      const dedupe = (existing: string[] | undefined) => [
        ...createdIds,
        ...(existing ?? []).filter((id) => !createdIds.includes(id)),
      ];
      this.projectBookmarkIds[projectId] = dedupe(this.projectBookmarkIds[projectId]);
      this.workspaceBookmarkIds[workspaceSlug] = dedupe(this.workspaceBookmarkIds[workspaceSlug]);
    });
    return result;
  };

  updateBookmark = async (
    workspaceSlug: string,
    projectId: string,
    bookmarkId: string,
    payload: TProjectBookmarkCreatePayload
  ) => {
    const previous = this.bookmarkMap[bookmarkId];
    runInAction(() => {
      if (previous) this.bookmarkMap[bookmarkId] = { ...previous, ...payload };
    });
    try {
      const bookmark = await this.service.updateBookmark(workspaceSlug, projectId, bookmarkId, payload);
      runInAction(() => {
        this.bookmarkMap[bookmark.id] = bookmark;
      });
      return bookmark;
    } catch (error) {
      runInAction(() => {
        if (previous) this.bookmarkMap[bookmarkId] = previous;
      });
      throw error;
    }
  };

  deleteBookmark = async (workspaceSlug: string, projectId: string, bookmarkId: string) => {
    const previous = this.bookmarkMap[bookmarkId];
    runInAction(() => {
      delete this.bookmarkMap[bookmarkId];
      this.projectBookmarkIds[projectId] = (this.projectBookmarkIds[projectId] ?? []).filter((id) => id !== bookmarkId);
      this.workspaceBookmarkIds[workspaceSlug] = (this.workspaceBookmarkIds[workspaceSlug] ?? []).filter(
        (id) => id !== bookmarkId
      );
    });
    try {
      await this.service.deleteBookmark(workspaceSlug, projectId, bookmarkId);
    } catch (error) {
      runInAction(() => {
        if (previous) {
          this.bookmarkMap[bookmarkId] = previous;
          this.projectBookmarkIds[projectId] = [bookmarkId, ...(this.projectBookmarkIds[projectId] ?? [])];
          this.workspaceBookmarkIds[workspaceSlug] = [bookmarkId, ...(this.workspaceBookmarkIds[workspaceSlug] ?? [])];
        }
      });
      throw error;
    }
  };
}
