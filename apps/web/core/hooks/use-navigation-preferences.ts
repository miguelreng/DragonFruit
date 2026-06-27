/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useState } from "react";
import type {
  TAppRailDisplayMode,
  TAppRailPreferences,
  TProjectNavigationPreferences,
} from "@/types/navigation-preferences";
import { DEFAULT_APP_RAIL_PREFERENCES, DEFAULT_PROJECT_PREFERENCES } from "@/types/navigation-preferences";
import { getValueFromLocalStorage, setValueIntoLocalStorage } from "./use-local-storage";

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

/**
 * Persist a small JSON-serializable record to localStorage. The legacy
 * useLocalStorage seeds from the default and never re-reads storage on mount,
 * so any preference saved through it silently resets on a full page reload.
 * The web app is a client-only SPA (no SSR — see react-router.config.ts), so we
 * read the persisted value synchronously on first render (no default→stored
 * flash) and keep every hook instance in sync via a window event.
 */
const usePersistedValue = <T extends object>(key: string, defaultValue: T) => {
  const read = useCallback(
    (): T => ({ ...defaultValue, ...getValueFromLocalStorage(key, defaultValue) }),
    [key, defaultValue]
  );
  const [value, setValue] = useState<T>(read);
  useEffect(() => {
    const sync = () => setValue(read());
    window.addEventListener(`local-storage:${key}`, sync);
    return () => window.removeEventListener(`local-storage:${key}`, sync);
  }, [key, read]);

  const persist = useCallback(
    (next: T) => {
      setValueIntoLocalStorage(key, next);
      // Fires synchronously, so this instance (and any other) re-reads at once.
      window.dispatchEvent(new Event(`local-storage:${key}`));
    },
    [key]
  );

  return [value, persist] as const;
};

const APP_RAIL_PREFERENCES_KEY = "app_rail_preferences";

export const useAppRailPreferences = () => {
  const [preferences, persist] = usePersistedValue<TAppRailPreferences>(
    APP_RAIL_PREFERENCES_KEY,
    DEFAULT_APP_RAIL_PREFERENCES
  );

  const updateDisplayMode = useCallback((mode: TAppRailDisplayMode) => persist({ displayMode: mode }), [persist]);

  const toggleDisplayMode = useCallback(
    () => updateDisplayMode(preferences.displayMode === "icon_only" ? "icon_with_label" : "icon_only"),
    [preferences.displayMode, updateDisplayMode]
  );

  return {
    preferences,
    updateDisplayMode,
    toggleDisplayMode,
  };
};

const APP_RAIL_CATEGORIES_KEY = "app_rail_categories";

export type TAppRailCategory = "favorites" | "recents" | "projects";
type TAppRailCategoryState = Record<TAppRailCategory, boolean>;
const DEFAULT_APP_RAIL_CATEGORY_STATE: TAppRailCategoryState = {
  favorites: true,
  recents: true,
  projects: true,
};

/**
 * Open/closed state of the rail's collapsible category groups (Favs, Recents,
 * Projects), persisted so a reload keeps whatever the user collapsed.
 */
export const useAppRailCategories = () => {
  const [openCategories, persist] = usePersistedValue<TAppRailCategoryState>(
    APP_RAIL_CATEGORIES_KEY,
    DEFAULT_APP_RAIL_CATEGORY_STATE
  );

  const toggleCategory = useCallback(
    (category: TAppRailCategory) => persist({ ...openCategories, [category]: !openCategories[category] }),
    [openCategories, persist]
  );

  return { openCategories, toggleCategory };
};
