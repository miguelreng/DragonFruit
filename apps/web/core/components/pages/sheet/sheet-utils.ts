/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Minimal, dependency-free spreadsheet model + formula engine.
 *
 * A sheet is a flat map of cell id ("A1", "B2") → raw string. A raw value
 * starting with "=" is a formula; everything else is a literal. Formulas
 * support cell references, arithmetic (+ - * / and parens), and the aggregate
 * functions SUM / AVERAGE / MIN / MAX / COUNT / PRODUCT over ranges or
 * comma-separated arguments. The grid data persists to a page's
 * description_json under `sheet_snapshot`.
 */

export type TSheetSnapshot = {
  rows: number;
  cols: number;
  /** raw cell contents keyed by cell id ("A1"); empty cells are omitted */
  cells: Record<string, string>;
};

export const SHEET_DEFAULT_ROWS = 20;
export const SHEET_DEFAULT_COLS = 8;
export const SHEET_MAX_ROWS = 500;
export const SHEET_MAX_COLS = 52;

/** 0 → "A", 25 → "Z", 26 → "AA". */
export const columnLabel = (index: number): string => {
  let label = "";
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
};

/** "A" → 0, "Z" → 25, "AA" → 26. Returns -1 for invalid input. */
export const columnIndex = (label: string): number => {
  if (!/^[A-Z]+$/.test(label)) return -1;
  let index = 0;
  for (const char of label) index = index * 26 + (char.charCodeAt(0) - 64);
  return index - 1;
};

export const cellId = (row: number, col: number): string => `${columnLabel(col)}${row + 1}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const getInitialSnapshot = (descriptionJson: unknown): TSheetSnapshot => {
  const fallback: TSheetSnapshot = {
    rows: SHEET_DEFAULT_ROWS,
    cols: SHEET_DEFAULT_COLS,
    cells: {},
  };
  if (!isRecord(descriptionJson) || !isRecord(descriptionJson.sheet_snapshot)) return fallback;

  const snapshot = descriptionJson.sheet_snapshot as Partial<TSheetSnapshot>;
  const rows = typeof snapshot.rows === "number" ? snapshot.rows : fallback.rows;
  const cols = typeof snapshot.cols === "number" ? snapshot.cols : fallback.cols;
  const cells: Record<string, string> = {};
  if (isRecord(snapshot.cells)) {
    for (const [key, value] of Object.entries(snapshot.cells)) {
      if (typeof value === "string" && value !== "") cells[key] = value;
    }
  }
  return {
    rows: Math.min(Math.max(rows, 1), SHEET_MAX_ROWS),
    cols: Math.min(Math.max(cols, 1), SHEET_MAX_COLS),
    cells,
  };
};

const AGGREGATES: Record<string, (values: number[]) => number> = {
  SUM: (v) => v.reduce((a, b) => a + b, 0),
  PRODUCT: (v) => v.reduce((a, b) => a * b, 1),
  AVERAGE: (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0),
  AVG: (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0),
  MIN: (v) => (v.length ? Math.min(...v) : 0),
  MAX: (v) => (v.length ? Math.max(...v) : 0),
  COUNT: (v) => v.length,
};

/** Expand "A1:B3" into the list of cell ids it covers. */
const expandRange = (range: string): string[] => {
  const [start, end] = range.split(":");
  const startMatch = /^([A-Z]+)(\d+)$/.exec(start.trim());
  const endMatch = /^([A-Z]+)(\d+)$/.exec(end.trim());
  if (!startMatch || !endMatch) return [];
  const c1 = columnIndex(startMatch[1]);
  const c2 = columnIndex(endMatch[1]);
  const r1 = parseInt(startMatch[2], 10) - 1;
  const r2 = parseInt(endMatch[2], 10) - 1;
  const ids: string[] = [];
  for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
    for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
      ids.push(cellId(r, c));
    }
  }
  return ids;
};

/**
 * Compute the displayed value of a cell. Literals are returned as-is; formulas
 * are evaluated. `visiting` guards against circular references.
 */
export const computeCell = (id: string, cells: Record<string, string>, visiting: Set<string> = new Set()): string => {
  const raw = cells[id] ?? "";
  if (!raw.startsWith("=")) return raw;
  if (visiting.has(id)) return "#CYCLE";

  const next = new Set(visiting).add(id);
  const result = evaluateFormula(raw.slice(1), cells, next);
  return result;
};

const cellNumber = (id: string, cells: Record<string, string>, visiting: Set<string>): number => {
  const value = computeCell(id, cells, visiting);
  const num = parseFloat(value);
  return Number.isFinite(num) ? num : 0;
};

const evaluateFormula = (expr: string, cells: Record<string, string>, visiting: Set<string>): string => {
  try {
    let working = expr;

    // Resolve aggregate function calls (non-nested) repeatedly.
    const fnPattern = /\b(SUM|PRODUCT|AVERAGE|AVG|MIN|MAX|COUNT)\(([^()]*)\)/i;
    let guard = 0;
    while (fnPattern.test(working) && guard < 100) {
      guard += 1;
      working = working.replace(fnPattern, (_full, name: string, args: string) => {
        const fn = AGGREGATES[name.toUpperCase()];
        const values: number[] = [];
        for (const part of args.split(",")) {
          const token = part.trim();
          if (!token) continue;
          if (token.includes(":")) {
            for (const rangeId of expandRange(token)) values.push(cellNumber(rangeId, cells, visiting));
          } else if (/^[A-Z]+\d+$/.test(token)) {
            values.push(cellNumber(token, cells, visiting));
          } else {
            const num = parseFloat(token);
            if (Number.isFinite(num)) values.push(num);
          }
        }
        return String(fn(values));
      });
    }

    // Resolve bare cell references.
    working = working.replace(/\b([A-Z]+)(\d+)\b/g, (_full, col: string, row: string) =>
      String(cellNumber(`${col}${row}`, cells, visiting))
    );

    // Only pure arithmetic should remain.
    if (!/^[\d\s.+\-*/()eE]*$/.test(working)) return "#ERROR";
    if (working.trim() === "") return "";

    // eslint-disable-next-line no-new-func
    const value = Function(`"use strict"; return (${working});`)();
    if (typeof value !== "number" || !Number.isFinite(value)) return "#ERROR";
    // Trim floating-point noise.
    return String(Math.round(value * 1e10) / 1e10);
  } catch {
    return "#ERROR";
  }
};
