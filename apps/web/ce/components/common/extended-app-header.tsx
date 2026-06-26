/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "react-router";
import { Sidebar } from "@solar-icons/react/ssr";
import { IconButton } from "@plane/propel/icon-button";
// components
import { PanelLeft } from "@/components/icons/lucide-shim";
import { AppSidebarToggleButton } from "@/components/sidebar/sidebar-toggle-button";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useAppRailVisibility } from "@/lib/app-rail";
import { useAppRailPreferences, useProjectNavigationPreferences } from "@/hooks/use-navigation-preferences";
import { getValueFromLocalStorage } from "@/hooks/use-local-storage";
import { DEFAULT_APP_RAIL_PREFERENCES } from "@/types/navigation-preferences";

// Mirror of the key used by useAppRailPreferences.
const APP_RAIL_PREFERENCES_KEY = "app_rail_preferences";

export const ExtendedAppHeader = observer(function ExtendedAppHeader(props: { header: ReactNode }) {
  const { header } = props;
  // params
  const { projectId, workItem } = useParams();
  // preferences
  const { preferences: projectPreferences } = useProjectNavigationPreferences();
  const { updateDisplayMode } = useAppRailPreferences();
  // store hooks
  const { sidebarCollapsed } = useAppTheme();
  const { openMobileDrawer } = useAppRailVisibility();
  // derived values
  const shouldShowSidebarToggleButton = projectPreferences.navigationMode === "ACCORDION" || (!projectId && !workItem);
  // Read the rail display mode straight from storage and follow its change
  // event. useAppRailPreferences only hydrates on that event, so a freshly
  // mounted header (it remounts per route) would otherwise read the default
  // ("icon_only") and show the toggle even while the persistent rail is
  // expanded. Start from the default to match SSR, then sync after mount.
  const [railDisplayMode, setRailDisplayMode] = useState(DEFAULT_APP_RAIL_PREFERENCES.displayMode);
  useEffect(() => {
    const sync = () =>
      setRailDisplayMode(getValueFromLocalStorage(APP_RAIL_PREFERENCES_KEY, DEFAULT_APP_RAIL_PREFERENCES).displayMode);
    sync();
    window.addEventListener(`local-storage:${APP_RAIL_PREFERENCES_KEY}`, sync);
    return () => window.removeEventListener(`local-storage:${APP_RAIL_PREFERENCES_KEY}`, sync);
  }, []);
  // When the app rail is collapsed to icons, its expand toggle relocates here,
  // to the left of the page title: [toggle] | [page icon] page title.
  const isRailCollapsed = railDisplayMode === "icon_only";

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
      {isRailCollapsed && (
        <div className="hidden items-center gap-2 md:flex">
          <button
            type="button"
            onClick={() => updateDisplayMode("icon_with_label")}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-icon-tertiary hover:bg-layer-transparent-hover hover:text-icon-secondary dark:text-white/55 dark:hover:bg-white/[0.08] dark:hover:text-white/90 [&_svg]:size-4 [&_svg]:text-current"
            aria-label="Expand app rail"
          >
            <Sidebar className="size-4" weight="Outline" />
          </button>
          <div className="h-5 w-px bg-layer-3" />
        </div>
      )}
      <div className="w-full">{header}</div>
    </>
  );
});
