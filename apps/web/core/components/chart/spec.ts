/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Portable chart spec — the one JSON contract every chart surface shares.
 *
 * Atlas emits it inside ```chart fences in chat replies; later phases persist
 * the same shape on doc editor chart nodes and in sheet snapshots. Keep it
 * flat and forgiving: the producer is usually an LLM, so `parseChartSpec`
 * validates defensively (coerces numbers, caps sizes, drops bad colors)
 * instead of trusting the input.
 */

export const CHART_SPEC_TYPES = ["bar", "line", "area", "pie", "donut"] as const;
export type TChartSpecType = (typeof CHART_SPEC_TYPES)[number];

export type TChartSpecSeries = {
  name: string;
  values: number[];
  /** optional hex override; omit to use the app's themed palette */
  color?: string;
};

export type TChartSpecOptions = {
  stacked?: boolean;
  /** default: shown for pie/donut and multi-series charts */
  legend?: boolean;
  xLabel?: string;
  yLabel?: string;
};

export type TChartSpec = {
  version?: number;
  type: TChartSpecType;
  title?: string;
  /** category names — x-axis ticks, or slice names for pie/donut */
  labels: string[];
  /** 1..6 named value lists, each aligned to `labels`; pie/donut uses the first */
  series: TChartSpecSeries[];
  options?: TChartSpecOptions;
};

const MAX_LABELS = 48;
const MAX_SERIES = 6;
const MAX_TITLE_CHARS = 160;
const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

const asCleanString = (value: unknown, maxChars: number): string =>
  typeof value === "string" ? value.trim().slice(0, maxChars) : "";

/** Starter spec used by insertion affordances (e.g. the /chart slash command). */
export const DEFAULT_CHART_SPEC: TChartSpec = {
  version: 1,
  type: "bar",
  title: "New chart",
  labels: ["Jan", "Feb", "Mar", "Apr"],
  series: [{ name: "Series 1", values: [4, 7, 5, 9] }],
};

/**
 * Parse raw JSON (usually the body of a ```chart fence) into a safe,
 * render-ready spec. Returns null when the input isn't a usable chart —
 * callers decide whether that means "still streaming" or "bad output".
 */
export function parseChartSpec(raw: string): TChartSpec | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return coerceChartSpec(parsed);
}

/**
 * Same validation as `parseChartSpec`, for input that is already a decoded
 * value — e.g. the `chart` attribute of a doc editor node or a sheet
 * snapshot entry.
 */
export function coerceChartSpec(parsed: unknown): TChartSpec | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const input = parsed as Record<string, unknown>;

  const type = typeof input.type === "string" ? (input.type.trim().toLowerCase() as TChartSpecType) : null;
  if (!type || !CHART_SPEC_TYPES.includes(type)) return null;

  if (!Array.isArray(input.labels)) return null;
  const labels = input.labels
    .slice(0, MAX_LABELS)
    .map((label) => (typeof label === "string" ? label.trim() : String(label ?? "")))
    .map((label, index) => label || `Item ${index + 1}`);
  if (labels.length === 0) return null;

  if (!Array.isArray(input.series)) return null;
  const series: TChartSpecSeries[] = [];
  for (const rawSeries of input.series.slice(0, MAX_SERIES)) {
    if (!rawSeries || typeof rawSeries !== "object" || Array.isArray(rawSeries)) continue;
    const entry = rawSeries as Record<string, unknown>;
    const rawValues = entry.values;
    if (!Array.isArray(rawValues)) continue;
    // Align values to the label count: coerce to finite numbers, pad with 0.
    const values = labels.map((_, index) => {
      const value = Number(rawValues[index]);
      return Number.isFinite(value) ? value : 0;
    });
    const color =
      typeof entry.color === "string" && HEX_COLOR_RE.test(entry.color.trim()) ? entry.color.trim() : undefined;
    series.push({
      name: asCleanString(entry.name, 80) || `Series ${series.length + 1}`,
      values,
      ...(color ? { color } : {}),
    });
  }
  if (series.length === 0) return null;

  const rawOptions =
    input.options && typeof input.options === "object" && !Array.isArray(input.options)
      ? (input.options as Record<string, unknown>)
      : {};
  const options: TChartSpecOptions = {};
  if (typeof rawOptions.stacked === "boolean") options.stacked = rawOptions.stacked;
  if (typeof rawOptions.legend === "boolean") options.legend = rawOptions.legend;
  const xLabel = asCleanString(rawOptions.xLabel, 60);
  if (xLabel) options.xLabel = xLabel;
  const yLabel = asCleanString(rawOptions.yLabel, 60);
  if (yLabel) options.yLabel = yLabel;

  const title = asCleanString(input.title, MAX_TITLE_CHARS);

  return {
    version: 1,
    type,
    ...(title ? { title } : {}),
    labels,
    series,
    ...(Object.keys(options).length > 0 ? { options } : {}),
  };
}
