/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "react-router";
// plane imports
import {
  GROUPED_PROFILE_SETTINGS,
  PROFILE_SETTINGS_CATEGORIES,
  PROFILE_SETTINGS_CATEGORY_LABELS,
} from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { TProfileSettingsTabs } from "@plane/types";
// local imports
import type { SettingsSidebarIconPair } from "../../sidebar/item";
import { SettingsSidebarItem } from "../../sidebar/item";
import { Bell, History, Key, Settings, Shield, UserRounded } from "@solar-icons/react/ssr";
import { createSolarSidebarIconPair } from "@/components/sidebar/solar-icon";
import { ProfileSettingsSidebarWorkspaceOptions } from "./workspace-options";

const ICONS: Record<TProfileSettingsTabs, SettingsSidebarIconPair> = {
  general: createSolarSidebarIconPair(UserRounded),
  security: createSolarSidebarIconPair(Shield),
  activity: createSolarSidebarIconPair(History),
  preferences: createSolarSidebarIconPair(Settings),
  notifications: createSolarSidebarIconPair(Bell),
  "api-tokens": createSolarSidebarIconPair(Key),
};

type Props = {
  activeTab: TProfileSettingsTabs;
  updateActiveTab: (tab: TProfileSettingsTabs) => void;
};

export const ProfileSettingsSidebarItemCategories = observer(function ProfileSettingsSidebarItemCategories(
  props: Props
) {
  const { activeTab, updateActiveTab } = props;
  // params
  const { profileTabId } = useParams();
  // translation
  const { t } = useTranslation();

  return (
    <div className="mt-4 flex flex-col gap-y-4">
      {PROFILE_SETTINGS_CATEGORIES.map((category) => {
        const categoryItems = GROUPED_PROFILE_SETTINGS[category];

        if (categoryItems.length === 0) return null;

        return (
          <div key={category} className="shrink-0">
            <div className="p-2 text-caption-md-medium text-tertiary capitalize">
              {t(PROFILE_SETTINGS_CATEGORY_LABELS[category])}
            </div>
            <div className="flex flex-col">
              {categoryItems.map((item) => (
                <SettingsSidebarItem
                  key={item.key}
                  as="button"
                  onClick={() => updateActiveTab(item.key)}
                  isActive={activeTab === item.key}
                  icon={ICONS[item.key].icon}
                  activeIcon={ICONS[item.key].activeIcon}
                  label={t(item.i18n_label)}
                />
              ))}
            </div>
          </div>
        );
      })}
      {profileTabId && <ProfileSettingsSidebarWorkspaceOptions />}
    </div>
  );
});
