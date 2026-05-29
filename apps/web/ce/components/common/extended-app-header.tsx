/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { useParams } from "react-router";
import { IconButton } from "@plane/propel/icon-button";
// components
import { PanelLeft } from "@/components/icons/lucide-shim";
import { AppSidebarToggleButton } from "@/components/sidebar/sidebar-toggle-button";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useAppRailVisibility } from "@/lib/app-rail";
import { useProjectNavigationPreferences } from "@/hooks/use-navigation-preferences";

export const ExtendedAppHeader = observer(function ExtendedAppHeader(props: { header: ReactNode }) {
  const { header } = props;
  // params
  const { projectId, workItem } = useParams();
  // preferences
  const { preferences: projectPreferences } = useProjectNavigationPreferences();
  // store hooks
  const { sidebarCollapsed } = useAppTheme();
  const { openMobileDrawer } = useAppRailVisibility();
  // derived values
  const shouldShowSidebarToggleButton = projectPreferences.navigationMode === "ACCORDION" || (!projectId && !workItem);

  return (
    <>
      {/* Mobile-only trigger for the slide-over navigation drawer. */}
      <IconButton
        size="base"
        variant="ghost"
        icon={PanelLeft}
        onClick={openMobileDrawer}
        aria-label="Open navigation"
        className="md:hidden"
      />
      {sidebarCollapsed && shouldShowSidebarToggleButton && <AppSidebarToggleButton />}
      <div className="w-full">{header}</div>
    </>
  );
});
