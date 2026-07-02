/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Notion-style per-column aggregations for the spreadsheet footer. Each column
// can pick an aggregation; the value is computed across the currently loaded
// rows. The chosen aggregation per column is persisted in localStorage.

import type { IIssueDisplayProperties, TIssue } from "@plane/types";

export type TAggregationType =
  | "none"
  | "count_all"
  | "count_filled"
  | "count_empty"
  | "count_unique"
  | "percent_filled"
  | "percent_empty"
  | "sum"
  | "average"
  | "median"
  | "min"
  | "max"
  | "range";

export const AGGREGATION_LABELS: Record<TAggregationType, string> = {
  none: "Calculate",
  count_all: "Count",
  count_filled: "Filled",
  count_empty: "Empty",
  count_unique: "Unique",
  percent_filled: "% filled",
  percent_empty: "% empty",
  sum: "Sum",
  average: "Average",
  median: "Median",
  min: "Min",
  max: "Max",
  range: "Range",
};

// Shared by every column.
const COMMON_AGGREGATIONS: TAggregationType[] = [
  "none",
  "count_all",
  "count_filled",
  "count_empty",
  "count_unique",
  "percent_filled",
  "percent_empty",
];

// Appended for columns backed by a real number.
const NUMERIC_AGGREGATIONS: TAggregationType[] = ["sum", "average", "median", "min", "max", "range"];

type TColumnKind = "categorical" | "array" | "date" | "numeric";

// Which TIssue field each spreadsheet column reads, and how to interpret it.
const COLUMN_VALUE: Partial<
  Record<keyof IIssueDisplayProperties, { kind: TColumnKind; get: (issue: TIssue) => unknown }>
> = {
  state: { kind: "categorical", get: (i) => i.state_id },
  priority: { kind: "categorical", get: (i) => (i.priority && i.priority !== "none" ? i.priority : null) },
  assignee: { kind: "array", get: (i) => i.assignee_ids },
  labels: { kind: "array", get: (i) => i.label_ids },
  modules: { kind: "array", get: (i) => i.module_ids },
  cycle: { kind: "categorical", get: (i) => i.cycle_id },
  estimate: { kind: "categorical", get: (i) => i.estimate_point },
  start_date: { kind: "date", get: (i) => i.start_date },
  due_date: { kind: "date", get: (i) => i.target_date },
  created_on: { kind: "date", get: (i) => i.created_at },
  updated_on: { kind: "date", get: (i) => i.updated_at },
  link: { kind: "numeric", get: (i) => i.link_count },
  attachment_count: { kind: "numeric", get: (i) => i.attachment_count },
  sub_issue_count: { kind: "numeric", get: (i) => i.sub_issues_count },
};

/** The aggregations offered for a given column (numeric columns get the math ones too). */
export function getAvailableAggregations(property: keyof IIssueDisplayProperties): TAggregationType[] {
  const config = COLUMN_VALUE[property];
  if (config?.kind === "numeric") return [...COMMON_AGGREGATIONS, ...NUMERIC_AGGREGATIONS];
  return COMMON_AGGREGATIONS;
}

type TCellInfo = { isEmpty: boolean; keys: string[]; num: number | null };

function getCellInfo(issue: TIssue, property: keyof IIssueDisplayProperties): TCellInfo {
  const config = COLUMN_VALUE[property];
  if (!config) return { isEmpty: true, keys: [], num: null };
  const raw = config.get(issue);
  switch (config.kind) {
    case "array": {
      const arr = Array.isArray(raw) ? (raw as string[]) : [];
      return { isEmpty: arr.length === 0, keys: arr, num: null };
    }
    case "numeric": {
      const num = typeof raw === "number" ? raw : null;
      return { isEmpty: num === null, keys: num === null ? [] : [String(num)], num };
    }
    case "categorical":
    case "date":
    default: {
      const val = raw == null || raw === "" ? null : String(raw);
      return { isEmpty: val === null, keys: val === null ? [] : [val], num: null };
    }
  }
}

function formatNumber(value: number): string {
  // Trim to at most 2 decimals, drop trailing zeros, group thousands.
  const rounded = Math.round(value * 100) / 100;
  return rounded.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/**
 * Compute one aggregation across the given issues for a column. Returns the
 * formatted display string, or "" when there's nothing to show.
 */
export function computeAggregation(
  issues: TIssue[],
  property: keyof IIssueDisplayProperties,
  aggregation: TAggregationType
): string {
  if (aggregation === "none") return "";
  const total = issues.length;
  if (total === 0) return "";

  const cells = issues.map((issue) => getCellInfo(issue, property));
  const filled = cells.filter((c) => !c.isEmpty).length;

  switch (aggregation) {
    case "count_all":
      return String(total);
    case "count_filled":
      return String(filled);
    case "count_empty":
      return String(total - filled);
    case "count_unique":
      return String(new Set(cells.flatMap((c) => c.keys)).size);
    case "percent_filled":
      return `${Math.round((filled / total) * 100)}%`;
    case "percent_empty":
      return `${Math.round(((total - filled) / total) * 100)}%`;
    default:
      break;
  }

  // Numeric aggregations.
  const nums = cells.map((c) => c.num).filter((n): n is number => n !== null);
  if (nums.length === 0) return "0";
  switch (aggregation) {
    case "sum":
      return formatNumber(nums.reduce((a, b) => a + b, 0));
    case "average":
      return formatNumber(nums.reduce((a, b) => a + b, 0) / nums.length);
    case "min":
      return formatNumber(Math.min(...nums));
    case "max":
      return formatNumber(Math.max(...nums));
    case "range":
      return formatNumber(Math.max(...nums) - Math.min(...nums));
    case "median": {
      // Sorting a freshly mapped copy — no external mutation.
      // oxlint-disable-next-line unicorn/no-array-sort
      const sorted = [...nums].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
      return formatNumber(median);
    }
    default:
      return "";
  }
}
