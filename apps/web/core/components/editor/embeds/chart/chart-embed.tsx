/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { lazy, Suspense, useMemo, useState } from "react";
// components
import { coerceChartSpec, CHART_SPEC_TYPES, type TChartSpecType } from "@/components/chart/spec";
import { ChartNoAxesColumn, Pencil, Trash2, X } from "@/components/icons/lucide-shim";

// Charts pull in recharts — keep them out of the doc editor's initial chunk.
const LazyChartSpecView = lazy(() =>
  import("@/components/chart/spec-view").then((module) => ({ default: module.ChartSpecView }))
);

type Props = {
  chart: unknown;
  isEditable: boolean;
  updateChart: (chart: unknown) => void;
  deleteChart: () => void;
};

const TYPE_LABELS: Record<TChartSpecType, string> = {
  bar: "Bar",
  line: "Line",
  area: "Area",
  pie: "Pie",
  donut: "Donut",
};

/**
 * The chart block rendered inside doc pages. Read-only viewers get just the
 * chart; editors get a hover toolbar to switch the chart type, edit the
 * underlying spec JSON, or remove the block. All edits go through the node's
 * `chart` attribute, so collaboration and undo behave like any other content.
 */
export function DocChartEmbed(props: Props) {
  const { chart, isEditable, updateChart, deleteChart } = props;
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const spec = useMemo(() => coerceChartSpec(chart), [chart]);

  if (!spec) {
    return (
      <div
        className="my-2 flex h-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-strong bg-layer-1 text-tertiary"
        contentEditable={false}
      >
        <ChartNoAxesColumn className="size-5" />
        <span className="text-12">This chart's data is missing or invalid.</span>
        {isEditable && (
          <button
            type="button"
            className="text-11 text-secondary underline underline-offset-2 hover:text-primary"
            onClick={deleteChart}
          >
            Remove block
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="group relative my-2" contentEditable={false}>
      {isEditable && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-0.5 rounded-md border border-subtle bg-surface-1 p-0.5 opacity-0 shadow-raised-100 transition-opacity group-hover:opacity-100">
          {CHART_SPEC_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={`rounded px-1.5 py-0.5 text-11 transition-colors ${
                spec.type === type ? "bg-layer-2 font-medium text-primary" : "text-tertiary hover:text-primary"
              }`}
              onClick={() => updateChart({ ...spec, type })}
            >
              {TYPE_LABELS[type]}
            </button>
          ))}
          <span className="bg-strong mx-0.5 h-3.5 w-px" />
          <button
            type="button"
            title="Edit chart data"
            className="rounded p-1 text-tertiary transition-colors hover:text-primary"
            onClick={() => setIsEditorOpen((open) => !open)}
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            title="Delete chart"
            className="rounded p-1 text-tertiary transition-colors hover:text-danger-primary"
            onClick={deleteChart}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      )}
      <Suspense fallback={<div className="h-[280px] w-full animate-pulse rounded bg-layer-2" />}>
        <LazyChartSpecView spec={spec} height={280} />
      </Suspense>
      {isEditorOpen && (
        <ChartSpecJsonEditor
          initialValue={JSON.stringify(spec, null, 2)}
          onSave={(nextSpec) => {
            updateChart(nextSpec);
            setIsEditorOpen(false);
          }}
          onClose={() => setIsEditorOpen(false)}
        />
      )}
    </div>
  );
}

function ChartSpecJsonEditor(props: { initialValue: string; onSave: (spec: unknown) => void; onClose: () => void }) {
  const { initialValue, onSave, onClose } = props;
  const [value, setValue] = useState(initialValue);

  const parsed = useMemo(() => {
    try {
      return coerceChartSpec(JSON.parse(value));
    } catch {
      return null;
    }
  }, [value]);

  return (
    <div className="mt-2 rounded-md border border-subtle bg-surface-1 p-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-11 font-medium text-secondary">Chart data (JSON)</span>
        <button type="button" className="rounded p-0.5 text-tertiary hover:text-primary" onClick={onClose}>
          <X className="size-3.5" />
        </button>
      </div>
      <textarea
        className="font-mono h-40 w-full resize-y rounded border border-subtle bg-layer-1 p-2 text-11 text-primary outline-none focus:border-strong"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        spellCheck={false}
      />
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-11 text-tertiary">
          {parsed ? "Valid chart spec" : "Invalid — needs type, labels, and series"}
        </span>
        <button
          type="button"
          disabled={!parsed}
          className="rounded bg-accent-primary px-2 py-1 text-11 font-medium text-on-color transition-opacity disabled:opacity-40"
          onClick={() => parsed && onSave(parsed)}
        >
          Save
        </button>
      </div>
    </div>
  );
}
