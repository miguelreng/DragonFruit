/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// ui
import { Tooltip } from "@dragonfruit/propel/tooltip";
import type { IIssueLabel } from "@dragonfruit/types";
// types
import { usePlatformOS } from "@/hooks/use-platform-os";
// hooks

type IssueLabelsListProps = {
  labels?: (IIssueLabel | undefined)[];
  length?: number;
  showLength?: boolean;
};

const MAX_SWATCH_COUNT = 3;

type TLabelSwatch = Pick<IIssueLabel, "id" | "color">;

// Swatches for the compact trigger, capped at MAX_SWATCH_COUNT and kept in
// sync with the real label colors shown inside the dropdown.
export function getLabelSwatches(labels: (TLabelSwatch | undefined)[]): TLabelSwatch[] {
  return labels.filter((label): label is TLabelSwatch => !!label).slice(0, MAX_SWATCH_COUNT);
}

export function IssueLabelsList(props: IssueLabelsListProps) {
  const { labels } = props;
  const { isMobile } = usePlatformOS();
  return (
    <>
      {labels && (
        <>
          <Tooltip
            position="top"
            tooltipHeading="Labels"
            tooltipContent={labels.map((l) => l?.name).join(", ")}
            isMobile={isMobile}
          >
            <div className="flex h-full items-center gap-1 rounded-lg border-[0.5px] border-strong px-2 py-1 text-11 text-secondary">
              {labels.length === 1 ? (
                <span
                  className="h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: labels[0]?.color || undefined }}
                />
              ) : (
                <span className="flex flex-shrink-0 items-center">
                  {getLabelSwatches(labels).map((label, index) => (
                    <span
                      key={label.id}
                      className="ring-surface-1 h-2 w-2 rounded-full ring-1"
                      style={{ backgroundColor: label.color, marginLeft: index === 0 ? 0 : -4 }}
                    />
                  ))}
                </span>
              )}
              <span>{labels.length}</span>
              <span> Labels</span>
            </div>
          </Tooltip>
        </>
      )}
    </>
  );
}
