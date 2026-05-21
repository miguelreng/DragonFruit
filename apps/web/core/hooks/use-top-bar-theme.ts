/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * The top bar (and the outer frame around the rounded app card) is always
 * dark — same chrome in both page themes. Dialogs spawned from the bar
 * (power-k search, notifications, help, user menu) inherit the dark
 * styling via this hook so they match the frame, not the page body.
 *
 * Kept as a hook so call-sites that already destructure it don't need to
 * change shape if we bring back theme-based inversion later.
 */
export const useTopBarTheme = (): "dark" | "light" => "dark";
