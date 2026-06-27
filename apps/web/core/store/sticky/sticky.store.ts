/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { orderBy, set } from "lodash-es";
import { observable, action, makeObservable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
import { STICKIES_PER_PAGE } from "@plane/constants";
import type { InstructionType, TLoader, TPaginationInfo, TSticky } from "@plane/types";
import { StickyService } from "@/services/sticky.service";

export interface IStickyStore {
  creatingSticky: boolean;
  loader: TLoader;
  workspaceStickies: Record<string, string[]>; // workspaceId -> stickyIds
  stickies: Record<string, TSticky>; // stickyId -> sticky
  searchQuery: string;
  activeStickyId: string | undefined;
  recentStickyId: string | undefined;
  showAddNewSticky: boolean;
  paginationInfo: TPaginationInfo | undefined;
  // computed
  getWorkspaceStickyIds: (workspaceSlug: string) => string[];
  // actions
  toggleShowNewSticky: (value: boolean) => void;
  updateSearchQuery: (query: string) => void;
  fetchWorkspaceStickies: (workspaceSlug: string, projectId?: string) => void;
  createSticky: (workspaceSlug: string, sticky: Partial<TSticky>, projectId?: string) => Promise<void>;
  updateSticky: (workspaceSlug: string, id: string, updates: Partial<TSticky>) => Promise<void>;
  deleteSticky: (workspaceSlug: string, id: string, projectId?: string) => Promise<void>;
  updateActiveStickyId: (id: string | undefined) => void;
  fetchRecentSticky: (workspaceSlug: string) => Promise<void>;
  fetchNextWorkspaceStickies: (workspaceSlug: string, projectId?: string) => Promise<void>;
  updateStickyPosition: (
    workspaceSlug: string,
    stickyId: string,
    destinationId: string,
    edge: InstructionType,
    projectId?: string
  ) => Promise<void>;
}

export class StickyStore implements IStickyStore {
  loader: TLoader = "init-loader";
  creatingSticky = false;
  workspaceStickies: Record<string, string[]> = {};
  stickies: Record<string, TSticky> = {};
  recentStickyId: string | undefined = undefined;
  searchQuery = "";
  activeStickyId: string | undefined = undefined;
  showAddNewSticky = false;
  paginationInfo: TPaginationInfo | undefined = undefined;

  // services
  stickyService;

  constructor() {
    makeObservable(this, {
      // observables
      creatingSticky: observable,
      loader: observable,
      activeStickyId: observable,
      showAddNewSticky: observable,
      recentStickyId: observable,
      workspaceStickies: observable,
      stickies: observable,
      searchQuery: observable,
      // actions
      updateSearchQuery: action,
      updateSticky: action,
      deleteSticky: action,
      fetchNextWorkspaceStickies: action,
      fetchWorkspaceStickies: action,
      createSticky: action,
      updateActiveStickyId: action,
      toggleShowNewSticky: action,
      fetchRecentSticky: action,
      updateStickyPosition: action,
    });
    this.stickyService = new StickyService();
  }

  getWorkspaceStickyIds = computedFn((workspaceSlug: string) =>
    orderBy(
      (this.workspaceStickies[workspaceSlug] || []).map((stickyId) => this.stickies[stickyId]),
      ["sort_order"],
      ["desc"]
    ).map((sticky) => sticky.id)
  );

  toggleShowNewSticky = (value: boolean) => {
    this.showAddNewSticky = value;
  };

  updateSearchQuery = (query: string) => {
    this.searchQuery = query;
  };

  updateActiveStickyId = (id: string | undefined) => {
    this.activeStickyId = id;
  };

  fetchRecentSticky = async (workspaceSlug: string) => {
    const response = await this.stickyService.getStickies(workspaceSlug, "1:0:0", undefined, 1);
    runInAction(() => {
      this.recentStickyId = response.results[0]?.id;
      this.stickies[response.results[0]?.id] = response.results[0];
    });
  };
  fetchNextWorkspaceStickies = async (workspaceSlug: string, projectId?: string) => {
    const scope = projectId || workspaceSlug;
    try {
      if (!this.paginationInfo?.next_cursor || !this.paginationInfo.next_page_results || this.loader === "pagination") {
        return;
      }
      this.loader = "pagination";
      const response = await this.stickyService.getStickies(
        workspaceSlug,
        this.paginationInfo.next_cursor,
        this.searchQuery,
        undefined,
        projectId
      );

      runInAction(() => {
        const { results, ...paginationInfo } = response;

        // Add new stickies to store
        results.forEach((sticky) => {
          if (!this.workspaceStickies[scope]?.includes(sticky.id)) {
            this.workspaceStickies[scope] = [...(this.workspaceStickies[scope] || []), sticky.id];
          }
          this.stickies[sticky.id] = sticky;
        });

        // Update pagination info directly from backend
        set(this, "paginationInfo", paginationInfo);
        set(this, "loader", "loaded");
      });
    } catch (e) {
      console.error(e);
      runInAction(() => {
        this.loader = "loaded";
      });
    }
  };

  fetchWorkspaceStickies = async (workspaceSlug: string, projectId?: string) => {
    const scope = projectId || workspaceSlug;
    try {
      if (this.workspaceStickies[scope]) {
        this.loader = "mutation";
      } else {
        this.loader = "init-loader";
      }

      const response = await this.stickyService.getStickies(
        workspaceSlug,
        `${STICKIES_PER_PAGE}:0:0`,
        this.searchQuery,
        undefined,
        projectId
      );

      runInAction(() => {
        const { results, ...paginationInfo } = response;

        results.forEach((sticky) => {
          this.stickies[sticky.id] = sticky;
        });
        this.workspaceStickies[scope] = results.map((sticky) => sticky.id);
        set(this, "paginationInfo", paginationInfo);
        this.loader = "loaded";
      });
    } catch (e) {
      console.error(e);
      runInAction(() => {
        this.loader = "loaded";
      });
    }
  };

  createSticky = async (workspaceSlug: string, sticky: Partial<TSticky>, projectId?: string) => {
    if (!this.showAddNewSticky) return;
    this.showAddNewSticky = false;
    this.creatingSticky = true;
    const scope = projectId || workspaceSlug;
    const scopeStickies = this.workspaceStickies[scope] || [];
    const response = await this.stickyService.createSticky(workspaceSlug, sticky, projectId);
    runInAction(() => {
      this.stickies[response.id] = response;
      this.workspaceStickies[scope] = [response.id, ...scopeStickies];
      this.activeStickyId = response.id;
      this.recentStickyId = response.id;
      this.creatingSticky = false;
    });
  };

  updateSticky = async (workspaceSlug: string, id: string, updates: Partial<TSticky>) => {
    const sticky = this.stickies[id];
    if (!sticky) return;
    try {
      runInAction(() => {
        Object.keys(updates).forEach((key) => {
          const currentStickyKey = key as keyof TSticky;
          const value = updates[currentStickyKey];
          set(this.stickies[id], key, value === undefined ? undefined : value);
        });
      });
      this.recentStickyId = id;
      await this.stickyService.updateSticky(workspaceSlug, id, updates);
    } catch (error) {
      console.error("Error in updating sticky:", error);
      this.stickies[id] = sticky;
      throw new Error();
    }
  };

  deleteSticky = async (workspaceSlug: string, id: string, projectId?: string) => {
    const scope = projectId || workspaceSlug;
    const sticky = this.stickies[id];
    if (!sticky) return;
    try {
      this.workspaceStickies[scope] = this.workspaceStickies[scope].filter((stickyId) => stickyId !== id);
      if (this.activeStickyId === id) this.activeStickyId = undefined;
      delete this.stickies[id];
      this.recentStickyId = this.workspaceStickies[scope][0];
      await this.stickyService.deleteSticky(workspaceSlug, id);
    } catch (e) {
      console.log(e);
      this.stickies[id] = sticky;
    }
  };

  updateStickyPosition = async (
    workspaceSlug: string,
    stickyId: string,
    destinationId: string,
    edge: InstructionType,
    projectId?: string
  ) => {
    const scope = projectId || workspaceSlug;
    const previousSortOrder = this.stickies[stickyId].sort_order;
    try {
      let resultSequence = 10000;
      const workspaceStickies = this.workspaceStickies[scope] || [];
      const stickies = workspaceStickies.map((id) => this.stickies[id]);
      const sortedStickies = orderBy(stickies, "sort_order", "desc").map((sticky) => sticky.id);
      const destinationSequence = this.stickies[destinationId]?.sort_order || undefined;

      if (destinationSequence) {
        const destinationIndex = sortedStickies.findIndex((id) => id === destinationId);

        if (edge === "reorder-above") {
          const prevSequence = this.stickies[sortedStickies[destinationIndex - 1]]?.sort_order || undefined;
          if (prevSequence) {
            resultSequence = (destinationSequence + prevSequence) / 2;
          } else {
            resultSequence = destinationSequence + resultSequence;
          }
        } else {
          // reorder-below
          resultSequence = destinationSequence - resultSequence;
        }
      }

      runInAction(() => {
        this.stickies[stickyId] = {
          ...this.stickies[stickyId],
          sort_order: resultSequence,
        };
      });

      await this.stickyService.updateSticky(workspaceSlug, stickyId, {
        sort_order: resultSequence,
      });
    } catch (error) {
      console.error("Failed to move sticky");
      runInAction(() => {
        this.stickies[stickyId].sort_order = previousSortOrder;
      });
      throw error;
    }
  };
}
