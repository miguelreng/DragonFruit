/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, makeObservable, runInAction } from "mobx";
// base class
import type {
  IssuePaginationOptions,
  TBulkOperationsPayload,
  TIssue,
  TIssuesResponse,
  TLoader,
  ViewFlags,
} from "@plane/types";
// types
import type { IBaseIssuesStore } from "../helpers/base-issues.store";
import { BaseIssuesStore } from "../helpers/base-issues.store";
import type { IIssueRootStore } from "../root.store";
import type { IWorkspaceIssuesFilter } from "./filter.store";

export interface IWorkspaceIssues extends IBaseIssuesStore {
  // observable
  viewFlags: ViewFlags;
  // actions
  fetchIssues: (
    workspaceSlug: string,
    viewId: string,
    loadType: TLoader,
    options: IssuePaginationOptions
  ) => Promise<TIssuesResponse | undefined>;
  fetchIssuesWithExistingPagination: (
    workspaceSlug: string,
    viewId: string,
    loadType: TLoader
  ) => Promise<TIssuesResponse | undefined>;
  fetchNextIssues: (
    workspaceSlug: string,
    viewId: string,
    groupId?: string,
    subGroupId?: string
  ) => Promise<TIssuesResponse | undefined>;

  createIssue: (workspaceSlug: string, projectId: string, data: Partial<TIssue>) => Promise<TIssue>;
  updateIssue: (workspaceSlug: string, projectId: string, issueId: string, data: Partial<TIssue>) => Promise<void>;
  archiveIssue: (workspaceSlug: string, projectId: string, issueId: string) => Promise<void>;
  removeBulkIssues: (workspaceSlug: string, projectId: string, issueIds: string[]) => Promise<void>;
  archiveBulkIssues: (workspaceSlug: string, projectId: string, issueIds: string[]) => Promise<void>;
  bulkUpdateProperties: (workspaceSlug: string, projectId: string, data: TBulkOperationsPayload) => Promise<void>;

  quickAddIssue: undefined;
  clear(): void;
}

// The workspace-views feature was removed. This store is still instantiated
// on `IssueRootStore.workspaceIssues` and reached via
// `useIssues(EIssuesStoreType.WORKSPACE)` from the create-issue modal and
// workspace drafts, which only need the inherited mutation helpers
// (createIssue/updateIssue/etc. via BaseIssuesStore). Fetch methods are
// no-ops because there is no workspace-level view to fetch any more — a
// follow-up should retire EIssuesStoreType.WORKSPACE entirely and move the
// remaining consumers onto a smaller surface.
export class WorkspaceIssues extends BaseIssuesStore implements IWorkspaceIssues {
  viewFlags = {
    enableQuickAdd: true,
    enableIssueCreation: true,
    enableInlineEditing: true,
  };
  // filterStore
  issueFilterStore;

  constructor(_rootStore: IIssueRootStore, issueFilterStore: IWorkspaceIssuesFilter) {
    super(_rootStore, issueFilterStore);

    makeObservable(this, {
      // action
      fetchIssues: action,
      fetchNextIssues: action,
      fetchIssuesWithExistingPagination: action,
    });
    // filter store
    this.issueFilterStore = issueFilterStore;
  }

  fetchParentStats = () => {};
  updateParentStats = () => {};

  fetchIssues = async (
    _workspaceSlug: string,
    _viewId: string,
    _loadType: TLoader,
    _options: IssuePaginationOptions,
    _isExistingPaginationOptions: boolean = false
  ): Promise<TIssuesResponse | undefined> => undefined;

  fetchNextIssues = async (
    _workspaceSlug: string,
    _viewId: string,
    _groupId?: string,
    _subGroupId?: string
  ): Promise<TIssuesResponse | undefined> => undefined;

  fetchIssuesWithExistingPagination = async (
    _workspaceSlug: string,
    _viewId: string,
    _loadType: TLoader
  ): Promise<TIssuesResponse | undefined> => undefined;

  // Using aliased names as they cannot be overridden in other stores
  archiveBulkIssues = this.bulkArchiveIssues;
  updateIssue = this.issueUpdate;
  archiveIssue = this.issueArchive;

  // Setting them as undefined as they can not performed on workspace issues
  quickAddIssue = undefined;
}
