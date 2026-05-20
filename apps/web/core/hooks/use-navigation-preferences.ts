/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";
import type { TAppRailDisplayMode, TAppRailPreferences, TProjectNavigationPreferences } from "@/types/navigation-preferences";
import { DEFAULT_APP_RAIL_PREFERENCES, DEFAULT_PROJECT_PREFERENCES } from "@/types/navigation-preferences";
import useLocalStorage from "./use-local-storage";

/**
 * Project navigation preferences (accordion vs tabbed, limited projects on
 * sidebar). The "Customize navigation" modal that exposed mutation controls
 * was removed alongside the per-user sidebar preference UI; this hook now
 * returns the project-wide defaults so the existing render paths
 * (accordion-vs-tabbed, project-count cap) keep working without a setting
 * to flip.
 *
 * If we later add a workspace-level project-nav config (separate from per-
 * user pinning), this is the single place to wire it.
 */
export const useProjectNavigationPreferences = (): {
  preferences: TProjectNavigationPreferences;
} => ({ preferences: DEFAULT_PROJECT_PREFERENCES });

const APP_RAIL_PREFERENCES_KEY = "app_rail_preferences";

export const useAppRailPreferences = () => {
  const { storedValue, setValue } = useLocalStorage<TAppRailPreferences>(
    APP_RAIL_PREFERENCES_KEY,
    DEFAULT_APP_RAIL_PREFERENCES
  );

  const updateDisplayMode = useCallback(
    (mode: TAppRailDisplayMode) => {
      setValue({
        displayMode: mode,
      });
    },
    [setValue]
  );

  const toggleDisplayMode = useCallback(() => {
    const currentPreferences = storedValue || DEFAULT_APP_RAIL_PREFERENCES;
    const newMode = currentPreferences.displayMode === "icon_only" ? "icon_with_label" : "icon_only";
    updateDisplayMode(newMode);
  }, [storedValue, updateDisplayMode]);

  return {
    preferences: storedValue || DEFAULT_APP_RAIL_PREFERENCES,
    updateDisplayMode,
    toggleDisplayMode,
  };
};
