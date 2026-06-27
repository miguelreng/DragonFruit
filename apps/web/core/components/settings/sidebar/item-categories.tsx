/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { usePathname } from "next/navigation";
import { useParams } from "react-router";
// plane imports
import {
  EUserPermissionsLevel,
  GROUPED_PROFILE_SETTINGS,
  GROUPED_WORKSPACE_SETTINGS,
  PROFILE_SETTINGS_CATEGORIES,
  WORKSPACE_SETTINGS_CATEGORIES,
  WORKSPACE_SETTINGS_CATEGORY_LABELS,
} from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { TProfileSettingsTabs } from "@plane/types";
import { joinUrlPath } from "@plane/utils";
import { Bell, History, Key, Settings, Shield, UserRounded } from "@solar-icons/react/ssr";
// components
import { ACTIVE_WORKSPACE_SETTINGS_ICONS, WORKSPACE_SETTINGS_ICONS } from "@/components/settings/workspace/sidebar/item-icon";
import { createSolarSidebarIconPair } from "@/components/sidebar/solar-icon";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { SettingsSidebarIconPair } from "./item";
import { SettingsSidebarItem } from "./item";

// Personal account (profile) settings live alongside workspace settings in one
// unified sidebar. These items are never role-gated — any workspace member,
// including guests, can manage their own account.
const ACCOUNT_ICONS: Record<TProfileSettingsTabs, SettingsSidebarIconPair> = {
  general: createSolarSidebarIconPair(UserRounded),
  security: createSolarSidebarIconPair(Shield),
  activity: createSolarSidebarIconPair(History),
  preferences: createSolarSidebarIconPair(Settings),
  notifications: createSolarSidebarIconPair(Bell),
  "api-tokens": createSolarSidebarIconPair(Key),
};

// Account items flattened in display order (general, preferences, …, api-tokens).
const ACCOUNT_ITEMS = PROFILE_SETTINGS_CATEGORIES.flatMap((category) => GROUPED_PROFILE_SETTINGS[category]);

export const SettingsSidebarItemCategories = observer(function SettingsSidebarItemCategories() {
  // params
  const { workspaceSlug } = useParams();
  const pathname = usePathname();
  // store hooks
  const { allowPermissions } = useUserPermissions();
  // translation
  const { t } = useTranslation();

  const slug = workspaceSlug ?? "";
  const normalizedPathname = pathname.replace(/\/+$/, "");

  return (
    <div className="mt-3 flex flex-col divide-y divide-subtle px-3">
      {/* Account — personal, not role-gated */}
      <div className="shrink-0 py-3 first:pt-0 last:pb-0">
        <div className="p-2 text-caption-md-medium text-tertiary capitalize">{t("common.your_profile")}</div>
        <div className="flex flex-col">
          {ACCOUNT_ITEMS.map((item) => {
            const href = `/settings/account/${item.key}`;
            const isItemActive = normalizedPathname === `/${slug}${href}`;

            return (
              <SettingsSidebarItem
                key={item.key}
                as="link"
                href={joinUrlPath(slug, href)}
                isActive={isItemActive}
                icon={ACCOUNT_ICONS[item.key].icon}
                activeIcon={ACCOUNT_ICONS[item.key].activeIcon}
                label={t(item.i18n_label)}
              />
            );
          })}
        </div>
      </div>

      {/* Workspace — role-gated */}
      {WORKSPACE_SETTINGS_CATEGORIES.map((category) => {
        const categoryItems = GROUPED_WORKSPACE_SETTINGS[category];
        const accessibleItems = categoryItems.filter((item) =>
          allowPermissions(item.access, EUserPermissionsLevel.WORKSPACE, slug)
        );

        if (accessibleItems.length === 0) return null;

        return (
          <div key={category} className="shrink-0 py-3 first:pt-0 last:pb-0">
            <div className="p-2 text-caption-md-medium text-tertiary capitalize">
              {t(WORKSPACE_SETTINGS_CATEGORY_LABELS[category])}
            </div>
            <div className="flex flex-col">
              {accessibleItems.map((item) => {
                const isItemActive =
                  item.href === "/settings"
                    ? pathname === `/${slug}${item.href}/`
                    : new RegExp(`^/${slug}${item.href}/`).test(pathname);

                return (
                  <SettingsSidebarItem
                    key={item.key}
                    as="link"
                    href={joinUrlPath(slug, item.href)}
                    isActive={isItemActive}
                    icon={WORKSPACE_SETTINGS_ICONS[item.key]}
                    activeIcon={ACTIVE_WORKSPACE_SETTINGS_ICONS[item.key]}
                    label={t(item.i18n_label)}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
});
