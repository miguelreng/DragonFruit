/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { ContentWrapper, ToggleSwitch } from "@plane/ui";
import { cn } from "@plane/utils";
import type { TWorkflow } from "@/services/workflow.service";
import { Routing } from "@solar-icons/react/ssr";
import { Plus } from "@/components/icons/lucide-shim";
import { workflowSummary } from "./builder-helpers";

type Props = {
  workflows: TWorkflow[];
  loading: boolean;
  onOpen: (id: string) => void;
  onNew: () => void;
  onToggle: (id: string, next: boolean) => void;
};

// Matches the app's index-card language (cf. project cards): bg-layer-2, subtle
// border → strong on hover, medium radius, raised shadow on hover.
const CARD = "rounded-lg border border-subtle bg-layer-2 transition-all duration-200 hover:border-strong hover:shadow-raised-200";

export function WorkflowGallery({ workflows, loading, onOpen, onNew, onToggle }: Props) {
  return (
    <ContentWrapper>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {/* New workflow */}
        <button
          type="button"
          onClick={onNew}
          className="flex h-32 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-subtle text-tertiary transition-colors hover:border-strong hover:text-secondary"
        >
          <Plus className="size-5" />
          <span className="text-13 font-medium">New workflow</span>
        </button>

        {loading && workflows.length === 0
          ? [0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-lg border border-subtle bg-layer-2" />)
          : workflows.map((w) => (
              <div
                key={w.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpen(w.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen(w.id);
                  }
                }}
                className={cn("group flex h-32 cursor-pointer flex-col justify-between p-4 text-left", CARD)}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-layer-1 text-tertiary">
                    <Routing className="size-4" />
                  </span>
                  <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="presentation">
                    <ToggleSwitch value={w.is_enabled} onChange={() => onToggle(w.id, !w.is_enabled)} />
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-13 font-medium text-primary">{w.name || "Untitled workflow"}</p>
                  <p className="mt-0.5 truncate text-12 text-tertiary">{workflowSummary(w)}</p>
                </div>
              </div>
            ))}
      </div>
    </ContentWrapper>
  );
}
