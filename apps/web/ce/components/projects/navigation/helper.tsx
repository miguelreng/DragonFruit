/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { EUserPermissions, EProjectFeatureKey } from "@plane/constants";
import {
  Calendar,
  Checklist,
  Document,
  Eye,
  Inbox,
  Layers,
} from "@solar-icons/react/ssr";
// components
import type { TNavigationItem } from "@/components/workspace/sidebar/project-navigation";
import { createSolarSidebarIconPair } from "@/components/sidebar/solar-icon";

export const getProjectFeatureNavigation = (
  workspaceSlug: string,
  projectId: string,
  project: {
    cycle_view: boolean;
    module_view: boolean;
    issue_views_view: boolean;
    page_view: boolean;
    inbox_view: boolean;
  }
): TNavigationItem[] => [
  {
    i18n_key: "sidebar.work_items",
    key: EProjectFeatureKey.WORK_ITEMS,
    name: "Tasks",
    href: `/${workspaceSlug}/projects/${projectId}/issues`,
    ...createSolarSidebarIconPair(Checklist),
    access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
    shouldRender: true,
    sortOrder: 1,
  },
  {
    i18n_key: "sidebar.cycles",
    key: EProjectFeatureKey.CYCLES,
    name: "Cycles",
    href: `/${workspaceSlug}/projects/${projectId}/cycles`,
    ...createSolarSidebarIconPair(Calendar),
    access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    shouldRender: project.cycle_view,
    sortOrder: 2,
  },
  {
    i18n_key: "sidebar.modules",
    key: EProjectFeatureKey.MODULES,
    name: "Modules",
    href: `/${workspaceSlug}/projects/${projectId}/modules`,
    ...createSolarSidebarIconPair(Layers),
    access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    shouldRender: project.module_view,
    sortOrder: 3,
  },
  {
    i18n_key: "sidebar.views",
    key: EProjectFeatureKey.VIEWS,
    name: "Views",
    href: `/${workspaceSlug}/projects/${projectId}/views`,
    ...createSolarSidebarIconPair(Eye),
    access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
    shouldRender: project.issue_views_view,
    sortOrder: 4,
  },
  {
    i18n_key: "sidebar.pages",
    key: EProjectFeatureKey.PAGES,
    name: "Pages",
    href: `/${workspaceSlug}/projects/${projectId}/pages`,
    ...createSolarSidebarIconPair(Document),
    access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
    shouldRender: project.page_view,
    sortOrder: 5,
  },
  {
    i18n_key: "sidebar.intake",
    key: EProjectFeatureKey.INTAKE,
    name: "Intake",
    href: `/${workspaceSlug}/projects/${projectId}/intake`,
    ...createSolarSidebarIconPair(Inbox),
    access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
    shouldRender: project.inbox_view,
    sortOrder: 6,
  },
];
