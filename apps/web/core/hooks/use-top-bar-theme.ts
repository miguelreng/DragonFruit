/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTheme } from "next-themes";

/**
 * The top bar inverts the page theme by design (dark frame in light mode,
 * light frame in dark mode). Dialogs spawned from the top bar — the power-k
 * search, notifications, help and user menus — should match the bar, not
 * the page. This hook returns the resolved theme of the top bar so those
 * dialogs can flip via `data-theme` on their panel.
 */
export const useTopBarTheme = (): "dark" | "light" => {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === "dark" ? "light" : "dark";
};
