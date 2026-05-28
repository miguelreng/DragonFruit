/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useMemo } from "react";
import { observer } from "mobx-react";
// plane imports
import {
  WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS,
  WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS_LINKS,
} from "@plane/constants";
// plane-web imports
import { SidebarItem } from "@/plane-web/components/workspace/sidebar/sidebar-item";

const ALWAYS_ON_TOP_KEYS: Array<keyof typeof WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS> = [
  // Navigation is now hosted by the left app rail. Keep home only in this
  // sidebar wrapper so we don't duplicate links in the main content area.
];

export const SidebarMenuItems = observer(function SidebarMenuItems() {
  const topLevelItems = useMemo(() => {
    const items = [...WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS_LINKS];
    ALWAYS_ON_TOP_KEYS.forEach((key) => {
      const item = WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS[key];
      if (item) items.push(item);
    });
    return items;
  }, []);

  return (
    <div className="flex flex-col gap-1.5">
      {topLevelItems.map((item) => (
        <SidebarItem key={item.key} item={item} />
      ))}
    </div>
  );
});
