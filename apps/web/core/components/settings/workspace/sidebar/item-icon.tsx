/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TWorkspaceSettingsTabs } from "@plane/types";
import type { SettingsSidebarIcon } from "../../sidebar/item";
import {
  Download,
  FileText,
  InfoCircle,
  Link,
  MagicStick,
  Rocket,
  Server,
  Settings,
  Widget,
  Upload,
  UserRounded,
} from "@solar-icons/react/ssr";
import { createSolarSidebarIcon } from "@/components/sidebar/solar-icon";

export const WORKSPACE_SETTINGS_ICONS: Record<TWorkspaceSettingsTabs, SettingsSidebarIcon> = {
  general: createSolarSidebarIcon(Settings, "Outline"),
  members: createSolarSidebarIcon(UserRounded, "Outline"),
  export: createSolarSidebarIcon(Upload, "Outline"),
  imports: createSolarSidebarIcon(Download, "Outline"),
  webhooks: createSolarSidebarIcon(Link, "Outline"),
  ai: createSolarSidebarIcon(MagicStick, "Outline"),
  agents: createSolarSidebarIcon(Rocket, "Outline"),
  integrations: createSolarSidebarIcon(Widget, "Outline"),
  about: createSolarSidebarIcon(InfoCircle, "Outline"),
  mcp: createSolarSidebarIcon(Server, "Outline"),
  templates: createSolarSidebarIcon(FileText, "Outline"),
};

export const ACTIVE_WORKSPACE_SETTINGS_ICONS: Record<TWorkspaceSettingsTabs, SettingsSidebarIcon> = {
  general: createSolarSidebarIcon(Settings, "BoldDuotone"),
  members: createSolarSidebarIcon(UserRounded, "BoldDuotone"),
  export: createSolarSidebarIcon(Upload, "BoldDuotone"),
  imports: createSolarSidebarIcon(Download, "BoldDuotone"),
  webhooks: createSolarSidebarIcon(Link, "BoldDuotone"),
  ai: createSolarSidebarIcon(MagicStick, "BoldDuotone"),
  agents: createSolarSidebarIcon(Rocket, "BoldDuotone"),
  integrations: createSolarSidebarIcon(Widget, "BoldDuotone"),
  about: createSolarSidebarIcon(InfoCircle, "BoldDuotone"),
  mcp: createSolarSidebarIcon(Server, "BoldDuotone"),
  templates: createSolarSidebarIcon(FileText, "BoldDuotone"),
};
