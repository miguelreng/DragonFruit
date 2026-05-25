/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTheme } from "next-themes";

export const useTopBarTheme = (): "dark" | "light" | "sepia" => {
  const { resolvedTheme, theme } = useTheme();
  const activeTheme = resolvedTheme ?? theme;

  if (activeTheme === "sepia") return "sepia";
  return activeTheme === "dark" ? "dark" : "light";
};
