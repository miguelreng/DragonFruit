/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { v4 as uuidv4 } from "uuid";
import type {
  TProjectBookmark,
  TProjectBookmarkBulkImportResult,
  TProjectBookmarkComment,
  TProjectBookmarkCreatePayload,
} from "@plane/types";
import { BookmarkService, type TBookmarkQueryParams, type TBookmarkUrlMetadata } from "@/services/bookmark.service";

export interface IBookmarkStore {
  bookmarkMap: Record<string, TProjectBookmark>;
  projectBookmarkIds: Record<string, string[]>;
  workspaceBookmarkIds: Record<string, string[]>;
  commentsByBookmark: Record<string, TProjectBookmarkComment[]>;
  service: BookmarkService;
  workspaceBookmarks: (workspaceSlug: string) => TProjectBookmark[];
  projectBookmarks: (projectId: string) => TProjectBookmark[];
  bookmarkComments: (bookmarkId: string) => TProjectBookmarkComment[];
  fetchProjectBookmarks: (
    workspaceSlug: string,
    projectId: string,
    params?: TBookmarkQueryParams
  ) => Promise<TProjectBookmark[]>;
  fetchWorkspaceBookmarks: (workspaceSlug: string, params?: TBookmarkQueryParams) => Promise<TProjectBookmark[]>;
  fetchUrlMetadata: (workspaceSlug: string, url: string) => Promise<TBookmarkUrlMetadata>;
  fetchBookmark: (workspaceSlug: string, projectId: string, bookmarkId: string) => Promise<TProjectBookmark>;
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
  moveBookmark: (
    workspaceSlug: string,
    projectId: string,
    bookmarkId: string,
    targetProjectId: string
  ) => Promise<TProjectBookmark>;
  fetchBookmarkComments: (
    workspaceSlug: string,
    projectId: string,
    bookmarkId: string
  ) => Promise<TProjectBookmarkComment[]>;
  createBookmarkComment: (
    workspaceSlug: string,
    projectId: string,
    bookmarkId: string,
    comment: string
  ) => Promise<TProjectBookmarkComment>;
  updateBookmarkComment: (
    workspaceSlug: string,
    projectId: string,
    bookmarkId: string,
    commentId: string,
    comment: string
  ) => Promise<TProjectBookmarkComment>;
  deleteBookmarkComment: (
    workspaceSlug: string,
    projectId: string,
    bookmarkId: string,
    commentId: string
  ) => Promise<void>;
}

export class BookmarkStore implements IBookmarkStore {
  bookmarkMap: Record<string, TProjectBookmark> = {};
  projectBookmarkIds: Record<string, string[]> = {};
  workspaceBookmarkIds: Record<string, string[]> = {};
  commentsByBookmark: Record<string, TProjectBookmarkComment[]> = {};
  service = new BookmarkService();

  constructor() {
    makeObservable(this, {
      bookmarkMap: observable,
      projectBookmarkIds: observable,
      workspaceBookmarkIds: observable,
      commentsByBookmark: observable,
      allBookmarks: computed,
      fetchProjectBookmarks: action,
      fetchWorkspaceBookmarks: action,
      fetchBookmark: action,
      createBookmark: action,
      importBookmarks: action,
      updateBookmark: action,
      deleteBookmark: action,
      moveBookmark: action,
      fetchBookmarkComments: action,
      createBookmarkComment: action,
      updateBookmarkComment: action,
      deleteBookmarkComment: action,
    });
  }

  get allBookmarks() {
    return Object.values(this.bookmarkMap);
  }

  workspaceBookmarks = (workspaceSlug: string) =>
    (this.workspaceBookmarkIds[workspaceSlug] ?? []).map((id) => this.bookmarkMap[id]).filter(Boolean);

  projectBookmarks = (projectId: string) =>
    (this.projectBookmarkIds[projectId] ?? []).map((id) => this.bookmarkMap[id]).filter(Boolean);

  bookmarkComments = (bookmarkId: string) => this.commentsByBookmark[bookmarkId] ?? [];

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

  fetchUrlMetadata = (workspaceSlug: string, url: string) => this.service.fetchUrlMetadata(workspaceSlug, url);

  fetchBookmark = async (workspaceSlug: string, projectId: string, bookmarkId: string) => {
    const bookmark = await this.service.retrieveBookmark(workspaceSlug, projectId, bookmarkId);
    runInAction(() => {
      this.bookmarkMap[bookmark.id] = bookmark;
    });
    return bookmark;
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

  moveBookmark = async (
    workspaceSlug: string,
    projectId: string,
    bookmarkId: string,
    targetProjectId: string
  ) => {
    const previous = this.bookmarkMap[bookmarkId];
    // Optimistically regroup the bookmark under the destination project. The
    // workspace grouping is unchanged since the bookmark stays in the workspace.
    runInAction(() => {
      if (previous) this.bookmarkMap[bookmarkId] = { ...previous, project_id: targetProjectId };
      this.projectBookmarkIds[projectId] = (this.projectBookmarkIds[projectId] ?? []).filter((id) => id !== bookmarkId);
      this.projectBookmarkIds[targetProjectId] = [
        bookmarkId,
        ...(this.projectBookmarkIds[targetProjectId] ?? []).filter((id) => id !== bookmarkId),
      ];
    });
    try {
      const bookmark = await this.service.moveBookmark(workspaceSlug, projectId, bookmarkId, targetProjectId);
      runInAction(() => {
        this.bookmarkMap[bookmark.id] = bookmark;
      });
      return bookmark;
    } catch (error) {
      runInAction(() => {
        if (previous) {
          this.bookmarkMap[bookmarkId] = previous;
          this.projectBookmarkIds[targetProjectId] = (this.projectBookmarkIds[targetProjectId] ?? []).filter(
            (id) => id !== bookmarkId
          );
          this.projectBookmarkIds[projectId] = [
            bookmarkId,
            ...(this.projectBookmarkIds[projectId] ?? []).filter((id) => id !== bookmarkId),
          ];
        }
      });
      throw error;
    }
  };

  fetchBookmarkComments = async (workspaceSlug: string, projectId: string, bookmarkId: string) => {
    const comments = await this.service.listBookmarkComments(workspaceSlug, projectId, bookmarkId);
    runInAction(() => {
      this.commentsByBookmark[bookmarkId] = comments;
    });
    return comments;
  };

  createBookmarkComment = async (workspaceSlug: string, projectId: string, bookmarkId: string, comment: string) => {
    const created = await this.service.createBookmarkComment(workspaceSlug, projectId, bookmarkId, { comment });
    runInAction(() => {
      this.commentsByBookmark[bookmarkId] = [...(this.commentsByBookmark[bookmarkId] ?? []), created];
    });
    return created;
  };

  updateBookmarkComment = async (
    workspaceSlug: string,
    projectId: string,
    bookmarkId: string,
    commentId: string,
    comment: string
  ) => {
    const updated = await this.service.updateBookmarkComment(workspaceSlug, projectId, bookmarkId, commentId, {
      comment,
    });
    runInAction(() => {
      this.commentsByBookmark[bookmarkId] = (this.commentsByBookmark[bookmarkId] ?? []).map((existing) =>
        existing.id === commentId ? updated : existing
      );
    });
    return updated;
  };

  deleteBookmarkComment = async (workspaceSlug: string, projectId: string, bookmarkId: string, commentId: string) => {
    const previous = this.commentsByBookmark[bookmarkId] ?? [];
    runInAction(() => {
      this.commentsByBookmark[bookmarkId] = previous.filter((existing) => existing.id !== commentId);
    });
    try {
      await this.service.deleteBookmarkComment(workspaceSlug, projectId, bookmarkId, commentId);
    } catch (error) {
      runInAction(() => {
        this.commentsByBookmark[bookmarkId] = previous;
      });
      throw error;
    }
  };
}
