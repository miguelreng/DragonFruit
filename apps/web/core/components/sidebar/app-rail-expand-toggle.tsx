/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Sidebar } from "@solar-icons/react/ssr";
import { cn } from "@plane/utils";
// hooks
import { useAppRailPreferences } from "@/hooks/use-navigation-preferences";

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
      <button
        type="button"
        onClick={() => updateDisplayMode("icon_with_label")}
        className="grid size-8 shrink-0 place-items-center rounded-lg text-icon-tertiary hover:bg-layer-transparent-hover hover:text-icon-secondary dark:text-white/55 dark:hover:bg-white/[0.08] dark:hover:text-white/90 [&_svg]:size-4 [&_svg]:text-current"
        aria-label="Expand app rail"
      >
        <Sidebar className="size-4" weight="Outline" />
      </button>
      {withDivider && <div className="h-5 w-px bg-layer-3" />}
    </div>
  );
};
