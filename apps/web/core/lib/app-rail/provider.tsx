/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useCallback, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useLocalStorage from "@/hooks/use-local-storage";
import { AppRailVisibilityContext } from "./context";
import type { IAppRailVisibilityContext } from "./types";

interface AppRailVisibilityProviderProps {
  children: React.ReactNode;
  isEnabled?: boolean; // Allow override, default false
}

/**
 * AppRailVisibilityProvider - manages app rail visibility state
 * Base provider that accepts isEnabled as a prop
 */
export const AppRailVisibilityProvider = observer(function AppRailVisibilityProvider({
  children,
  isEnabled = false,
}: AppRailVisibilityProviderProps) {
  const { workspaceSlug } = useParams();

  // User preference from localStorage
  const { storedValue: isCollapsed, setValue: setIsCollapsed } = useLocalStorage<boolean>(
    `APP_RAIL_${workspaceSlug}`,
    false // Default: not collapsed (app rail visible)
  );

  const toggleAppRail = useCallback(() => {
    setIsCollapsed(!isCollapsed);
  }, [isCollapsed, setIsCollapsed]);

  // Mobile slide-over drawer state. Session-only — the drawer always starts
  // closed on load, mirroring native drawer behavior.
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const openMobileDrawer = useCallback(() => setIsMobileDrawerOpen(true), []);
  const closeMobileDrawer = useCallback(() => setIsMobileDrawerOpen(false), []);
  const toggleMobileDrawer = useCallback(() => setIsMobileDrawerOpen((prev) => !prev), []);

  // Compute final visibility: enabled and not collapsed
  const shouldRenderAppRail = isEnabled && !isCollapsed;

  const value: IAppRailVisibilityContext = useMemo(
    () => ({
      isEnabled,
      isCollapsed: isCollapsed ?? false,
      shouldRenderAppRail,
      toggleAppRail,
      isMobileDrawerOpen,
      openMobileDrawer,
      closeMobileDrawer,
      toggleMobileDrawer,
    }),
    [
      isEnabled,
      isCollapsed,
      shouldRenderAppRail,
      toggleAppRail,
      isMobileDrawerOpen,
      openMobileDrawer,
      closeMobileDrawer,
      toggleMobileDrawer,
    ]
  );

  return <AppRailVisibilityContext.Provider value={value}>{children}</AppRailVisibilityContext.Provider>;
});
