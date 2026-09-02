/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ComponentType } from "react";
import { GridIconShim as GridIcon, List as ListViewIcon } from "@/components/icons/lucide-shim";
// plane utils
import { cn } from "@dragonfruit/utils";
import { IconButton } from "@dragonfruit/propel/icon-button";

export type ViewMode = "list" | "grid";

// Local storage key shared by the stickies page header toggle and the layout.
export const STICKIES_VIEW_MODE_STORAGE_KEY = "stickies_view_mode";

type ViewModeToggleProps = {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
};

type ViewModeIcon = ComponentType<{
  className?: string;
  color?: string;
  size?: number | string;
}>;

export function ViewModeToggle({ mode, onChange }: ViewModeToggleProps) {
  const options: Array<{ value: ViewMode; icon: ViewModeIcon; label: string }> = [
    { value: "list", icon: ListViewIcon, label: "List view" },
    { value: "grid", icon: GridIcon, label: "Grid view" },
  ];

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-subtle p-0.5">
      {options.map(({ value, icon: Icon, label }) => {
        const isActive = mode === value;
        return (
          <IconButton
            variant="ghost"
            size="base"
            icon={Icon}
            key={value}
            className={cn({ "bg-layer-1 text-primary": isActive })}
            aria-label={label}
            aria-pressed={isActive}
            onClick={() => onChange(value)}
          />
        );
      })}
    </div>
  );
}
