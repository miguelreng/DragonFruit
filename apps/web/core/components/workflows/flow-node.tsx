/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { cn } from "@plane/utils";

export type TFlowNodeKind = "trigger" | "condition" | "action";

type AccentConfig = {
  headerBg: string;
  headerText: string;
  ring: string;
  border: string;
};

// Per-kind accent (matches the reference: pink trigger, purple condition, blue action).
const ACCENTS: Record<TFlowNodeKind, AccentConfig> = {
  trigger: {
    headerBg: "bg-rose-500/10",
    headerText: "text-rose-600 dark:text-rose-400",
    ring: "ring-rose-400/70",
    border: "border-rose-300/70 dark:border-rose-500/40",
  },
  condition: {
    headerBg: "bg-purple-500/10",
    headerText: "text-purple-600 dark:text-purple-400",
    ring: "ring-purple-400/70",
    border: "border-purple-300/70 dark:border-purple-500/40",
  },
  action: {
    headerBg: "bg-blue-500/10",
    headerText: "text-blue-600 dark:text-blue-400",
    ring: "ring-blue-400/70",
    border: "border-blue-300/70 dark:border-blue-500/40",
  },
};

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
  const accent = ACCENTS[kind];
  return (
    <div
      className={cn(
        "w-[300px] overflow-hidden rounded-xl border bg-layer-1 shadow-sm",
        "transition-[box-shadow,border-color] duration-150 ease-out",
        selected ? cn("ring-2", accent.ring, accent.border) : "border-subtle",
        ghost && "border-dashed opacity-60"
      )}
    >
      {/* Colored kind header — the node's one icon lives here. */}
      <div className={cn("flex items-center gap-1.5 px-3 py-2", accent.headerBg, accent.headerText)}>
        <span className="grid size-4 place-items-center">{icon}</span>
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
