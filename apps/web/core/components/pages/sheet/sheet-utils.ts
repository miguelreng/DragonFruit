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
  /** optional tab accent color (hex); shown as a strip under the tab label */
  color?: string;
  /** raw cell contents keyed by cell id ("A1"); empty cells are omitted */
  cells: Record<string, string>;
  /** per-cell display formatting keyed by cell id; empty formats are omitted */
  formats?: Record<string, TCellFormat>;
  /** per-column pixel widths keyed by 0-based column index; defaults otherwise */
  colWidths?: Record<number, number>;
  /** number of leading columns kept frozen (sticky) during horizontal scroll */
  frozenCols?: number;
  /** when true, column filters are active and header funnels are shown */
  filterEnabled?: boolean;
  /** per-column filters keyed by 0-based column index */
  filters?: Record<number, TColumnFilter>;
  /** per-column dropdown/"pill" config keyed by 0-based column index */
  selects?: Record<number, TColumnSelect>;
};

/** A column filter: hide specific displayed values and/or a "contains" query. */
export type TColumnFilter = {
  hidden?: string[];
  query?: string;
};

/** A dropdown option shown as a colored pill. */
export type TSelectOption = { value: string; color: string };
/** Turns a column into a single/multi-select dropdown of colored pills. */
export type TColumnSelect = { options: TSelectOption[]; multi: boolean };

/** A cell value recognised as a single web link. */
export type TCellLink = { href: string; host: string };

/**
 * If a cell's (trimmed) value is a single URL — either an explicit http(s) URL
 * or a bare domain like "example.com/path" — return the normalized href and a
 * display host (without a leading "www."). Otherwise null. Values with spaces
 * or formulas are never treated as links.
 */
export const parseCellUrl = (value: string): TCellLink | null => {
  const raw = (value ?? "").trim();
  if (!raw || /\s/.test(raw) || raw.startsWith("=")) return null;
  let candidate = raw;
  if (!/^https?:\/\//i.test(candidate)) {
    // Bare domain: at least one dot, a 2+ char TLD, optional path — no "@" (skip emails).
    if (raw.includes("@") || !/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(candidate)) return null;
    candidate = `https://${candidate}`;
  }
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return { href: u.href, host: u.hostname.replace(/^www\./, "") };
  } catch {
    return null;
  }
};

/** Favicon image URL for a host, via Google's public favicon service. */
export const faviconUrl = (host: string): string =>
  `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;

/** Cell value ("a, b") → selected values. */
export const parseSelected = (value: string): string[] =>
  value
    ? value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
/** Selected values → cell value. */
export const serializeSelected = (values: string[]): string => values.join(", ");

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

export type TNumberFormatOption = {
  label: string;
  sample: string;
  numberFormat: TCellNumberFormat;
  /** ISO 4217 code for currency options */
  currency?: string;
};

/** Sample string for a currency, computed via Intl so menu previews match output. */
const currencySample = (code: string): string => {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(1000.12);
  } catch {
    return `${code} 1,000.12`;
  }
};

/** Number-format options for the "123" toolbar menu, grouped like a spreadsheet's. */
export const NUMBER_FORMAT_GROUPS: TNumberFormatOption[][] = [
  [
    { label: "Automatic", sample: "", numberFormat: "automatic" },
    { label: "Plain text", sample: "", numberFormat: "plain_text" },
  ],
  [
    { label: "Number", sample: "1,000.12", numberFormat: "number" },
    { label: "Percent", sample: "10.12%", numberFormat: "percent" },
    { label: "Scientific", sample: "1.01E+03", numberFormat: "scientific" },
  ],
  [
    { label: "Accounting", sample: "$ (1,000.12)", numberFormat: "accounting" },
    { label: "Financial", sample: "(1,000.12)", numberFormat: "financial" },
    { label: "Currency", sample: "$1,000.12", numberFormat: "currency", currency: "USD" },
    { label: "Currency rounded", sample: "$1,000", numberFormat: "currency_rounded", currency: "USD" },
  ],
  [
    { label: "US Dollar", sample: currencySample("USD"), numberFormat: "currency", currency: "USD" },
    { label: "Euro", sample: currencySample("EUR"), numberFormat: "currency", currency: "EUR" },
    { label: "British Pound", sample: currencySample("GBP"), numberFormat: "currency", currency: "GBP" },
    { label: "Japanese Yen", sample: currencySample("JPY"), numberFormat: "currency", currency: "JPY" },
    { label: "Canadian Dollar", sample: currencySample("CAD"), numberFormat: "currency", currency: "CAD" },
  ],
  [
    { label: "Mexican Peso", sample: currencySample("MXN"), numberFormat: "currency", currency: "MXN" },
    { label: "Brazilian Real", sample: currencySample("BRL"), numberFormat: "currency", currency: "BRL" },
    { label: "Colombian Peso", sample: currencySample("COP"), numberFormat: "currency", currency: "COP" },
    { label: "Argentine Peso", sample: currencySample("ARS"), numberFormat: "currency", currency: "ARS" },
    { label: "Chilean Peso", sample: currencySample("CLP"), numberFormat: "currency", currency: "CLP" },
    { label: "Peruvian Sol", sample: currencySample("PEN"), numberFormat: "currency", currency: "PEN" },
    { label: "Uruguayan Peso", sample: currencySample("UYU"), numberFormat: "currency", currency: "UYU" },
  ],
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
  /** ISO 4217 code applied when numberFormat is a currency (defaults to USD) */
  currency?: string;
  /** fixed decimal places for numeric formats */
  decimals?: number;
  /** per-cell borders (color + stroke shared across the cell's active sides) */
  border?: TCellBorder;
};

export type TCellBorderStyle = "solid" | "dashed";
export type TCellBorder = {
  top?: boolean;
  right?: boolean;
  bottom?: boolean;
  left?: boolean;
  color: string;
  width: number;
  style: TCellBorderStyle;
};
export type TBorderPosition = "all" | "outer" | "inner" | "top" | "bottom" | "left" | "right" | "none" | "restyle";

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
  const filters: Record<number, TColumnFilter> = {};
  if (isRecord(raw.filters)) {
    for (const [key, value] of Object.entries(raw.filters)) {
      const idx = Number(key);
      if (Number.isInteger(idx) && isRecord(value)) {
        const hidden = Array.isArray(value.hidden) ? value.hidden.filter((v): v is string => typeof v === "string") : undefined;
        const query = typeof value.query === "string" ? value.query : undefined;
        filters[idx] = { hidden, query };
      }
    }
  }
  const selects: Record<number, TColumnSelect> = {};
  if (isRecord(raw.selects)) {
    for (const [key, value] of Object.entries(raw.selects)) {
      const idx = Number(key);
      if (Number.isInteger(idx) && isRecord(value) && Array.isArray(value.options)) {
        const options = value.options
          .filter(isRecord)
          .map((o) => ({ value: String(o.value ?? ""), color: typeof o.color === "string" ? o.color : "#e5e7eb" }))
          .filter((o) => o.value);
        if (options.length) selects[idx] = { options, multi: value.multi === true };
      }
    }
  }
  return {
    id,
    name,
    color: typeof raw.color === "string" ? raw.color : undefined,
    rows: Math.min(Math.max(rows, 1), SHEET_MAX_ROWS),
    cols: boundedCols,
    cells,
    formats,
    colWidths,
    frozenCols,
    filterEnabled: raw.filterEnabled === true,
    filters,
    selects,
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
    f.decimals === undefined &&
    !(f.border && (f.border.top || f.border.right || f.border.bottom || f.border.left)));

/**
 * Apply a cell's number format to its already-computed value. Non-numeric
 * values (text, "#ERROR", empty) pass through unchanged.
 */
const groupNumber = (n: number, decimals: number): string =>
  n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const formatCurrency = (n: number, code: string, decimals: number | undefined): string => {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      ...(decimals !== undefined ? { minimumFractionDigits: decimals, maximumFractionDigits: decimals } : {}),
    }).format(n);
  } catch {
    return `${code} ${groupNumber(n, decimals ?? 2)}`;
  }
};

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
      return formatCurrency(n, format.currency || "USD", d);
    case "currency_rounded":
      return formatCurrency(n, format.currency || "USD", d ?? 0);
    case "euro":
      return formatCurrency(n, "EUR", d);
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

/** Move a column from index `from` to index `to`, shifting the others. */
export const moveColumn = (grid: TSheetGrid, from: number, to: number): TSheetGrid => {
  if (from === to || from < 0 || to < 0) return grid;
  // Build the new column order (array of old indices), then a old→new lookup.
  const order: number[] = [];
  for (let i = 0; i < grid.cols; i++) if (i !== from) order.push(i);
  order.splice(Math.min(to, order.length), 0, from);
  const newOf = new Map<number, number>();
  order.forEach((oldIdx, newIdx) => newOf.set(oldIdx, newIdx));
  const move = (p: { row: number; col: number }) => ({ row: p.row, col: newOf.get(p.col) ?? p.col });
  const colWidths: Record<number, number> = {};
  for (const [key, value] of Object.entries(grid.colWidths ?? {})) {
    const ni = newOf.get(Number(key));
    if (ni !== undefined) colWidths[ni] = value;
  }
  return {
    ...grid,
    cells: remapByPosition(grid.cells, move),
    formats: remapByPosition(grid.formats, move),
    colWidths,
  };
};

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

/** Whether a border carries any visible edge. */
export const hasBorder = (b: TCellBorder | undefined): b is TCellBorder =>
  !!b && (!!b.top || !!b.right || !!b.bottom || !!b.left);

/**
 * Apply borders across a rectangular range. `position` picks which edges each
 * cell gains; color/width/style are merged into the cell's existing border so
 * repeated applications keep prior sides. "none" clears borders in the range.
 */
export const applyBorders = (
  grid: TSheetGrid,
  r1: number,
  c1: number,
  r2: number,
  c2: number,
  position: TBorderPosition,
  style: { color: string; width: number; style: TCellBorderStyle }
): TSheetGrid => {
  const rMin = Math.min(r1, r2);
  const rMax = Math.max(r1, r2);
  const cMin = Math.min(c1, c2);
  const cMax = Math.max(c1, c2);
  const formats = { ...(grid.formats ?? {}) };
  for (let r = rMin; r <= rMax; r++) {
    for (let c = cMin; c <= cMax; c++) {
      const id = cellId(r, c);
      const prev = formats[id];
      if (position === "none") {
        if (prev?.border) {
          const { border: _drop, ...rest } = prev;
          if (isEmptyFormat(rest)) delete formats[id];
          else formats[id] = rest;
        }
        continue;
      }
      // "restyle" recolors/reweights the borders a cell already has — it never
      // adds sides, so picking a new color in the menu updates live.
      if (position === "restyle") {
        if (hasBorder(prev?.border)) {
          formats[id] = { ...prev, border: { ...prev!.border!, color: style.color, width: style.width, style: style.style } };
        }
        continue;
      }
      const sides = {
        top: position === "all" || position === "top" || (position === "outer" && r === rMin) || (position === "inner" && r > rMin),
        bottom: position === "all" || position === "bottom" || (position === "outer" && r === rMax) || (position === "inner" && r < rMax),
        left: position === "all" || position === "left" || (position === "outer" && c === cMin) || (position === "inner" && c > cMin),
        right: position === "all" || position === "right" || (position === "outer" && c === cMax) || (position === "inner" && c < cMax),
      };
      const base = prev?.border;
      const border: TCellBorder = {
        top: sides.top || (!!base?.top && position !== "all"),
        right: sides.right || (!!base?.right && position !== "all"),
        bottom: sides.bottom || (!!base?.bottom && position !== "all"),
        left: sides.left || (!!base?.left && position !== "all"),
        color: style.color,
        width: style.width,
        style: style.style,
      };
      if (hasBorder(border)) formats[id] = { ...prev, border };
    }
  }
  return { ...grid, formats };
};

/** Distinct colors cycled through for the cell references inside a formula. */
export const FORMULA_REF_COLORS = ["#1a73e8", "#e8710a", "#188038", "#9334e6", "#c5221f", "#12a4af"];

export type TFormulaRef = {
  token: string;
  start: number;
  end: number;
  color: string;
  r1: number;
  c1: number;
  r2: number;
  c2: number;
};

/**
 * Extract the cell references (and ranges) from a formula, assigning each a
 * stable color. Used to colorize references in the editor and highlight the
 * referenced cells in the grid, like a spreadsheet.
 */
export const parseFormulaRefs = (raw: string): TFormulaRef[] => {
  if (!raw.startsWith("=")) return [];
  const re = /([A-Za-z]+\d+):([A-Za-z]+\d+)|([A-Za-z]+\d+)/g;
  const out: TFormulaRef[] = [];
  const colorByToken = new Map<string, string>();
  let colorIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const token = m[0];
    const key = token.toUpperCase();
    let color = colorByToken.get(key);
    if (!color) {
      color = FORMULA_REF_COLORS[colorIndex % FORMULA_REF_COLORS.length];
      colorIndex += 1;
      colorByToken.set(key, color);
    }
    let r1: number;
    let c1: number;
    let r2: number;
    let c2: number;
    if (m[1] && m[2]) {
      const a = parseCellId(m[1].toUpperCase());
      const b = parseCellId(m[2].toUpperCase());
      if (!a || !b) continue;
      r1 = Math.min(a.row, b.row);
      r2 = Math.max(a.row, b.row);
      c1 = Math.min(a.col, b.col);
      c2 = Math.max(a.col, b.col);
    } else {
      const p = parseCellId((m[3] ?? "").toUpperCase());
      if (!p) continue;
      r1 = r2 = p.row;
      c1 = c2 = p.col;
    }
    out.push({ token, start: m.index, end: m.index + token.length, color, r1, c1, r2, c2 });
  }
  return out;
};

/** Split a formula into colored/plain runs for syntax-highlighted rendering. */
export const formulaSegments = (raw: string, refs: TFormulaRef[]): { text: string; color: string | null }[] => {
  const parts: { text: string; color: string | null }[] = [];
  let i = 0;
  for (const ref of refs) {
    if (ref.start > i) parts.push({ text: raw.slice(i, ref.start), color: null });
    parts.push({ text: raw.slice(ref.start, ref.end), color: ref.color });
    i = ref.end;
  }
  if (i < raw.length) parts.push({ text: raw.slice(i), color: null });
  return parts;
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

// ---------------------------------------------------------------------------
// Column filters
// ---------------------------------------------------------------------------

/** The value shown for a cell (computed + number-formatted) — what filters match on. */
export const displayValue = (grid: TSheetGrid, row: number, col: number): string => {
  const id = cellId(row, col);
  return formatDisplayValue(computeCell(id, grid.cells), grid.formats?.[id]);
};

/** Distinct displayed values in a column's data rows (for the filter checklist). */
export const columnDistinctValues = (grid: TSheetGrid, col: number): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (let r = 0; r < grid.rows; r++) {
    const v = displayValue(grid, r, col);
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
};

/** Whether a column has an active filter. */
export const isColumnFiltered = (f: TColumnFilter | undefined): boolean =>
  !!f && ((f.hidden?.length ?? 0) > 0 || !!f.query?.trim());

/** Whether a data row passes every active column filter. */
export const rowPassesFilters = (grid: TSheetGrid, row: number): boolean => {
  if (!grid.filterEnabled || !grid.filters) return true;
  for (const [key, f] of Object.entries(grid.filters)) {
    if (!isColumnFiltered(f)) continue;
    const v = displayValue(grid, row, Number(key));
    if (f.query?.trim() && !v.toLowerCase().includes(f.query.trim().toLowerCase())) return false;
    if (f.hidden?.includes(v)) return false;
  }
  return true;
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
