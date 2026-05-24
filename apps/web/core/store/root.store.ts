/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { enableStaticRendering } from "mobx-react";
// plane imports
import { FALLBACK_LANGUAGE, setLanguage } from "@plane/i18n";
import type { IWorkItemFilterStore } from "@plane/shared-state";
import { WorkItemFilterStore } from "@plane/shared-state";
// plane web store
import type { IAnalyticsStore } from "@/plane-web/store/analytics.store";
import { AnalyticsStore } from "@/plane-web/store/analytics.store";
import type { ICommandPaletteStore } from "@/plane-web/store/command-palette.store";
import { CommandPaletteStore } from "@/plane-web/store/command-palette.store";
import { PowerKStore } from "@/plane-web/store/power-k.store";
import type { IPowerKStore } from "@/plane-web/store/power-k.store";
import type { RootStore } from "@/plane-web/store/root.store";
import type { IStateStore } from "@/plane-web/store/state.store";
import { StateStore } from "@/plane-web/store/state.store";
import { WorkspaceRootStore } from "@/plane-web/store/workspace";
// stores
import type { ICycleStore } from "./cycle.store";
import { CycleStore } from "./cycle.store";
import type { ICycleFilterStore } from "./cycle_filter.store";
import { CycleFilterStore } from "./cycle_filter.store";
import type { IDashboardStore } from "./dashboard.store";
import { DashboardStore } from "./dashboard.store";
import type { IEditorAssetStore } from "./editor/asset.store";
import { EditorAssetStore } from "./editor/asset.store";
import type { IProjectEstimateStore } from "./estimates/project-estimate.store";
import { ProjectEstimateStore } from "./estimates/project-estimate.store";
import type { IFavoriteStore } from "./favorite.store";
import { FavoriteStore } from "./favorite.store";
import type { IBookmarkStore } from "./bookmark.store";
import { BookmarkStore } from "./bookmark.store";
import type { IProjectInboxStore } from "./inbox/project-inbox.store";
import { ProjectInboxStore } from "./inbox/project-inbox.store";
import type { IInstanceStore } from "./instance.store";
import { InstanceStore } from "./instance.store";
import type { IIssueRootStore } from "./issue/root.store";
import { IssueRootStore } from "./issue/root.store";
import type { ILabelStore } from "./label.store";
import { LabelStore } from "./label.store";
import type { IMemberRootStore } from "./member";
import { MemberRootStore } from "./member";
import type { IModuleStore } from "./module.store";
import { ModulesStore } from "./module.store";
import type { IModuleFilterStore } from "./module_filter.store";
import { ModuleFilterStore } from "./module_filter.store";
import type { IMultipleSelectStore } from "./multiple_select.store";
import { MultipleSelectStore } from "./multiple_select.store";
import type { IWorkspaceNotificationStore } from "./notifications/workspace-notifications.store";
import { WorkspaceNotificationStore } from "./notifications/workspace-notifications.store";
import type { IProjectPageStore } from "./pages/project-page.store";
import { ProjectPageStore } from "./pages/project-page.store";
import type { IProjectRootStore } from "./project";
import { ProjectRootStore } from "./project";
import type { IProjectViewStore } from "./project-view.store";
import { ProjectViewStore } from "./project-view.store";
import type { IRouterStore } from "./router.store";
import { RouterStore } from "./router.store";
import type { IStickyStore } from "./sticky/sticky.store";
import { StickyStore } from "./sticky/sticky.store";
import type { IThemeStore } from "./theme.store";
import { ThemeStore } from "./theme.store";
import type { IUserStore } from "./user";
import { UserStore } from "./user";
import type { IWorkspaceRootStore } from "./workspace";
import type { IAgentStore } from "./agent.store";
import { AgentStore } from "./agent.store";

enableStaticRendering(typeof window === "undefined");

// Stores split into two tiers:
//   - eagerly constructed: needed app-wide on first render (router, user,
//     theme, instance, workspace/project/member roots, issue/state/label which
//     virtually every layout subscribes to).
//   - lazy: route-bound or feature-bound (analytics, dashboard, gantt cycle,
//     modules, command palette, power-k, sticky, editorAsset, etc.). Built on
//     first access and cached.
//
// `resetOnSignOut` clears both tiers — eager stores get a fresh instance, and
// every lazy slot resets so the next access reconstructs.
export class CoreRootStore {
  // eager
  router: IRouterStore;
  instance: IInstanceStore;
  user: IUserStore;
  theme: IThemeStore;
  workspaceRoot: IWorkspaceRootStore;
  projectRoot: IProjectRootStore;
  memberRoot: IMemberRootStore;
  issue: IIssueRootStore;
  state: IStateStore;
  label: ILabelStore;

  // lazy backing fields
  private _agent?: IAgentStore;
  private _cycle?: ICycleStore;
  private _cycleFilter?: ICycleFilterStore;
  private _module?: IModuleStore;
  private _moduleFilter?: IModuleFilterStore;
  private _projectView?: IProjectViewStore;
  private _dashboard?: IDashboardStore;
  private _analytics?: IAnalyticsStore;
  private _projectPages?: IProjectPageStore;
  private _commandPalette?: ICommandPaletteStore;
  private _projectInbox?: IProjectInboxStore;
  private _projectEstimate?: IProjectEstimateStore;
  private _multipleSelect?: IMultipleSelectStore;
  private _workspaceNotification?: IWorkspaceNotificationStore;
  private _favorite?: IFavoriteStore;
  private _bookmark?: IBookmarkStore;
  private _stickyStore?: IStickyStore;
  private _editorAssetStore?: IEditorAssetStore;
  private _workItemFilters?: IWorkItemFilterStore;
  private _powerK?: IPowerKStore;

  constructor() {
    this.router = new RouterStore();
    this.instance = new InstanceStore();
    this.user = new UserStore(this as unknown as RootStore);
    this.theme = new ThemeStore();
    this.workspaceRoot = new WorkspaceRootStore(this as unknown as RootStore);
    this.projectRoot = new ProjectRootStore(this);
    this.memberRoot = new MemberRootStore(this as unknown as RootStore);
    this.issue = new IssueRootStore(this as unknown as RootStore);
    this.state = new StateStore(this as unknown as RootStore);
    this.label = new LabelStore(this);
  }

  get agent(): IAgentStore {
    return (this._agent ??= new AgentStore());
  }
  get cycle(): ICycleStore {
    return (this._cycle ??= new CycleStore(this));
  }
  get cycleFilter(): ICycleFilterStore {
    return (this._cycleFilter ??= new CycleFilterStore(this));
  }
  get module(): IModuleStore {
    return (this._module ??= new ModulesStore(this));
  }
  get moduleFilter(): IModuleFilterStore {
    return (this._moduleFilter ??= new ModuleFilterStore(this));
  }
  get projectView(): IProjectViewStore {
    return (this._projectView ??= new ProjectViewStore(this));
  }
  get dashboard(): IDashboardStore {
    return (this._dashboard ??= new DashboardStore(this));
  }
  get analytics(): IAnalyticsStore {
    return (this._analytics ??= new AnalyticsStore());
  }
  get projectPages(): IProjectPageStore {
    return (this._projectPages ??= new ProjectPageStore(this as unknown as RootStore));
  }
  get commandPalette(): ICommandPaletteStore {
    return (this._commandPalette ??= new CommandPaletteStore());
  }
  get projectInbox(): IProjectInboxStore {
    return (this._projectInbox ??= new ProjectInboxStore(this));
  }
  get projectEstimate(): IProjectEstimateStore {
    return (this._projectEstimate ??= new ProjectEstimateStore(this));
  }
  get multipleSelect(): IMultipleSelectStore {
    return (this._multipleSelect ??= new MultipleSelectStore());
  }
  get workspaceNotification(): IWorkspaceNotificationStore {
    return (this._workspaceNotification ??= new WorkspaceNotificationStore(this));
  }
  get favorite(): IFavoriteStore {
    return (this._favorite ??= new FavoriteStore(this));
  }
  get bookmark(): IBookmarkStore {
    return (this._bookmark ??= new BookmarkStore());
  }
  get stickyStore(): IStickyStore {
    return (this._stickyStore ??= new StickyStore());
  }
  get editorAssetStore(): IEditorAssetStore {
    return (this._editorAssetStore ??= new EditorAssetStore());
  }
  get workItemFilters(): IWorkItemFilterStore {
    return (this._workItemFilters ??= new WorkItemFilterStore());
  }
  get powerK(): IPowerKStore {
    return (this._powerK ??= new PowerKStore());
  }

  resetOnSignOut() {
    localStorage.setItem("theme", "system");
    void setLanguage(FALLBACK_LANGUAGE);

    // eager: reconstruct
    this.router = new RouterStore();
    this.instance = new InstanceStore();
    this.user = new UserStore(this as unknown as RootStore);
    this.workspaceRoot = new WorkspaceRootStore(this as unknown as RootStore);
    this.projectRoot = new ProjectRootStore(this);
    this.memberRoot = new MemberRootStore(this as unknown as RootStore);
    this.issue = new IssueRootStore(this as unknown as RootStore);
    this.state = new StateStore(this as unknown as RootStore);
    this.label = new LabelStore(this);

    // lazy: clear cache, next access rebuilds
    this._agent = undefined;
    this._cycle = undefined;
    this._cycleFilter = undefined;
    this._module = undefined;
    this._moduleFilter = undefined;
    this._projectView = undefined;
    this._dashboard = undefined;
    this._analytics = undefined;
    this._projectPages = undefined;
    this._commandPalette = undefined;
    this._projectInbox = undefined;
    this._projectEstimate = undefined;
    this._multipleSelect = undefined;
    this._workspaceNotification = undefined;
    this._favorite = undefined;
    this._bookmark = undefined;
    this._stickyStore = undefined;
    this._editorAssetStore = undefined;
    this._workItemFilters = undefined;
    this._powerK = undefined;
  }
}
