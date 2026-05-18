/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTheme } from "next-themes";
import { DragonfruitLogo } from "@plane/propel/icons";

/**
 * Instance-level loading indicator using the Dragonfruit mark.
 * Light mode: brand magenta. Dark mode: white.
 * Animation uses Tailwind's `animate-spin` (1s linear, infinite).
 */
export function InstanceLoading() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <div className="flex items-center justify-center">
      <DragonfruitLogo
        width="100%"
        height="100%"
        className="h-6 w-auto animate-spin sm:h-11"
        color={isDark ? "#FFFFFF" : "#8A0052"}
      />
    </div>
  );
}
