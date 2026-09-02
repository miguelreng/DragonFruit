/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Sidebar } from "@solar-icons/react/ssr";
import { cn } from "@plane/utils";
// hooks
import { useAppRailPreferences } from "@/hooks/use-navigation-preferences";
import { IconButton } from "@plane/propel/icon-button";

type Props = {
  // Trailing vertical divider, used in the page header to set the toggle apart
  // from the page title. Omit where the toggle stands on its own.
  withDivider?: boolean;
  // Applied to the wrapper so callers can position the toggle (e.g. as a slim
  // top bar on routes that have no page header).
  className?: string;
};

/**
 * The app rail's "expand" control. While the rail is expanded it docks its own
 * collapse toggle next to the workspace switcher; once collapsed to icons that
 * toggle relocates here, to the page chrome. Hidden on mobile, where the rail is
 * a slide-over drawer rather than a persistent column.
 */
export const AppRailExpandToggle = (props: Props) => {
  const { withDivider = false, className } = props;
  const { preferences, updateDisplayMode } = useAppRailPreferences();

  if (preferences.displayMode !== "icon_only") return null;

  return (
    <div className={cn("hidden items-center gap-2 md:flex", className)}>
      <IconButton
        variant="ghost"
        size="xl"
        icon={Sidebar}
        onClick={() => updateDisplayMode("icon_with_label")}
        aria-label="Expand app rail"
      />
      {withDivider && <div className="h-5 w-px bg-layer-3" />}
    </div>
  );
};
