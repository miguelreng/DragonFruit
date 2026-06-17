/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { FC } from "react";
// plane imports
import {
  Download,
  FileText,
  House,
  Info,
  Rocket,
  Sparkle,
  UploadCloud,
  Users,
  Webhook,
} from "@plane/icons";
import type { ISvgIcons } from "@plane/propel/icons";
import { CellsIcon, McpServerIcon } from "@plane/propel/icons";
import type { TWorkspaceSettingsTabs } from "@plane/types";

export const WORKSPACE_SETTINGS_ICONS: Record<TWorkspaceSettingsTabs, FC<ISvgIcons>> = {
  general: House,
  members: Users,
  export: UploadCloud,
  imports: Download,
  webhooks: Webhook,
  ai: Sparkle,
  agents: Rocket,
  integrations: CellsIcon,
  about: Info,
  mcp: McpServerIcon,
  templates: FileText,
};
