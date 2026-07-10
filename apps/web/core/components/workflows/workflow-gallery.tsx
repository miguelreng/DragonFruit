/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Routing } from "@solar-icons/react/ssr";
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import { ToggleSwitch } from "@plane/ui";
import type { TWorkflow } from "@/services/workflow.service";
import { EmptyStateIcon } from "@/components/empty-state/empty-state-icon";
import { workflowSummary } from "./builder-helpers";

type Props = {
  workflows: TWorkflow[];
  loading: boolean;
  onOpen: (id: string) => void;
  onToggle: (id: string, next: boolean) => void;
};

/**
 * The workflows index — mirrors the docs grid: same scroller (scroll-shadow,
 * gutter-stable), same rounded-2xl tile cards, same empty-state convention
 * (the create CTA lives in the AppHeader, not in the grid).
 */
export function WorkflowGallery({ workflows, loading, onOpen, onToggle }: Props) {
  if (!loading && workflows.length === 0) {
    return (
      <EmptyStateDetailed
        asset={<EmptyStateIcon name="workflows" />}
        title="No workflows yet"
        description="Automate your workspace — run Atlas or actions when tasks are created, assigned, or commented on."
      />
    );
  }

  return (
    <div className="dragonfruit-gallery-container scroll-shadow vertical-scrollbar scrollbar-lg h-full w-full overflow-y-auto px-1 pb-5 [scrollbar-gutter:stable_both-edges]">
      <div className="dragonfruit-card-grid">
        {loading && workflows.length === 0
          ? [0, 1, 2].map((i) => <div key={i} className="h-[156px] animate-pulse rounded-2xl bg-layer-1" />)
          : workflows.map((w) => <WorkflowCard key={w.id} workflow={w} onOpen={onOpen} onToggle={onToggle} />)}
      </div>
    </div>
  );
}

function WorkflowCard({
  workflow: w,
  onOpen,
  onToggle,
}: {
  workflow: TWorkflow;
  onOpen: (id: string) => void;
  onToggle: (id: string, next: boolean) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(w.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(w.id);
        }
      }}
      className="focus-visible:ring-accent-primary/40 block cursor-pointer rounded-lg focus:outline-none focus-visible:ring-2"
    >
      <div className="group t-press relative flex h-[156px] flex-col justify-between rounded-2xl bg-layer-1 p-4 transition-colors hover:bg-layer-3">
        <div
          className="absolute top-3 right-3 z-10"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          role="presentation"
        >
          <ToggleSwitch value={w.is_enabled} onChange={() => onToggle(w.id, !w.is_enabled)} />
        </div>
        <span className="grid size-9 place-items-center rounded-[10px] bg-accent-primary/10 text-accent-primary">
          <Routing weight="Bold" className="size-5" />
        </span>
        <div className="flex flex-col gap-0.5">
          <h3 className="line-clamp-2 text-13 leading-snug font-semibold text-secondary transition-colors group-hover:text-primary">
            {w.name || "Untitled workflow"}
          </h3>
          <p className="truncate text-11 text-placeholder">{workflowSummary(w)}</p>
        </div>
      </div>
    </div>
  );
}
