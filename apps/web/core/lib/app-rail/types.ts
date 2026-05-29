/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Type definitions for app-rail visibility context
 */

export interface IAppRailVisibilityContext {
  /**
   * Whether the app rail is enabled
   */
  isEnabled: boolean;

  /**
   * Whether the app rail is collapsed (user preference from localStorage)
   */
  isCollapsed: boolean;

  /**
   * Computed property: whether the app rail should actually render
   * True only if isEnabled && !isCollapsed
   */
  shouldRenderAppRail: boolean;

  /**
   * Toggle the collapse state of the app rail
   */
  toggleAppRail: () => void;

  /**
   * Whether the mobile slide-over drawer is open. Only meaningful below the
   * mobile breakpoint, where the rail renders as an off-canvas drawer.
   */
  isMobileDrawerOpen: boolean;

  /**
   * Open the mobile slide-over drawer.
   */
  openMobileDrawer: () => void;

  /**
   * Close the mobile slide-over drawer.
   */
  closeMobileDrawer: () => void;

  /**
   * Toggle the mobile slide-over drawer.
   */
  toggleMobileDrawer: () => void;
}
