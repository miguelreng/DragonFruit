/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, observable, makeObservable } from "mobx";

const ATLAS_SIDEBAR_OPEN_KEY = "atlas_sidebar_open";
const ATLAS_SIDEBAR_COLLAPSED_KEY = "atlas_sidebar_collapsed";
const ATLAS_SIDEBAR_EXPANDED_KEY = "atlas_sidebar_expanded";

/**
 * Atlas docks open by default. A fresh localStorage key (not the legacy
 * "agent_chat_open") makes the docked-by-default rollout take effect for
 * everyone, while still persisting whatever the user chooses afterwards.
 */
function readAtlasSidebarOpen(): boolean {
  if (typeof window === "undefined") return false;
  // Desktop: Atlas is a permanent docked sidebar — always open, never closeable.
  if (window.innerWidth >= 768) return true;
  // Mobile: it's a dismissible overlay; respect the last choice, closed by default.
  return window.localStorage.getItem(ATLAS_SIDEBAR_OPEN_KEY) === "true";
}

/**
 * Desktop-only: whether the docked Atlas sidebar is collapsed to a slim rail
 * (vs. the full chat panel). Mirrors the left app rail's icon-only collapse.
 * Defaults to expanded; persists the user's choice across reloads.
 */
function readAtlasSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ATLAS_SIDEBAR_COLLAPSED_KEY) === "true";
}

/**
 * Desktop-only: whether the docked Atlas sidebar is expanded to full width
 * (Claude-style focus chat — the page content closes). Independent of the
 * collapsed rail — collapsing while expanded and reopening returns to full.
 */
function readAtlasSidebarExpanded(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ATLAS_SIDEBAR_EXPANDED_KEY) === "true";
}

export interface IThemeStore {
  // observables
  isAnySidebarDropdownOpen: boolean | undefined;
  sidebarCollapsed: boolean | undefined;
  sidebarPeek: boolean | undefined;
  profileSidebarCollapsed: boolean | undefined;
  workspaceAnalyticsSidebarCollapsed: boolean | undefined;
  issueDetailSidebarCollapsed: boolean | undefined;
  epicDetailSidebarCollapsed: boolean | undefined;
  initiativesSidebarCollapsed: boolean | undefined;
  projectOverviewSidebarCollapsed: boolean | undefined;
  /** "Talk to AI" right-side panel — sibling of the main content area. */
  agentChatOpen: boolean;
  /** Desktop-only: Atlas sidebar collapsed to a slim rail (vs. full panel). */
  atlasSidebarCollapsed: boolean;
  /** Desktop-only: Atlas sidebar expanded to full width (content closed). */
  atlasSidebarExpanded: boolean;
  // actions
  toggleAnySidebarDropdown: (open?: boolean) => void;
  toggleSidebar: (collapsed?: boolean) => void;
  toggleSidebarPeek: (peek?: boolean) => void;
  toggleProfileSidebar: (collapsed?: boolean) => void;
  toggleWorkspaceAnalyticsSidebar: (collapsed?: boolean) => void;
  toggleIssueDetailSidebar: (collapsed?: boolean) => void;
  toggleEpicDetailSidebar: (collapsed?: boolean) => void;
  toggleInitiativesSidebar: (collapsed?: boolean) => void;
  toggleProjectOverviewSidebar: (collapsed?: boolean) => void;
  toggleAgentChat: (open?: boolean) => void;
  toggleAtlasSidebar: (collapsed?: boolean) => void;
  toggleAtlasSidebarExpanded: (expanded?: boolean) => void;
}

export class ThemeStore implements IThemeStore {
  // observables
  isAnySidebarDropdownOpen: boolean | undefined = undefined;
  sidebarCollapsed: boolean | undefined = undefined;
  sidebarPeek: boolean | undefined = undefined;
  profileSidebarCollapsed: boolean | undefined = undefined;
  workspaceAnalyticsSidebarCollapsed: boolean | undefined = undefined;
  issueDetailSidebarCollapsed: boolean | undefined = undefined;
  epicDetailSidebarCollapsed: boolean | undefined = undefined;
  initiativesSidebarCollapsed: boolean | undefined = undefined;
  projectOverviewSidebarCollapsed: boolean | undefined = undefined;
  agentChatOpen: boolean = readAtlasSidebarOpen();
  atlasSidebarCollapsed: boolean = readAtlasSidebarCollapsed();
  atlasSidebarExpanded: boolean = readAtlasSidebarExpanded();

  constructor() {
    makeObservable(this, {
      // observable
      isAnySidebarDropdownOpen: observable.ref,
      sidebarCollapsed: observable.ref,
      sidebarPeek: observable.ref,
      profileSidebarCollapsed: observable.ref,
      workspaceAnalyticsSidebarCollapsed: observable.ref,
      issueDetailSidebarCollapsed: observable.ref,
      epicDetailSidebarCollapsed: observable.ref,
      initiativesSidebarCollapsed: observable.ref,
      projectOverviewSidebarCollapsed: observable.ref,
      agentChatOpen: observable.ref,
      atlasSidebarCollapsed: observable.ref,
      atlasSidebarExpanded: observable.ref,
      // action
      toggleAnySidebarDropdown: action,
      toggleSidebar: action,
      toggleSidebarPeek: action,
      toggleProfileSidebar: action,
      toggleWorkspaceAnalyticsSidebar: action,
      toggleIssueDetailSidebar: action,
      toggleEpicDetailSidebar: action,
      toggleInitiativesSidebar: action,
      toggleProjectOverviewSidebar: action,
      toggleAgentChat: action,
      toggleAtlasSidebar: action,
      toggleAtlasSidebarExpanded: action,
    });
  }

  toggleAnySidebarDropdown = (open?: boolean) => {
    if (open === undefined) {
      this.isAnySidebarDropdownOpen = !this.isAnySidebarDropdownOpen;
    } else {
      this.isAnySidebarDropdownOpen = open;
    }
  };

  /**
   * Toggle the sidebar collapsed state
   * @param collapsed
   */
  toggleSidebar = (collapsed?: boolean) => {
    if (collapsed === undefined) {
      this.sidebarCollapsed = !this.sidebarCollapsed;
    } else {
      this.sidebarCollapsed = collapsed;
    }
    localStorage.setItem("app_sidebar_collapsed", this.sidebarCollapsed.toString());
  };

  /**
   * Toggle the sidebar peek state
   * @param peek
   */
  toggleSidebarPeek = (peek?: boolean) => {
    if (peek === undefined) {
      this.sidebarPeek = !this.sidebarPeek;
    } else {
      this.sidebarPeek = peek;
    }
  };

  /**
   * Toggle the profile sidebar collapsed state
   * @param collapsed
   */
  toggleProfileSidebar = (collapsed?: boolean) => {
    if (collapsed === undefined) {
      this.profileSidebarCollapsed = !this.profileSidebarCollapsed;
    } else {
      this.profileSidebarCollapsed = collapsed;
    }
    localStorage.setItem("profile_sidebar_collapsed", this.profileSidebarCollapsed.toString());
  };

  /**
   * Toggle the profile sidebar collapsed state
   * @param collapsed
   */
  toggleWorkspaceAnalyticsSidebar = (collapsed?: boolean) => {
    if (collapsed === undefined) {
      this.workspaceAnalyticsSidebarCollapsed = !this.workspaceAnalyticsSidebarCollapsed;
    } else {
      this.workspaceAnalyticsSidebarCollapsed = collapsed;
    }
    localStorage.setItem("workspace_analytics_sidebar_collapsed", this.workspaceAnalyticsSidebarCollapsed.toString());
  };

  toggleIssueDetailSidebar = (collapsed?: boolean) => {
    if (collapsed === undefined) {
      this.issueDetailSidebarCollapsed = !this.issueDetailSidebarCollapsed;
    } else {
      this.issueDetailSidebarCollapsed = collapsed;
    }
    localStorage.setItem("issue_detail_sidebar_collapsed", this.issueDetailSidebarCollapsed.toString());
  };

  toggleEpicDetailSidebar = (collapsed?: boolean) => {
    if (collapsed === undefined) {
      this.epicDetailSidebarCollapsed = !this.epicDetailSidebarCollapsed;
    } else {
      this.epicDetailSidebarCollapsed = collapsed;
    }
    localStorage.setItem("epic_detail_sidebar_collapsed", this.epicDetailSidebarCollapsed.toString());
  };

  toggleInitiativesSidebar = (collapsed?: boolean) => {
    if (collapsed === undefined) {
      this.initiativesSidebarCollapsed = !this.initiativesSidebarCollapsed;
    } else {
      this.initiativesSidebarCollapsed = collapsed;
    }
    localStorage.setItem("initiatives_sidebar_collapsed", this.initiativesSidebarCollapsed.toString());
  };

  toggleProjectOverviewSidebar = (collapsed?: boolean) => {
    if (collapsed === undefined) {
      this.projectOverviewSidebarCollapsed = !this.projectOverviewSidebarCollapsed;
    } else {
      this.projectOverviewSidebarCollapsed = collapsed;
    }
    localStorage.setItem("project_overview_sidebar_collapsed", this.projectOverviewSidebarCollapsed.toString());
  };

  /**
   * Toggle the docked Atlas sidebar. Persists across reloads so a user who
   * collapsed (or reopened) it last session sees the same on return. Stored as
   * a plain "true"/"false" string in localStorage.
   */
  toggleAgentChat = (open?: boolean) => {
    if (open === undefined) {
      this.agentChatOpen = !this.agentChatOpen;
    } else {
      this.agentChatOpen = open;
    }
    localStorage.setItem(ATLAS_SIDEBAR_OPEN_KEY, this.agentChatOpen.toString());
  };

  /**
   * Collapse the docked Atlas sidebar to a slim rail (or expand it back).
   * Desktop-only — mirrors the left app rail's icon-only collapse, and like it
   * the width animation reveals/hides the panel. Persists across reloads.
   */
  toggleAtlasSidebar = (collapsed?: boolean) => {
    if (collapsed === undefined) {
      this.atlasSidebarCollapsed = !this.atlasSidebarCollapsed;
    } else {
      this.atlasSidebarCollapsed = collapsed;
    }
    localStorage.setItem(ATLAS_SIDEBAR_COLLAPSED_KEY, this.atlasSidebarCollapsed.toString());
  };

  /**
   * Expand the docked Atlas sidebar to full width (or shrink it back to the
   * default panel). The page content closes — same docked push as the rail
   * toggle, taken all the way. Persists across reloads.
   */
  toggleAtlasSidebarExpanded = (expanded?: boolean) => {
    if (expanded === undefined) {
      this.atlasSidebarExpanded = !this.atlasSidebarExpanded;
    } else {
      this.atlasSidebarExpanded = expanded;
    }
    localStorage.setItem(ATLAS_SIDEBAR_EXPANDED_KEY, this.atlasSidebarExpanded.toString());
  };
}
