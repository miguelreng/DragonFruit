/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Button } from "@plane/propel/button";
import { ToggleSwitch } from "@plane/ui";
import { cn } from "@plane/utils";
import { ArrowLeft, Trash } from "@/components/icons/lucide-shim";
import type { TWorkflowView } from "./types";

type Props = {
  currentId: string | null;
  name: string;
  enabled: boolean;
  dirty: boolean;
  saving: boolean;
  view: TWorkflowView;
  onBack: () => void;
  onChangeView: (view: TWorkflowView) => void;
  onChangeName: (name: string) => void;
  onToggleEnabled: (next: boolean) => void;
  onSave: () => void;
  onDelete: () => void;
  onTest: () => void;
};

const VIEWS: Array<{ key: TWorkflowView; label: string }> = [
  { key: "build", label: "Build" },
  { key: "activity", label: "Activity" },
];

export function BuilderToolbar({
  currentId,
  name,
  enabled,
  dirty,
  saving,
  view,
  onBack,
  onChangeView,
  onChangeName,
  onToggleEnabled,
  onSave,
  onDelete,
  onTest,
}: Props) {
  const isExisting = !!currentId;

  return (
    <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-subtle bg-surface-1 px-4 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-12 font-medium text-tertiary transition-colors hover:bg-layer-1 hover:text-primary"
        >
          <ArrowLeft className="size-4" />
          Workflows
        </button>
        <span className="mx-1 h-5 w-px flex-shrink-0 bg-subtle" />
        <input
          value={name}
          onChange={(e) => onChangeName(e.target.value)}
          placeholder="Untitled workflow"
          className="min-w-0 max-w-[260px] rounded-md border-[0.5px] border-transparent bg-transparent px-2 py-1 text-14 font-semibold text-primary placeholder:text-placeholder hover:border-subtle focus:border-subtle focus:bg-layer-1 focus:outline-none"
        />
        <div className="flex items-center gap-0.5 rounded-lg border border-subtle p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => onChangeView(v.key)}
              className={cn(
                "rounded-md px-2.5 py-1 text-12 font-medium transition-colors",
                view === v.key ? "bg-layer-1 text-primary" : "text-tertiary hover:text-primary"
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span
          className={cn(
            "rounded-md px-2 py-0.5 text-11 font-medium",
            enabled ? "bg-green-500/10 text-green-600 dark:text-green-400" : "bg-amber-500/10 text-amber-600 dark:text-amber-500"
          )}
        >
          {enabled ? "Active" : "Draft"}
        </span>
        <ToggleSwitch value={enabled} onChange={onToggleEnabled} />
        {isExisting && (
          <>
            <button
              type="button"
              onClick={onTest}
              className="rounded-md px-2 py-1 text-12 font-medium text-tertiary transition-colors hover:bg-layer-1 hover:text-primary"
              title="Run a test on one task"
            >
              Test
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="grid size-7 flex-shrink-0 place-items-center rounded-md text-red-600 transition-colors hover:bg-red-500/10"
              aria-label="Delete workflow"
              title="Delete"
            >
              <Trash className="size-4" />
            </button>
          </>
        )}
        <Button variant="primary" size="base" onClick={onSave} loading={saving} disabled={saving || (isExisting && !dirty)}>
          {saving ? "Saving..." : dirty || !isExisting ? "Save" : "Saved"}
        </Button>
      </div>
    </div>
  );
}
