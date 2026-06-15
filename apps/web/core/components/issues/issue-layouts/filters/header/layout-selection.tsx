/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { ISSUE_LAYOUTS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import { EIssueLayoutTypes } from "@plane/types";
import { cn } from "@plane/utils";
// components
import { IssueLayoutIcon } from "@/components/issues/issue-layouts/layout-icon";
// hooks
import { usePlatformOS } from "@/hooks/use-platform-os";

type Props = {
  layouts: EIssueLayoutTypes[];
  onChange: (layout: EIssueLayoutTypes) => void;
  selectedLayout: EIssueLayoutTypes | undefined;
};

export function LayoutSelection(props: Props) {
  const { layouts, onChange, selectedLayout } = props;
  const { isMobile } = usePlatformOS();
  const { t } = useTranslation();
  const activeLayout = selectedLayout ?? layouts[0] ?? EIssueLayoutTypes.LIST;
  const handleOnChange = (layoutKey: EIssueLayoutTypes) => {
    if (activeLayout !== layoutKey) {
      onChange(layoutKey);
    }
  };

  return (
    <div className="flex items-center gap-1 rounded-lg bg-layer-3 p-1">
      {ISSUE_LAYOUTS.filter((l) => layouts.includes(l.key)).map((layout) => {
        const isActive = activeLayout === layout.key;

        return (
          <Tooltip key={layout.key} tooltipContent={t(layout.i18n_title)} isMobile={isMobile}>
            <button
              type="button"
              className={cn(
                "group grid h-5.5 w-7 place-items-center overflow-hidden rounded-lg transition-all hover:bg-layer-transparent-hover",
                {
                  "bg-surface-1 shadow-raised-100 ring-[0.5px] ring-subtle hover:bg-surface-1": isActive,
                }
              )}
              onClick={() => handleOnChange(layout.key)}
              aria-pressed={isActive}
            >
              <IssueLayoutIcon
                layout={layout.key}
                size={14}
                strokeWidth={2}
                className={cn("size-3.5", isActive ? "text-primary" : "text-secondary")}
              />
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
