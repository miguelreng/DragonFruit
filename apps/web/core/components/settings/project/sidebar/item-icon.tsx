/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TProjectSettingsTabs } from "@plane/types";
import type { SettingsSidebarIcon } from "../../sidebar/item";
import {
  Chart,
  Document,
  Eye,
  Inbox,
  Layers,
  Lightning,
  Repeat,
  Settings,
  Shield,
  Tag,
  UsersGroupRounded,
} from "@solar-icons/react/ssr";
import { createSolarSidebarIcon } from "@/components/sidebar/solar-icon";

export const PROJECT_SETTINGS_ICONS: Record<TProjectSettingsTabs, SettingsSidebarIcon> = {
  general: createSolarSidebarIcon(Settings, "Outline"),
  members: createSolarSidebarIcon(UsersGroupRounded, "Outline"),
  features_cycles: createSolarSidebarIcon(Repeat, "Outline"),
  features_modules: createSolarSidebarIcon(Layers, "Outline"),
  features_views: createSolarSidebarIcon(Eye, "Outline"),
  features_pages: createSolarSidebarIcon(Document, "Outline"),
  features_intake: createSolarSidebarIcon(Inbox, "Outline"),
  states: createSolarSidebarIcon(Shield, "Outline"),
  labels: createSolarSidebarIcon(Tag, "Outline"),
  estimates: createSolarSidebarIcon(Chart, "Outline"),
  automations: createSolarSidebarIcon(Lightning, "Outline"),
};

export const ACTIVE_PROJECT_SETTINGS_ICONS: Record<TProjectSettingsTabs, SettingsSidebarIcon> = {
  general: createSolarSidebarIcon(Settings, "BoldDuotone"),
  members: createSolarSidebarIcon(UsersGroupRounded, "BoldDuotone"),
  features_cycles: createSolarSidebarIcon(Repeat, "BoldDuotone"),
  features_modules: createSolarSidebarIcon(Layers, "BoldDuotone"),
  features_views: createSolarSidebarIcon(Eye, "BoldDuotone"),
  features_pages: createSolarSidebarIcon(Document, "BoldDuotone"),
  features_intake: createSolarSidebarIcon(Inbox, "BoldDuotone"),
  states: createSolarSidebarIcon(Shield, "BoldDuotone"),
  labels: createSolarSidebarIcon(Tag, "BoldDuotone"),
  estimates: createSolarSidebarIcon(Chart, "BoldDuotone"),
  automations: createSolarSidebarIcon(Lightning, "BoldDuotone"),
};
