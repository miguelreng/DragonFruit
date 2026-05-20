/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Breadcrumbs } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { SettingsPageHeader } from "@/components/settings/page-header";
import { WORKSPACE_SETTINGS_ICONS } from "@/components/settings/workspace/sidebar/item-icon";

export function MCPWorkspaceSettingsHeader() {
  const Icon = WORKSPACE_SETTINGS_ICONS.mcp;
  return (
    <SettingsPageHeader
      leftItem={
        <div className="flex items-center gap-2">
          <Breadcrumbs>
            <Breadcrumbs.Item
              component={<BreadcrumbLink label="MCP" icon={<Icon className="size-4 text-tertiary" />} />}
            />
          </Breadcrumbs>
        </div>
      }
    />
  );
}
