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

/** One grid ("tab") within a spreadsheet document. */
export type TSheetGrid = {
  id: string;
  name: string;
  rows: number;
  cols: number;
  /** raw cell contents keyed by cell id ("A1"); empty cells are omitted */
  cells: Record<string, string>;
  /** per-cell display formatting keyed by cell id; empty formats are omitted */
  formats?: Record<string, TCellFormat>;
  /** per-column pixel widths keyed by 0-based column index; defaults otherwise */
  colWidths?: Record<number, number>;
  /** number of leading columns kept frozen (sticky) during horizontal scroll */
  frozenCols?: number;
};

/** A spreadsheet document holds one or more grids and tracks the active one. */
export type TSheetSnapshot = {
  sheets: TSheetGrid[];
  activeId: string;
};

export type TCellNumberFormat =
  | "automatic"
  | "plain"
  | "plain_text"
  | "number"
  | "percent"
  | "scientific"
  | "accounting"
  | "financial"
  | "currency"
  | "currency_rounded"
  | "euro";

/** Number-format options for the "123" toolbar menu, grouped like a spreadsheet's. */
export const NUMBER_FORMAT_GROUPS: { key: TCellNumberFormat; label: string; sample: string }[][] = [
  [
    { key: "automatic", label: "Automatic", sample: "" },
    { key: "plain_text", label: "Plain text", sample: "" },
  ],
  [
    { key: "number", label: "Number", sample: "1,000.12" },
    { key: "percent", label: "Percent", sample: "10.12%" },
    { key: "scientific", label: "Scientific", sample: "1.01E+03" },
  ],
  [
    { key: "accounting", label: "Accounting", sample: "$ (1,000.12)" },
    { key: "financial", label: "Financial", sample: "(1,000.12)" },
    { key: "currency", label: "Currency", sample: "$1,000.12" },
    { key: "currency_rounded", label: "Currency rounded", sample: "$1,000" },
  ],
  [{ key: "euro", label: "Euro", sample: "€1,000.12" }],
];

export type TCellFormat = {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  /** text color, hex */
  color?: string;
  /** background fill, hex */
  fill?: string;
  align?: "left" | "center" | "right";
  /** text overflow behaviour; "overflow" (default) clips to a single line */
  wrap?: "overflow" | "wrap" | "clip";
  numberFormat?: TCellNumberFormat;
  /** fixed decimal places for numeric formats */
  decimals?: number;
};

export const SHEET_DEFAULT_ROWS = 20;
export const SHEET_DEFAULT_COLS = 8;
export const SHEET_MAX_ROWS = 500;
export const SHEET_MAX_COLS = 52;
export const SHEET_ROW_HEIGHT = 28;
export const SHEET_ROWNUM_WIDTH = 48;
export const SHEET_DEFAULT_COL_WIDTH = 96;
export const SHEET_MIN_COL_WIDTH = 48;
export const SHEET_MAX_COL_WIDTH = 600;

/** A fresh, empty grid. Caller supplies a unique id + display name. */
export const createGrid = (id: string, name: string): TSheetGrid => ({
  id,
  name,
  rows: SHEET_DEFAULT_ROWS,
  cols: SHEET_DEFAULT_COLS,
  cells: {},
});

/** Resolve a column's width, falling back to the default. */
export const colWidth = (grid: TSheetGrid, col: number): number =>
  grid.colWidths?.[col] ?? SHEET_DEFAULT_COL_WIDTH;

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

/** "B3" → { row: 2, col: 1 }. Returns null for non-cell strings. */
export const parseCellId = (id: string): { row: number; col: number } | null => {
  const m = /^([A-Z]+)(\d+)$/.exec(id);
  if (!m) return null;
  return { col: columnIndex(m[1]), row: parseInt(m[2], 10) - 1 };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Parse one grid object (from either the new or legacy stored shape). */
const parseGrid = (raw: Record<string, unknown>, id: string, name: string): TSheetGrid => {
  const rows = typeof raw.rows === "number" ? raw.rows : SHEET_DEFAULT_ROWS;
  const cols = typeof raw.cols === "number" ? raw.cols : SHEET_DEFAULT_COLS;
  const cells: Record<string, string> = {};
  if (isRecord(raw.cells)) {
    for (const [key, value] of Object.entries(raw.cells)) {
      if (typeof value === "string" && value !== "") cells[key] = value;
    }
  }
  const formats: Record<string, TCellFormat> = {};
  if (isRecord(raw.formats)) {
    for (const [key, value] of Object.entries(raw.formats)) {
      if (isRecord(value)) formats[key] = value as TCellFormat;
    }
  }
  const colWidths: Record<number, number> = {};
  if (isRecord(raw.colWidths)) {
    for (const [key, value] of Object.entries(raw.colWidths)) {
      const idx = Number(key);
      if (Number.isInteger(idx) && typeof value === "number") {
        colWidths[idx] = Math.min(Math.max(value, SHEET_MIN_COL_WIDTH), SHEET_MAX_COL_WIDTH);
      }
    }
  }
  const boundedCols = Math.min(Math.max(cols, 1), SHEET_MAX_COLS);
  const frozenCols =
    typeof raw.frozenCols === "number" ? Math.min(Math.max(Math.floor(raw.frozenCols), 0), boundedCols) : 0;
  return {
    id,
    name,
    rows: Math.min(Math.max(rows, 1), SHEET_MAX_ROWS),
    cols: boundedCols,
    cells,
    formats,
    colWidths,
    frozenCols,
  };
};

export const getInitialSnapshot = (descriptionJson: unknown): TSheetSnapshot => {
  const fallback = (): TSheetSnapshot => {
    const grid = createGrid("sheet-1", "Sheet 1");
    return { sheets: [grid], activeId: grid.id };
  };
  if (!isRecord(descriptionJson) || !isRecord(descriptionJson.sheet_snapshot)) return fallback();

  const snapshot = descriptionJson.sheet_snapshot as Record<string, unknown>;

  // New multi-sheet shape.
  if (Array.isArray(snapshot.sheets) && snapshot.sheets.length > 0) {
    const sheets = snapshot.sheets
      .filter(isRecord)
      .map((raw, i) => {
        const id = typeof raw.id === "string" && raw.id ? raw.id : `sheet-${i + 1}`;
        const name = typeof raw.name === "string" && raw.name ? raw.name : `Sheet ${i + 1}`;
        return parseGrid(raw, id, name);
      });
    const activeId =
      typeof snapshot.activeId === "string" && sheets.some((s) => s.id === snapshot.activeId)
        ? snapshot.activeId
        : sheets[0].id;
    return { sheets, activeId };
  }

  // Legacy single-grid shape ({ rows, cols, cells, formats }) → wrap in one sheet.
  const grid = parseGrid(snapshot, "sheet-1", "Sheet 1");
  return { sheets: [grid], activeId: grid.id };
};

/** Whether a cell format carries any visible styling (used to prune empties). */
export const isEmptyFormat = (f: TCellFormat | undefined): boolean =>
  !f ||
  (!f.bold &&
    !f.italic &&
    !f.strike &&
    !f.color &&
    !f.fill &&
    (!f.align || f.align === "left") &&
    (!f.wrap || f.wrap === "overflow") &&
    (!f.numberFormat || f.numberFormat === "plain") &&
    f.decimals === undefined);

/**
 * Apply a cell's number format to its already-computed value. Non-numeric
 * values (text, "#ERROR", empty) pass through unchanged.
 */
const groupNumber = (n: number, decimals: number): string =>
  n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export const formatDisplayValue = (value: string, format: TCellFormat | undefined): string => {
  const nf = format?.numberFormat;
  // "Plain text" never coerces; automatic/plain just honor an explicit decimal count.
  if (!format || !nf || nf === "plain" || nf === "automatic" || nf === "plain_text") {
    if (nf !== "plain_text" && format?.decimals !== undefined && value !== "") {
      const n = Number(value);
      if (Number.isFinite(n)) return n.toFixed(format.decimals);
    }
    return value;
  }
  if (value === "") return value;
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  const d = format.decimals;
  switch (nf) {
    case "number":
      return groupNumber(n, d ?? 2);
    case "percent":
      return `${(n * 100).toFixed(d ?? 0)}%`;
    case "scientific":
      return n
        .toExponential(d ?? 2)
        .replace(/e([+-])(\d)$/i, (_m, sign, dig) => `E${sign}0${dig}`)
        .replace(/e/i, "E");
    case "currency":
      return `$${groupNumber(n, d ?? 2)}`;
    case "currency_rounded":
      return `$${groupNumber(n, d ?? 0)}`;
    case "euro":
      return `€${groupNumber(n, d ?? 2)}`;
    case "accounting":
      return n < 0 ? `$(${groupNumber(-n, d ?? 2)})` : `$${groupNumber(n, d ?? 2)}`;
    case "financial":
      return n < 0 ? `(${groupNumber(-n, d ?? 2)})` : groupNumber(n, d ?? 2);
    default:
      return value;
  }
};

// ---------------------------------------------------------------------------
// Structural grid operations (insert / delete / clear column & row, fill).
// These remap cell ids by position. Formula *text* is not rewritten, so a
// formula referencing a shifted cell keeps its original reference.
// ---------------------------------------------------------------------------

type CellMap<T> = Record<string, T>;

const remapByPosition = <T>(map: CellMap<T> | undefined, move: (p: { row: number; col: number }) => { row: number; col: number } | null): CellMap<T> => {
  const out: CellMap<T> = {};
  for (const [id, value] of Object.entries(map ?? {})) {
    const p = parseCellId(id);
    if (!p) continue;
    const next = move(p);
    if (next && next.col >= 0 && next.col < SHEET_MAX_COLS && next.row >= 0 && next.row < SHEET_MAX_ROWS) {
      out[cellId(next.row, next.col)] = value;
    }
  }
  return out;
};

const remapColWidths = (widths: Record<number, number> | undefined, move: (c: number) => number | null): Record<number, number> => {
  const out: Record<number, number> = {};
  for (const [key, value] of Object.entries(widths ?? {})) {
    const c = move(Number(key));
    if (c !== null && c >= 0) out[c] = value;
  }
  return out;
};

export const insertColumn = (grid: TSheetGrid, at: number): TSheetGrid => ({
  ...grid,
  cols: Math.min(grid.cols + 1, SHEET_MAX_COLS),
  cells: remapByPosition(grid.cells, (p) => ({ row: p.row, col: p.col >= at ? p.col + 1 : p.col })),
  formats: remapByPosition(grid.formats, (p) => ({ row: p.row, col: p.col >= at ? p.col + 1 : p.col })),
  colWidths: remapColWidths(grid.colWidths, (c) => (c >= at ? c + 1 : c)),
});

export const deleteColumn = (grid: TSheetGrid, at: number): TSheetGrid => ({
  ...grid,
  cols: Math.max(grid.cols - 1, 1),
  cells: remapByPosition(grid.cells, (p) => (p.col === at ? null : { row: p.row, col: p.col > at ? p.col - 1 : p.col })),
  formats: remapByPosition(grid.formats, (p) => (p.col === at ? null : { row: p.row, col: p.col > at ? p.col - 1 : p.col })),
  colWidths: remapColWidths(grid.colWidths, (c) => (c === at ? null : c > at ? c - 1 : c)),
});

export const clearColumn = (grid: TSheetGrid, at: number): TSheetGrid => ({
  ...grid,
  cells: remapByPosition(grid.cells, (p) => (p.col === at ? null : p)),
  formats: remapByPosition(grid.formats, (p) => (p.col === at ? null : p)),
});

export const insertRow = (grid: TSheetGrid, at: number): TSheetGrid => ({
  ...grid,
  rows: Math.min(grid.rows + 1, SHEET_MAX_ROWS),
  cells: remapByPosition(grid.cells, (p) => ({ row: p.row >= at ? p.row + 1 : p.row, col: p.col })),
  formats: remapByPosition(grid.formats, (p) => ({ row: p.row >= at ? p.row + 1 : p.row, col: p.col })),
});

export const deleteRow = (grid: TSheetGrid, at: number): TSheetGrid => ({
  ...grid,
  rows: Math.max(grid.rows - 1, 1),
  cells: remapByPosition(grid.cells, (p) => (p.row === at ? null : { row: p.row > at ? p.row - 1 : p.row, col: p.col })),
  formats: remapByPosition(grid.formats, (p) => (p.row === at ? null : { row: p.row > at ? p.row - 1 : p.row, col: p.col })),
});

export const clearRow = (grid: TSheetGrid, at: number): TSheetGrid => ({
  ...grid,
  cells: remapByPosition(grid.cells, (p) => (p.row === at ? null : p)),
  formats: remapByPosition(grid.formats, (p) => (p.row === at ? null : p)),
});

/** Copy a source cell's value + format into every cell of a rectangular range. */
export const fillRange = (
  grid: TSheetGrid,
  srcId: string,
  r1: number,
  c1: number,
  r2: number,
  c2: number
): TSheetGrid => {
  const src = grid.cells[srcId];
  const srcFmt = grid.formats?.[srcId];
  const cells = { ...grid.cells };
  const formats = { ...(grid.formats ?? {}) };
  for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
    for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
      const id = cellId(r, c);
      if (id === srcId) continue;
      if (src === undefined || src === "") delete cells[id];
      else cells[id] = src;
      if (srcFmt) formats[id] = { ...srcFmt };
      else delete formats[id];
    }
  }
  return {
    ...grid,
    cells,
    formats,
    rows: Math.min(Math.max(grid.rows, Math.max(r1, r2) + 1), SHEET_MAX_ROWS),
    cols: Math.min(Math.max(grid.cols, Math.max(c1, c2) + 1), SHEET_MAX_COLS),
  };
};

/** Serialize a rectangular range to TSV (tab-separated, newline rows). */
export const rangeToTSV = (grid: TSheetGrid, r1: number, c1: number, r2: number, c2: number): string => {
  const lines: string[] = [];
  for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
    const cells: string[] = [];
    for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) cells.push(grid.cells[cellId(r, c)] ?? "");
    lines.push(cells.join("\t"));
  }
  return lines.join("\n");
};

/** Parse clipboard text (TSV) into a matrix of cell strings. */
export const parseClipboard = (text: string): string[][] =>
  text
    .replace(/\r\n?/g, "\n")
    .replace(/\n$/, "")
    .split("\n")
    .map((line) => line.split("\t"));

/** Write a matrix of values into the grid starting at (r0, c0), growing as needed. */
export const writeMatrix = (grid: TSheetGrid, r0: number, c0: number, matrix: string[][]): TSheetGrid => {
  const cells = { ...grid.cells };
  let maxR = grid.rows;
  let maxC = grid.cols;
  matrix.forEach((row, dr) => {
    row.forEach((val, dc) => {
      const r = r0 + dr;
      const c = c0 + dc;
      if (r >= SHEET_MAX_ROWS || c >= SHEET_MAX_COLS) return;
      const id = cellId(r, c);
      if (val === "") delete cells[id];
      else cells[id] = val;
      maxR = Math.max(maxR, r + 1);
      maxC = Math.max(maxC, c + 1);
    });
  });
  return { ...grid, cells, rows: Math.min(maxR, SHEET_MAX_ROWS), cols: Math.min(maxC, SHEET_MAX_COLS) };
};

/** Clear values + formats in a rectangular range. */
export const clearRect = (grid: TSheetGrid, r1: number, c1: number, r2: number, c2: number): TSheetGrid => {
  const cells = { ...grid.cells };
  const formats = { ...(grid.formats ?? {}) };
  for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
    for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
      const id = cellId(r, c);
      delete cells[id];
      delete formats[id];
    }
  }
  return { ...grid, cells, formats };
};

/** Functions the formula engine understands — offered as autocomplete. */
export const SHEET_FUNCTIONS = ["SUM", "AVERAGE", "MIN", "MAX", "COUNT", "PRODUCT"] as const;

/** Function-name suggestions for the identifier currently being typed. */
export const formulaSuggestions = (raw: string): string[] => {
  if (!raw.startsWith("=")) return [];
  const m = /([A-Za-z]+)$/.exec(raw);
  if (!m) return [];
  const prefix = m[1].toUpperCase();
  return SHEET_FUNCTIONS.filter((f) => f.startsWith(prefix));
};

/** Replace the trailing identifier with the chosen function + "(". */
export const applySuggestion = (raw: string, fn: string): string => {
  const m = /([A-Za-z]+)$/.exec(raw);
  const base = m ? raw.slice(0, raw.length - m[1].length) : raw;
  return `${base}${fn}(`;
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
