/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { SidebarMinimalistic } from "@solar-icons/react/ssr";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { isSidebarToggleVisible } from "@/plane-web/components/desktop";
import { createSolarSidebarIcon } from "@/components/sidebar/solar-icon";
import { IconButton } from "@plane/propel/icon-button";

const SidebarToggleIcon = createSolarSidebarIcon(SidebarMinimalistic, "Outline");

export const AppSidebarToggleButton = observer(function AppSidebarToggleButton() {
  // store hooks
  const { toggleSidebar, sidebarPeek, toggleSidebarPeek } = useAppTheme();

  if (!isSidebarToggleVisible()) return null;
  return (
    <IconButton
      size="base"
      variant="ghost"
      icon={SidebarToggleIcon}
      onClick={() => {
        if (sidebarPeek) toggleSidebarPeek(false);
        toggleSidebar();
      }}
    />
  );
});
