/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "react-router";
// plane imports
import { PROFILE_SETTINGS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { TProfileSettingsTabs } from "@plane/types";
import { Breadcrumbs } from "@plane/ui";
import { Bell, History, Key, Settings, Shield, UserRounded } from "@solar-icons/react/ssr";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { SettingsPageHeader } from "@/components/settings/page-header";
import { createSolarSidebarIcon } from "@/components/sidebar/solar-icon";

// Outline-weight icons mirror the workspace settings breadcrumb treatment.
const ACCOUNT_SETTINGS_ICONS: Record<TProfileSettingsTabs, ReturnType<typeof createSolarSidebarIcon>> = {
  general: createSolarSidebarIcon(UserRounded, "Outline"),
  security: createSolarSidebarIcon(Shield, "Outline"),
  activity: createSolarSidebarIcon(History, "Outline"),
  preferences: createSolarSidebarIcon(Settings, "Outline"),
  notifications: createSolarSidebarIcon(Bell, "Outline"),
  "api-tokens": createSolarSidebarIcon(Key, "Outline"),
};

export const AccountSettingsHeader = observer(function AccountSettingsHeader() {
  // params
  const { profileTabId } = useParams();
  // translation
  const { t } = useTranslation();
  // derived values
  const tab = (profileTabId ?? "general") as TProfileSettingsTabs;
  const settingsDetails = PROFILE_SETTINGS[tab] ?? PROFILE_SETTINGS.general;
  const Icon = ACCOUNT_SETTINGS_ICONS[tab] ?? ACCOUNT_SETTINGS_ICONS.general;

  return (
    <SettingsPageHeader
      leftItem={
        <div className="flex items-center gap-2">
          <Breadcrumbs>
            <Breadcrumbs.Item
              component={
                <BreadcrumbLink label={t(settingsDetails.i18n_label)} icon={<Icon className="size-4 text-tertiary" />} />
              }
            />
          </Breadcrumbs>
        </div>
      }
    />
  );
});
