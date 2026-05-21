/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { makeObservable, observable } from "mobx";
import { computedFn } from "mobx-utils";
// plane imports
import type { IUserLite } from "@plane/types";
// plane web imports
import type { IProjectMemberStore } from "@/plane-web/store/member/project-member.store";
import { ProjectMemberStore } from "@/plane-web/store/member/project-member.store";
import type { RootStore } from "@/plane-web/store/root.store";
// local imports
import type { IWorkspaceMemberStore } from "./workspace/workspace-member.store";
import { WorkspaceMemberStore } from "./workspace/workspace-member.store";

export interface IMemberRootStore {
  // observables
  memberMap: Record<string, IUserLite>;
  // computed actions
  getMemberIds: () => string[];
  getUserDetails: (userId: string) => IUserLite | undefined;
  // sub-stores
  workspace: IWorkspaceMemberStore;
  project: IProjectMemberStore;
}

export class MemberRootStore implements IMemberRootStore {
  // observables
  memberMap: Record<string, IUserLite> = {};
  // sub-stores
  workspace: IWorkspaceMemberStore;
  project: IProjectMemberStore;
  // root store reference (used to overlay agent data on bot users)
  private rootStore: RootStore;

  constructor(_rootStore: RootStore) {
    makeObservable(this, {
      // observables
      memberMap: observable,
    });
    this.rootStore = _rootStore;
    // sub-stores
    this.workspace = new WorkspaceMemberStore(this, _rootStore);
    this.project = new ProjectMemberStore(this, _rootStore);
  }

  /**
   * @description get all member ids
   */
  getMemberIds = computedFn(() => Object.keys(this.memberMap));

  /**
   * @description get user details from userId
   * @param userId
   */
  // Agents are stored both as bot users on the workspace (so they appear in
  // `memberMap` via `fetchWorkspaceMembers`) and as Agent records with their
  // own avatar/name. The Agent record is the source of truth for the agent's
  // identity — updating an agent's avatar writes to TAgent, not to the
  // underlying bot User. Overlay agent data here so every avatar render
  // site (dropdowns, assignee chips, activity feed, mentions) picks up the
  // current image without each call site having to know about agents.
  getUserDetails = computedFn((userId: string): IUserLite | undefined => {
    const base = this.memberMap?.[userId];
    const agentOverlay = this.rootStore.agent?.getAgentAsUserLite(userId);
    if (!agentOverlay) return base ?? undefined;
    // Only override fields the agent actually populated — falling back to
    // the underlying bot user's value when the agent's field is empty.
    return {
      ...(base ?? {}),
      ...agentOverlay,
      avatar_url: agentOverlay.avatar_url || base?.avatar_url || "",
      display_name: agentOverlay.display_name || base?.display_name || "",
    };
  });
}
