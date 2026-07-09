/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Link } from "react-router";
import { PinOff } from "@/components/icons/lucide-shim";
// plane imports
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
import { ContextMenu } from "@plane/propel/context-menu";
import { SetAsDefaultIcon } from "@/components/icons/propel-shim";
import { TabNavigationItem } from "@plane/propel/tab-navigation";
// local imports
import type { TNavigationItem } from "./tab-navigation-root";
import type { TTabPreferences } from "./tab-navigation-utils";

export type TTabNavigationVisibleItemProps = {
  item: TNavigationItem;
  isActive: boolean;
  tabPreferences: TTabPreferences;
  onToggleDefault: (tabKey: string) => void;
  onHide: (tabKey: string) => void;
  itemRef?: (el: HTMLDivElement | null) => void;
};

/**
 * Individual visible tab navigation item with context menu
 * Handles right-click actions for setting default and hiding tabs
 */
export function TabNavigationVisibleItem({
  item,
  isActive,
  tabPreferences,
  onToggleDefault,
  onHide,
  itemRef,
}: TTabNavigationVisibleItemProps) {
  const { t } = useTranslation();
  const isDefault = item.key === tabPreferences.defaultTab;
  // The "pages" feature is branded "Docs" in this product.
  const label = item.key === "pages" ? "Docs" : item.key === "stickies" ? "Stickies" : t(item.i18n_key);

  return (
    <div className="relative flex h-full items-center">
      <div key={`${item.key}-measure`} ref={itemRef}>
        <ContextMenu>
          <ContextMenu.Trigger>
            <Link key={`${item.key}-${isActive ? "active" : "inactive"}`} to={item.href}>
              <TabNavigationItem isActive={false} className={cn(isActive && "hover:bg-transparent")}>
                <span className={cn(isActive && "font-semibold text-secondary")}>{label}</span>
              </TabNavigationItem>
            </Link>
          </ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Content positionerClassName="z-30">
              <ContextMenu.Item
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleDefault(item.key);
                }}
                className="flex cursor-pointer items-center gap-2 text-secondary transition-colors"
              >
                <SetAsDefaultIcon className="size-3 shrink-0" />
                <span className="text-11">{isDefault ? "Clear default" : "Set as default"}</span>
              </ContextMenu.Item>
              <ContextMenu.Item
                onClick={(e) => {
                  e.stopPropagation();
                  onHide(item.key);
                }}
                className="flex cursor-pointer items-center gap-2 text-secondary transition-colors"
              >
                <PinOff className="size-3 shrink-0" />
                <span className="text-11">Hide in more menu</span>
              </ContextMenu.Item>
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu>
      </div>
    </div>
  );
}
