/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { cn } from "@plane/utils";
import type { TWorkflowNodeKind } from "@/services/workflow.service";
import { NODE_KIND_ACCENTS } from "./builder-helpers";

export type TFlowNodeKind = TWorkflowNodeKind;

type Props = {
  kind: TFlowNodeKind;
  /** The single glyph for this node, shown in the coloured header. */
  icon: ReactNode;
  kindLabel: string;
  title: string;
  subtitle: string;
  selected?: boolean;
  /** Renders a faded "not configured" style — used for the visual-frame fallback branch. */
  ghost?: boolean;
  showDataChip?: boolean;
};

/** Presentational node card. Selection + dragging are owned by the canvas wrapper. */
export function FlowNode({ kind, icon, kindLabel, title, subtitle, selected, ghost, showDataChip = true }: Props) {
  const accent = NODE_KIND_ACCENTS[kind];
  return (
    <div
      className={cn(
        "shadow-sm w-[300px] overflow-hidden rounded-xl border bg-layer-1",
        "transition-[box-shadow,border-color] duration-150 ease-out",
        selected ? cn("ring-2", accent.ring, accent.border) : "border-subtle",
        ghost && "border-dashed opacity-60"
      )}
    >
      {/* Colored kind header — the node's one icon lives here. */}
      <div className={cn("flex items-center gap-2 px-3 py-2", accent.headerBg, accent.headerText)}>
        <span
          className="shadow-sm grid size-6 place-items-center rounded-md"
          style={{ backgroundColor: accent.iconBg, color: accent.iconText, boxShadow: `0 0 0 1px ${accent.iconRing}` }}
        >
          {icon}
        </span>
        <span className="text-12 font-semibold">{kindLabel}</span>
      </div>
      {/* Body — text only, no second icon. */}
      <div className="px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-13 font-medium text-primary">{title}</span>
          {showDataChip && (
            <span className="shrink-0 rounded-md bg-layer-3 px-1.5 py-0.5 text-10 font-medium text-tertiary">Data</span>
          )}
        </div>
        <p className="mt-1.5 truncate text-12 text-tertiary">{subtitle}</p>
      </div>
    </div>
  );
}
