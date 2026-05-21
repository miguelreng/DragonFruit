/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { LucideIcon } from "@/components/icons/lucide-shim";
import {
  ArrowUpToLine,
  Building,
  Download,
  FileText,
  Info,
  Sparkles,
  Swap,
  Users,
  Wand2,
  Webhook,
} from "@/components/icons/lucide-shim";
// plane imports
import type { ISvgIcons } from "@plane/propel/icons";
import type { TWorkspaceSettingsTabs } from "@plane/types";

export const WORKSPACE_SETTINGS_ICONS: Record<TWorkspaceSettingsTabs, LucideIcon | React.FC<ISvgIcons>> = {
  general: Building,
  members: Users,
  export: ArrowUpToLine,
  imports: Download,
  webhooks: Webhook,
  ai: Sparkles,
  agents: Wand2,
  about: Info,
  // Swap == bidirectional arrows — fits MCP's "tools flow both ways"
  // (clients call us, our agents call others). Replace with a proper
  // plug icon when the shim grows one.
  mcp: Swap,
  templates: FileText,
};
