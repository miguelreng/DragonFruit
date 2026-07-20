/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { setToast, TOAST_TYPE } from "@plane/propel/toast";
import { useMember } from "@/hooks/store/use-member";
import { useUser } from "@/hooks/store/user";
import { DEFAULT_TAB_KEY } from "./tab-navigation-utils";
import type { TTabPreferences } from "./tab-navigation-utils";

const EMPTY_HIDDEN_TABS: string[] = [];

export type TTabPreferencesHook = {
  tabPreferences: TTabPreferences;
  isLoading: boolean;
  handleToggleDefaultTab: (tabKey: string) => Promise<void>;
  handleHideTab: (tabKey: string) => Promise<void>;
  handleShowTab: (tabKey: string) => Promise<void>;
};

/**
 * Custom hook to manage tab preferences for a project
 * Uses MobX store for state management and API persistence
 *
 * @param workspaceSlug - The workspace slug
 * @param projectId - The project ID
 * @returns Tab preferences state and handlers
 */
export const useTabPreferences = (workspaceSlug: string, projectId: string): TTabPreferencesHook => {
  const {
    project: { getProjectUserProperties, updateProjectUserProperties },
  } = useMember();
  // const { projectUserInfo } = useUserPermissions();
  const { data } = useUser();

  // Get member ID from projectUserInfo
  // const projectMemberInfo = projectUserInfo[workspaceSlug]?.[projectId];
  const memberId = data?.id || null;

  // Get preferences from store
  const storePreferences = getProjectUserProperties(projectId);
  const defaultTab = storePreferences?.preferences?.navigation?.default_tab || DEFAULT_TAB_KEY;
  const hideInMoreMenu = storePreferences?.preferences?.navigation?.hide_in_more_menu || EMPTY_HIDDEN_TABS;

  // Convert store preferences to component format
  const tabPreferences: TTabPreferences = useMemo(() => {
    return {
      defaultTab,
      hiddenTabs: hideInMoreMenu,
    };
  }, [defaultTab, hideInMoreMenu]);

  const isLoading = memberId === null || !storePreferences;

  /**
   * Update preferences via store
   */
  const updatePreferences = async (newPreferences: TTabPreferences) => {
    await updateProjectUserProperties(workspaceSlug, projectId, {
      preferences: {
        ...storePreferences?.preferences,
        pages: storePreferences?.preferences?.pages || { block_display: false },
        navigation: {
          default_tab: newPreferences.defaultTab,
          hide_in_more_menu: newPreferences.hiddenTabs,
        },
      },
    });
  };

  /**
   * Toggle default tab setting
   * If tab is already default, resets to work_items; otherwise sets as default
   */
  const handleToggleDefaultTab = async (tabKey: string) => {
    const newDefaultTab = tabKey === tabPreferences.defaultTab ? DEFAULT_TAB_KEY : tabKey;
    const newPreferences = { ...tabPreferences, defaultTab: newDefaultTab };
    const updatePromise = updatePreferences(newPreferences);
    setToast({
      type: TOAST_TYPE.SUCCESS,
      title: "Success!",
      message: newDefaultTab === DEFAULT_TAB_KEY ? "Default tab cleared." : "Default tab updated.",
    });
    try {
      await updatePromise;
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: "Failed to update default tab. Please try again later.",
      });
    }
  };

  /**
   * Hide a tab (moves to overflow menu with "Show" option)
   */
  const handleHideTab = async (tabKey: string) => {
    if (tabPreferences.hiddenTabs.includes(tabKey)) return;
    const newPreferences = {
      ...tabPreferences,
      hiddenTabs: [...tabPreferences.hiddenTabs, tabKey],
    };
    const updatePromise = updatePreferences(newPreferences);
    setToast({
      type: TOAST_TYPE.SUCCESS,
      title: "Success!",
      message: "Tab moved to the more menu.",
    });
    try {
      await updatePromise;
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: "Failed to hide tab. Please try again later.",
      });
    }
  };

  /**
   * Show a previously hidden tab (returns to visible pool)
   */
  const handleShowTab = async (tabKey: string) => {
    const newPreferences = {
      ...tabPreferences,
      hiddenTabs: tabPreferences.hiddenTabs.filter((key) => key !== tabKey),
    };
    const updatePromise = updatePreferences(newPreferences);
    setToast({
      type: TOAST_TYPE.SUCCESS,
      title: "Success!",
      message: "Tab restored to the tab bar.",
    });
    try {
      await updatePromise;
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: "Failed to show tab. Please try again later.",
      });
    }
  };

  return {
    tabPreferences,
    isLoading,
    handleToggleDefaultTab,
    handleHideTab,
    handleShowTab,
  };
};
