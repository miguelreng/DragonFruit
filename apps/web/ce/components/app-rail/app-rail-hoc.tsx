/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// hoc/withDockItems.tsx
import React from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { useParams, usePathname } from "next/navigation";
import { EUserPermissionsLevel, WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS } from "@plane/constants";
import { joinUrlPath } from "@plane/utils";
import type { AppSidebarItemData } from "@/components/sidebar/sidebar-item";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import { getSidebarNavigationItemIcon } from "@/plane-web/components/workspace/sidebar/helper";

type WithDockItemsProps = {
  dockItems: (AppSidebarItemData & { shouldRender: boolean })[];
};

export function withDockItems<P extends WithDockItemsProps>(WrappedComponent: React.ComponentType<P>) {
  const ComponentWithDockItems = observer(function ComponentWithDockItems(props: Omit<P, keyof WithDockItemsProps>) {
    const { workspaceSlug } = useParams();
    const pathname = usePathname();
    const { t } = useTranslation();
    const { allowPermissions } = useUserPermissions();
    const { data: currentUser } = useUser();
    const slug = workspaceSlug?.toString() ?? "";

    const railItemKeys: Array<keyof typeof WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS> = [
      "home",
      "your-work",
      "calendar",
      "docs",
      "whiteboards",
      "stickies",
      "bookmarks",
    ];

    const railItems = railItemKeys.map((key) => {
      const item = WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS[key];
      if (!item || !slug || !allowPermissions(item.access, EUserPermissionsLevel.WORKSPACE, slug)) return null;

      const href = item.key === "your_work" ? `/${slug}/tasks` : joinUrlPath(`/${slug}`, item.href);

      return {
        label:
          item.key === "your_work"
            ? "My tasks"
            : item.key === "whiteboards"
              ? "Whiteboards"
              : t(item.labelTranslationKey),
        icon: getSidebarNavigationItemIcon(item.key),
        activeIcon: getSidebarNavigationItemIcon(item.key, "", true),
        href,
        isActive: item.highlight(pathname || "", href),
        shouldRender: item.key !== "your_work" || !!currentUser?.id,
      };
    });

    const dockItems = railItems.reduce((acc: (AppSidebarItemData & { shouldRender: boolean })[], item) => {
      if (item) acc.push(item);
      return acc;
    }, []);

    // Workflows is a DragonFruit-only surface (Atlas automations / apps / actions),
    // so it's built inline here rather than in the shared @plane/constants nav map.
    if (slug) {
      const workflowsHref = `/${slug}/workflows`;
      dockItems.push({
        label: "Workflows",
        icon: getSidebarNavigationItemIcon("workflows"),
        activeIcon: getSidebarNavigationItemIcon("workflows", "", true),
        href: workflowsHref,
        isActive: (pathname || "").startsWith(workflowsHref),
        shouldRender: true,
      });
    }

    return <WrappedComponent {...(props as P)} dockItems={dockItems} />;
  });

  return ComponentWithDockItems;
}
