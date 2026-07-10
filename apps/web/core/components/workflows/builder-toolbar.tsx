/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Button } from "@plane/propel/button";
import { ToggleSwitch } from "@plane/ui";
import { cn } from "@plane/utils";
import { Play, Trash } from "@/components/icons/lucide-shim";
import type { TWorkflowView } from "./types";

type Props = {
  currentId: string | null;
  enabled: boolean;
  dirty: boolean;
  saving: boolean;
  view: TWorkflowView;
  onChangeView: (view: TWorkflowView) => void;
  onToggleEnabled: (next: boolean) => void;
  onSave: () => void | Promise<void>;
  onDelete: () => void;
  onTest: () => void | Promise<void>;
};

const VIEWS: Array<{ key: TWorkflowView; label: string }> = [
  { key: "build", label: "Build" },
  { key: "activity", label: "Activity" },
];

export function BuilderToolbar({
  currentId,
  enabled,
  dirty,
  saving,
  view,
  onChangeView,
  onToggleEnabled,
  onSave,
  onDelete,
  onTest,
}: Props) {
  const isExisting = !!currentId;
  const testTitle = saving
    ? "Saving workflow..."
    : isExisting && !dirty
      ? "Run a test on one task"
      : "Save latest changes and run a test on one task";

  return (
    <div className="grid flex-shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b border-subtle bg-surface-1 px-4 py-2">
      <div />

      <div className="justify-self-center">
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

      <div className="flex shrink-0 items-center gap-2 justify-self-end">
        <Button
          type="button"
          variant="secondary"
          size="base"
          prependIcon={<Play />}
          onClick={() => void onTest()}
          disabled={saving}
          title={testTitle}
        >
          Test
        </Button>
        <span
          className={cn(
            "rounded-md px-2 py-0.5 text-11 font-medium",
            enabled
              ? "bg-green-500/10 text-green-600 dark:text-green-400"
              : "bg-amber-500/10 text-amber-600 dark:text-amber-500"
          )}
        >
          {enabled ? "Active" : "Draft"}
        </span>
        <ToggleSwitch value={enabled} onChange={onToggleEnabled} />
        {isExisting && (
          <button
            type="button"
            onClick={onDelete}
            className="text-red-600 hover:bg-red-500/10 grid size-7 flex-shrink-0 place-items-center rounded-md transition-colors"
            aria-label="Delete workflow"
            title="Delete"
          >
            <Trash className="size-4" />
          </button>
        )}
        <Button
          variant="primary"
          size="base"
          onClick={() => void onSave()}
          loading={saving}
          disabled={saving || (isExisting && !dirty)}
        >
          {saving ? "Saving..." : dirty || !isExisting ? "Save" : "Saved"}
        </Button>
      </div>
    </div>
  );
}
