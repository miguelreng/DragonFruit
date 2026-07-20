/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* eslint-disable react/no-array-index-key, unicorn/consistent-function-scoping, jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions, jsx-a11y/no-autofocus, oxc/no-map-spread */

import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { debounce } from "lodash-es";
import { cn } from "@plane/utils";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  ArrowRight,
  Bold,
  ChartNoAxesColumn,
  Check,
  ChevronDown,
  Copy,
  DollarSign,
  Eraser,
  ExternalLink,
  Italic,
  ListFilter,
  PaintBucket,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Strikethrough,
  Trash,
  Type,
  X,
} from "@/components/icons/lucide-shim";
import { useMember } from "@/hooks/store/use-member";
import type { TPageInstance } from "@/store/pages/base-page";
import type { TPageRootHandlers } from "../editor/page-root";
import {
  applyBorders,
  applySuggestion,
  cellId,
  clearColumn,
  clearRect,
  clearRow,
  colWidth,
  columnDistinctValues,
  columnLabel,
  computeCell,
  isColumnFiltered,
  rowPassesFilters,
  createGrid,
  formulaSegments,
  formulaSuggestions,
  parseFormulaRefs,
  deleteColumn,
  deleteRow,
  faviconUrl,
  fillRange,
  formatDisplayValue,
  getInitialSnapshot,
  parseCellUrl,
  insertColumn,
  insertRow,
  isEmptyFormat,
  moveColumn,
  NUMBER_FORMAT_GROUPS,
  parseCellId,
  parseClipboard,
  parseSelected,
  serializeSelected,
  rangeToTSV,
  writeMatrix,
  chartDataFromRange,
  rangeRef,
  SHEET_CHART_TYPES,
  SHEET_DEFAULT_COL_WIDTH,
  SHEET_MAX_COL_WIDTH,
  SHEET_MAX_COLS,
  SHEET_MAX_ROWS,
  SHEET_MIN_COL_WIDTH,
  SHEET_ROW_HEIGHT,
  SHEET_ROWNUM_WIDTH,
  type TBorderPosition,
  type TCellBorderStyle,
  type TCellFormat,
  type TCellNumberFormat,
  type TColumnFilter,
  type TColumnSelect,
  type TNumberFormatOption,
  type TSelectOption,
  type TSheetChart,
  type TSheetChartType,
  type TSheetGrid,
  type TSheetSnapshot,
} from "./sheet-utils";
import type { TChartSpec } from "@/components/chart/spec";

type Props = {
  page: TPageInstance;
  handlers: TPageRootHandlers;
  isEditable: boolean;
};

type Rect = { r1: number; c1: number; r2: number; c2: number };
type ContextMenu = { x: number; y: number; kind: "col" | "row"; index: number };

// Strong palette — for text color.
const PALETTE = [
  "#1c1e26",
  "#6b7280",
  "#dc2626",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#0891b2",
  "#2563eb",
  "#7c3aed",
  "#db2777",
];

// Soft/tinted palette — for fill (cell background), so text stays readable.
const FILL_PALETTE = [
  "#e5e7eb",
  "#fecaca",
  "#fed7aa",
  "#fef08a",
  "#bbf7d0",
  "#a5f3fc",
  "#bfdbfe",
  "#ddd6fe",
  "#fbcfe8",
  "#f5d0fe",
];

// Selection outline colour — a light pink.
const SEL_BORDER = "#ec4899";

// Per-cell inset box-shadow drawing a rect's perimeter for cell (r, c) in `color`.
const rectBorder = (rect: Rect, r: number, c: number, color: string = SEL_BORDER): string | undefined => {
  const parts: string[] = [];
  if (r === rect.r1) parts.push(`inset 0 2px 0 0 ${color}`);
  if (r === rect.r2) parts.push(`inset 0 -2px 0 0 ${color}`);
  if (c === rect.c1) parts.push(`inset 2px 0 0 0 ${color}`);
  if (c === rect.c2) parts.push(`inset -2px 0 0 0 ${color}`);
  return parts.join(", ") || undefined;
};
const selectionBorder = (rect: Rect, r: number, c: number): string | undefined => rectBorder(rect, r, c);

const normRect = (r1: number, c1: number, r2: number, c2: number): Rect => ({
  r1: Math.min(r1, r2),
  c1: Math.min(c1, c2),
  r2: Math.max(r1, r2),
  c2: Math.max(c1, c2),
});
const inRect = (rect: Rect | null, r: number, c: number): boolean =>
  !!rect && r >= rect.r1 && r <= rect.r2 && c >= rect.c1 && c <= rect.c2;

// Charts pull in recharts — lazy so sheets without charts don't pay for it.
const LazyChartSpecView = lazy(() =>
  import("@/components/chart/spec-view").then((module) => ({ default: module.ChartSpecView }))
);

/** Compose the renderer spec for a sheet chart from its live range data. */
const sheetChartSpec = (grid: TSheetGrid, chart: TSheetChart): TChartSpec | null => {
  const data = chartDataFromRange(grid, chart.range);
  if (!data) return null;
  return {
    version: 1,
    type: chart.type,
    ...(chart.title ? { title: chart.title } : {}),
    labels: data.labels,
    series: data.series,
    ...(chart.options ? { options: chart.options } : {}),
  };
};

export const SheetEditor = observer(function SheetEditor({ page, handlers, isEditable }: Props) {
  const [snapshot, setSnapshot] = useState<TSheetSnapshot>(() => getInitialSnapshot(page.description_json));
  // Kept in sync with `snapshot` for synchronous reads in commit/undo/redo.
  const snapshotRef = useRef(snapshot);
  const undoRef = useRef<TSheetSnapshot[]>([]);
  const redoRef = useRef<TSheetSnapshot[]>([]);
  // Value of the focused cell when editing began, so Esc can revert it.
  const editOriginalRef = useRef("");
  // Moving corner of a keyboard (Shift+Arrow) selection; the focused cell anchors it.
  const selectionActiveRef = useRef<{ row: number; col: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState<string | null>(null);
  // Cell in text-edit mode (entered via double-click, typing, or Enter). A focused
  // cell that isn't being edited is merely "selected" — keys navigate the grid.
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [menu, setMenu] = useState<ContextMenu | null>(null);
  const [tabMenu, setTabMenu] = useState<{ x: number; y: number; index: number } | null>(null);
  // Open column-filter dropdown, positioned at the clicked funnel.
  const [filterMenu, setFilterMenu] = useState<{ col: number; x: number; y: number } | null>(null);
  // Open dropdown-column config popover / an open pill-cell picker.
  const [selectConfig, setSelectConfig] = useState<{ col: number; x: number; y: number } | null>(null);
  const [pickCell, setPickCell] = useState<{ id: string; col: number; x: number; y: number } | null>(null);
  const [fillPreview, setFillPreview] = useState<Rect | null>(null);
  // `maxWidth` remembers the widest the grid has ever been so opening the Atlas
  // panel (which narrows the grid) doesn't drop columns — the grid overflows-x instead.
  const [viewport, setViewport] = useState({ width: 0, height: 0, maxWidth: 0 });
  const [showSuggest, setShowSuggest] = useState(false);
  const [suggestIndex, setSuggestIndex] = useState(0);
  // True while the fx formula bar is being edited (vs. editing in a cell) — decides
  // where the suggestion dropdown anchors so only one shows at a time.
  const [barFocused, setBarFocused] = useState(false);
  // Horizontal scroll of the input being edited, so the syntax-highlight overlay stays aligned.
  const [editScroll, setEditScroll] = useState(0);
  // Set while a formula is actively being typed — enables click-to-insert of a
  // clicked cell's reference into the formula (like a spreadsheet).
  const [formulaEditing, setFormulaEditing] = useState<{ id: string; source: "cell" | "bar" } | null>(null);
  const barInputRef = useRef<HTMLInputElement | null>(null);

  const fillRef = useRef<{ srcId: string; srcR: number; srcC: number; r: number; c: number } | null>(null);

  const active: TSheetGrid = snapshot.sheets.find((s) => s.id === snapshot.activeId) ?? snapshot.sheets[0];

  const { getMemberIds, getUserDetails } = useMember();

  useEffect(() => {
    page.setSyncingStatus("synced");
  }, [page]);

  const persist = useMemo(
    () =>
      debounce((next: TSheetSnapshot) => {
        page.setSyncingStatus("syncing");
        handlers
          .updateDescription({ description_json: { sheet_snapshot: next } })
          .then(() => page.setSyncingStatus("synced"))
          .catch((e) => {
            console.error("sheet save failed", e);
            page.setSyncingStatus("error");
          });
      }, 700),
    [handlers, page]
  );

  useEffect(
    () => () => {
      persist.flush();
      persist.cancel();
    },
    [persist]
  );

  const commit = useCallback(
    (updater: (prev: TSheetSnapshot) => TSheetSnapshot) => {
      const prev = snapshotRef.current;
      undoRef.current.push(prev);
      if (undoRef.current.length > 200) undoRef.current.shift();
      redoRef.current = [];
      const next = updater(prev);
      snapshotRef.current = next;
      setSnapshot(next);
      persist(next);
    },
    [persist]
  );

  const undo = useCallback(() => {
    const prev = undoRef.current.pop();
    if (prev === undefined) return;
    redoRef.current.push(snapshotRef.current);
    snapshotRef.current = prev;
    setSnapshot(prev);
    persist(prev);
    setShowSuggest(false);
  }, [persist]);

  const redo = useCallback(() => {
    const next = redoRef.current.pop();
    if (next === undefined) return;
    undoRef.current.push(snapshotRef.current);
    snapshotRef.current = next;
    setSnapshot(next);
    persist(next);
  }, [persist]);

  // ⌘Z / Ctrl+Z undo, ⌘⇧Z / Ctrl+Y redo — active while focus is within the sheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const el = document.activeElement;
      const inSheet = !el || el === document.body || (rootRef.current?.contains(el) ?? false);
      if (!inSheet) return;
      const k = e.key.toLowerCase();
      if (k === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (k === "y") {
        e.preventDefault();
        redo();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const commitGrid = useCallback(
    (updater: (grid: TSheetGrid) => TSheetGrid) => {
      commit((prev) => ({
        ...prev,
        sheets: prev.sheets.map((s) => (s.id === prev.activeId ? updater(s) : s)),
      }));
    },
    [commit]
  );

  const setCellValue = useCallback(
    (id: string, value: string) => {
      commitGrid((grid) => {
        const cells = { ...grid.cells };
        if (value === "") delete cells[id];
        else cells[id] = value;
        const p = parseCellId(id);
        const rows = p ? Math.max(grid.rows, Math.min(p.row + 1, SHEET_MAX_ROWS)) : grid.rows;
        const cols = p ? Math.max(grid.cols, Math.min(p.col + 1, SHEET_MAX_COLS)) : grid.cols;
        return { ...grid, cells, rows, cols };
      });
    },
    [commitGrid]
  );

  // ---- Floating charts ----
  const insertChart = useCallback(() => {
    if (!isEditable) return;
    const focusedCell = focused ? parseCellId(focused) : null;
    const rect =
      selection ??
      (focusedCell ? { r1: focusedCell.row, c1: focusedCell.col, r2: focusedCell.row, c2: focusedCell.col } : null);
    if (!rect) return;
    const range = rangeRef(normRect(rect.r1, rect.c1, rect.r2, rect.c2));
    commitGrid((grid) => {
      const existing = grid.charts ?? [];
      // Cascade new cards so stacked inserts stay individually grabbable.
      const offset = (existing.length % 5) * 32;
      const chart: TSheetChart = {
        id: `chart-${Date.now()}`,
        type: "bar",
        range,
        x: SHEET_ROWNUM_WIDTH + 24 + offset,
        y: 24 + offset,
        w: 460,
        h: 300,
      };
      return { ...grid, charts: [...existing, chart] };
    });
  }, [isEditable, focused, selection, commitGrid]);

  const updateChart = useCallback(
    (id: string, patch: Partial<TSheetChart>) => {
      commitGrid((grid) => ({
        ...grid,
        charts: (grid.charts ?? []).map((chart) => (chart.id === id ? { ...chart, ...patch } : chart)),
      }));
    },
    [commitGrid]
  );

  const deleteChart = useCallback(
    (id: string) => {
      commitGrid((grid) => ({ ...grid, charts: (grid.charts ?? []).filter((chart) => chart.id !== id) }));
    },
    [commitGrid]
  );

  // Current selection as an A1 range — lets chart cards re-bind to it.
  const selectionRangeRef = useMemo(
    () => (selection ? rangeRef(normRect(selection.r1, selection.c1, selection.r2, selection.c2)) : null),
    [selection]
  );

  // Format the active selection (or the focused cell), bounded to real cells so
  // selecting a whole column doesn't write formats onto empty filler cells.
  const applyFormat = useCallback(
    (partial: Partial<TCellFormat>) => {
      if (!isEditable) return;
      const rect =
        selection ??
        (focused
          ? (() => {
              const p = parseCellId(focused);
              return p ? { r1: p.row, c1: p.col, r2: p.row, c2: p.col } : null;
            })()
          : null);
      if (!rect) return;
      commitGrid((grid) => {
        const formats = { ...grid.formats };
        const rMax = Math.min(rect.r2, grid.rows - 1);
        const cMax = Math.min(rect.c2, grid.cols - 1);
        for (let r = rect.r1; r <= rMax; r++) {
          for (let c = rect.c1; c <= cMax; c++) {
            const id = cellId(r, c);
            const next: TCellFormat = { ...formats[id], ...partial };
            if (isEmptyFormat(next)) delete formats[id];
            else formats[id] = next;
          }
        }
        return { ...grid, formats };
      });
    },
    [commitGrid, focused, isEditable, selection]
  );

  const applyBordersToSelection = useCallback(
    (position: TBorderPosition, style: { color: string; width: number; style: TCellBorderStyle }) => {
      if (!isEditable) return;
      const rect =
        selection ??
        (focused
          ? (() => {
              const p = parseCellId(focused);
              return p ? { r1: p.row, c1: p.col, r2: p.row, c2: p.col } : null;
            })()
          : null);
      if (!rect) return;
      commitGrid((grid) =>
        applyBorders(
          grid,
          rect.r1,
          rect.c1,
          Math.min(rect.r2, grid.rows - 1),
          Math.min(rect.c2, grid.cols - 1),
          position,
          style
        )
      );
    },
    [commitGrid, focused, isEditable, selection]
  );

  // Column drag-resize.
  const startResize = useCallback(
    (event: React.MouseEvent, col: number) => {
      if (!isEditable) return;
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startWidth = colWidth(active, col);
      const onMove = (e: MouseEvent) => {
        const width = Math.min(Math.max(startWidth + (e.clientX - startX), SHEET_MIN_COL_WIDTH), SHEET_MAX_COL_WIDTH);
        commitGrid((grid) => ({ ...grid, colWidths: { ...grid.colWidths, [col]: width } }));
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
      };
      document.body.style.cursor = "col-resize";
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [active, commitGrid, isEditable]
  );

  // Drag a column header to reorder columns.
  const colDragRef = useRef<{ from: number; startX: number; moved: boolean } | null>(null);
  const didDragColRef = useRef(false);
  const [colDrag, setColDrag] = useState<{ from: number; over: number } | null>(null);
  const startColDrag = useCallback(
    (event: React.MouseEvent, from: number) => {
      if (!isEditable || event.button !== 0) return;
      colDragRef.current = { from, startX: event.clientX, moved: false };
      const onMove = (e: MouseEvent) => {
        const d = colDragRef.current;
        if (!d) return;
        if (!d.moved && Math.abs(e.clientX - d.startX) > 4) {
          d.moved = true;
          document.body.style.cursor = "grabbing";
        }
        if (!d.moved) return;
        // Resolve the column under the pointer robustly (works over the label too).
        const target = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest("[data-col]");
        const over = target ? Number(target.getAttribute("data-col")) : d.from;
        setColDrag({ from: d.from, over: Number.isNaN(over) ? d.from : over });
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        const d = colDragRef.current;
        colDragRef.current = null;
        document.body.style.cursor = "";
        setColDrag((cd) => {
          if (d?.moved && cd && cd.over !== cd.from) commitGrid((g) => moveColumn(g, cd.from, cd.over));
          return null;
        });
        if (d?.moved) didDragColRef.current = true;
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [commitGrid, isEditable]
  );

  // Double-click the resize edge → fit the column to its widest content.
  const autoFitColumn = useCallback(
    (col: number) => {
      if (!isEditable) return;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const sample = document.getElementById(`sheet-cell-${cellId(0, col)}`);
      const cs = sample ? getComputedStyle(sample) : null;
      ctx.font = cs ? `${cs.fontSize} ${cs.fontFamily}` : "12px sans-serif";
      let max = 0;
      for (let r = 0; r < active.rows; r++) {
        const raw = active.cells[cellId(r, col)];
        if (raw === undefined) continue;
        const fmt = active.formats?.[cellId(r, col)];
        const text = formatDisplayValue(computeCell(cellId(r, col), active.cells), fmt);
        max = Math.max(max, ctx.measureText(text).width);
      }
      const width =
        max > 0
          ? Math.min(Math.max(Math.ceil(max) + 24, SHEET_MIN_COL_WIDTH), SHEET_MAX_COL_WIDTH)
          : SHEET_DEFAULT_COL_WIDTH;
      commitGrid((grid) => ({ ...grid, colWidths: { ...grid.colWidths, [col]: width } }));
    },
    [active, commitGrid, isEditable]
  );

  // Sheet-tab operations.
  const switchSheet = (id: string) => {
    if (id === snapshot.activeId) return;
    setFocused(null);
    setSelection(null);
    stopEditing();
    commit((prev) => ({ ...prev, activeId: id }));
  };
  const addSheet = () => {
    if (!isEditable) return;
    const id = `sheet-${Date.now()}`;
    commit((prev) => ({
      ...prev,
      sheets: [...prev.sheets, createGrid(id, `Sheet ${prev.sheets.length + 1}`)],
      activeId: id,
    }));
    setFocused(null);
    setSelection(null);
    stopEditing();
  };
  const deleteSheet = (id: string) => {
    if (!isEditable) return;
    commit((prev) => {
      if (prev.sheets.length <= 1) return prev;
      const sheets = prev.sheets.filter((s) => s.id !== id);
      return { sheets, activeId: prev.activeId === id ? sheets[0].id : prev.activeId };
    });
    setFocused(null);
    stopEditing();
  };
  const moveSheet = (from: number, to: number) => {
    if (from === to) return;
    commit((prev) => {
      const sheets = [...prev.sheets];
      const [s] = sheets.splice(from, 1);
      sheets.splice(Math.min(to, sheets.length), 0, s);
      return { ...prev, sheets };
    });
  };
  const duplicateSheet = (index: number) => {
    if (!isEditable) return;
    const id = `sheet-${Date.now()}`;
    commit((prev) => {
      const src = prev.sheets[index];
      if (!src) return prev;
      const copy: TSheetGrid = { ...JSON.parse(JSON.stringify(src)), id, name: `${src.name} copy` };
      const sheets = [...prev.sheets];
      sheets.splice(index + 1, 0, copy);
      return { ...prev, sheets, activeId: id };
    });
    setFocused(null);
    setSelection(null);
    stopEditing();
  };
  const setSheetColor = (index: number, color?: string) => {
    if (!isEditable) return;
    commit((prev) => ({ ...prev, sheets: prev.sheets.map((s, i) => (i === index ? { ...s, color } : s)) }));
  };
  // `over` is the insertion slot (0..sheets.length): the dragged tab lands
  // *before* the tab at `over`, or after the last tab when `over === length`.
  const tabBarRef = useRef<HTMLDivElement>(null);
  const tabDragRef = useRef<{
    from: number;
    over: number;
    startX: number;
    moved: boolean;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
  } | null>(null);
  const didDragTabRef = useRef(false);
  const [tabDrag, setTabDrag] = useState<{
    from: number;
    over: number;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  // Convert an insertion slot to the post-removal index moveSheet expects.
  const tabDropDest = (from: number, over: number) => (over > from ? over - 1 : over);
  const startTabDrag = (event: React.MouseEvent, from: number) => {
    if (!isEditable || event.button !== 0) return;
    // Stop the browser starting a text selection as we drag.
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    tabDragRef.current = {
      from,
      over: from,
      startX: event.clientX,
      moved: false,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    };
    const prevUserSelect = document.body.style.userSelect;
    const onMove = (e: MouseEvent) => {
      const d = tabDragRef.current;
      if (!d) return;
      if (!d.moved && Math.abs(e.clientX - d.startX) > 4) {
        d.moved = true;
        document.body.style.userSelect = "none";
      }
      if (!d.moved) return;
      // Find the insertion slot by comparing the cursor to each tab's midpoint,
      // so the far-left region reliably resolves to slot 0 (first) even when the
      // cursor is over the tab-bar padding rather than a tab element.
      const tabs = Array.from(tabBarRef.current?.querySelectorAll<HTMLElement>("[data-tab]") ?? []);
      let over = tabs.length;
      for (let i = 0; i < tabs.length; i++) {
        const r = tabs[i].getBoundingClientRect();
        if (e.clientX < r.left + r.width / 2) {
          over = i;
          break;
        }
      }
      d.over = over;
      setTabDrag({
        from: d.from,
        over,
        x: e.clientX - d.offsetX,
        y: e.clientY - d.offsetY,
        width: d.width,
        height: d.height,
      });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = prevUserSelect;
      const d = tabDragRef.current;
      tabDragRef.current = null;
      setTabDrag(null);
      // Apply the reorder outside any setState updater so the commit isn't dropped.
      if (d?.moved) {
        const dest = tabDropDest(d.from, d.over);
        if (dest !== d.from) moveSheet(d.from, dest);
        didDragTabRef.current = true;
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  const renameSheet = (id: string, name: string) => {
    const trimmed = name.trim();
    if (trimmed)
      commit((prev) => ({ ...prev, sheets: prev.sheets.map((s) => (s.id === id ? { ...s, name: trimmed } : s)) }));
  };

  // Measure the scroll viewport to fill it with fixed-height rows / columns.
  const wrapRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () =>
      setViewport((v) => ({
        width: el.clientWidth,
        height: el.clientHeight,
        maxWidth: Math.max(v.maxWidth, el.clientWidth),
      }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Close the context menu on any outside interaction.
  useEffect(() => {
    if (!menu && !tabMenu) return;
    const close = () => {
      setMenu(null);
      setTabMenu(null);
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu, tabMenu]);

  const focusedFormat = focused ? active.formats?.[focused] : undefined;
  const focusedRaw = focused ? (active.cells[focused] ?? "") : "";

  // Formula reference highlighting: color each cell reference and highlight the
  // referenced cells in the grid, like a spreadsheet. Only while the formula is
  // actually being edited (in the cell or the fx bar) — not when merely selected.
  const editingFormula =
    !!focused && isEditable && focusedRaw.startsWith("=") && (editingCell === focused || barFocused);
  const formulaRefs = editingFormula ? parseFormulaRefs(focusedRaw) : [];
  const renderFormulaText = (raw: string) =>
    formulaSegments(raw, parseFormulaRefs(raw)).map((seg, i) => (
      <span key={i} style={seg.color ? { color: seg.color } : undefined}>
        {seg.text}
      </span>
    ));

  // Cell autocomplete: a leading "=" offers formula functions; an "@" token
  // offers people mentions (workspace members).
  const members = getMemberIds()
    .map((id) => getUserDetails(id))
    .filter((m): m is NonNullable<typeof m> => !!m);
  const memberLabel = (m: (typeof members)[number]) => m.display_name || m.email || "user";

  const isFormula = focusedRaw.startsWith("=");
  const mentionMatch = !isFormula ? /@([^@\s]*)$/.exec(focusedRaw) : null;
  const mentionQuery = mentionMatch ? mentionMatch[1].toLowerCase() : null;

  const suggestKind: "formula" | "mention" | null =
    focused && isEditable && showSuggest ? (isFormula ? "formula" : mentionQuery !== null ? "mention" : null) : null;
  const formulaItems = suggestKind === "formula" ? formulaSuggestions(focusedRaw) : [];
  const mentionItems =
    suggestKind === "mention" && mentionQuery !== null
      ? members
          .filter(
            (m) =>
              memberLabel(m).toLowerCase().includes(mentionQuery) ||
              (m.email ?? "").toLowerCase().includes(mentionQuery)
          )
          .slice(0, 6)
      : [];
  const suggestCount = suggestKind === "formula" ? formulaItems.length : mentionItems.length;
  const activeSuggest = suggestCount ? Math.min(suggestIndex, suggestCount - 1) : 0;

  const refocusEnd = () =>
    requestAnimationFrame(() => {
      const el = barFocused
        ? barInputRef.current
        : focused
          ? (document.getElementById(`sheet-cell-${focused}`) as HTMLInputElement | null)
          : null;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  const onCellInput = (id: string, value: string, source: "cell" | "bar" = "cell") => {
    setCellValue(id, value);
    const hasFormula = value.startsWith("=") && formulaSuggestions(value).length > 0;
    const hasMention = !value.startsWith("=") && /@([^@\s]*)$/.test(value);
    setShowSuggest(hasFormula || hasMention);
    setSuggestIndex(0);
    setFormulaEditing(value.startsWith("=") ? { id, source } : null);
  };

  // Enter text-edit mode on a cell: "end" keeps the current value (caret at the
  // end); "replace" starts over with `initial` (type-to-replace).
  const startEditing = (id: string, mode: "end" | "replace", initial = "") => {
    if (!isEditable) return;
    const raw = active.cells[id] ?? "";
    editOriginalRef.current = raw;
    setEditingCell(id);
    if (mode === "replace") {
      onCellInput(id, initial);
    } else {
      setShowSuggest(false);
      setFormulaEditing(raw.startsWith("=") ? { id, source: "cell" } : null);
    }
    // After the input re-renders with the raw value, focus it with the caret at the end.
    requestAnimationFrame(() => {
      const el = document.getElementById(`sheet-cell-${id}`) as HTMLInputElement | null;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  };
  const stopEditing = () => {
    setEditingCell(null);
    setFormulaEditing(null);
    setShowSuggest(false);
  };

  // Insert a clicked cell's reference into the formula being edited (replacing a
  // reference currently under the caret, like a spreadsheet).
  const insertRef = (targetId: string) => {
    const editing = formulaEditing;
    if (!editing) return;
    const el =
      editing.source === "bar"
        ? barInputRef.current
        : (document.getElementById(`sheet-cell-${editing.id}`) as HTMLInputElement | null);
    if (!el) return;
    const raw = active.cells[editing.id] ?? "";
    const caret = el.selectionStart ?? raw.length;
    const before = raw.slice(0, caret);
    const after = raw.slice(caret);
    const partial = /[A-Za-z]+\d*$/.exec(before); // a reference under construction
    const start = partial ? caret - partial[0].length : caret;
    const next = raw.slice(0, start) + targetId + after;
    const newCaret = start + targetId.length;
    setCellValue(editing.id, next);
    setShowSuggest(false);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(newCaret, newCaret);
    });
  };
  const acceptFormula = (fn: string) => {
    if (!focused) return;
    setCellValue(focused, applySuggestion(focusedRaw, fn));
    setShowSuggest(false);
    refocusEnd();
  };
  const acceptMention = (m: (typeof members)[number]) => {
    if (!focused || mentionQuery === null) return;
    const base = focusedRaw.slice(0, focusedRaw.length - (mentionQuery.length + 1));
    setCellValue(focused, `${base}@${memberLabel(m)} `);
    setShowSuggest(false);
    refocusEnd();
  };
  const acceptActive = () => {
    if (suggestKind === "formula" && formulaItems[activeSuggest]) acceptFormula(formulaItems[activeSuggest]);
    else if (suggestKind === "mention" && mentionItems[activeSuggest]) acceptMention(mentionItems[activeSuggest]);
  };
  // Suggestion navigation shared by the cell inputs and the formula bar.
  // Returns true when it consumed the key.
  const handleSuggestKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): boolean => {
    if (suggestCount === 0) return false;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSuggestIndex((i) => (i + 1) % suggestCount);
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSuggestIndex((i) => (i - 1 + suggestCount) % suggestCount);
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      // Enter commits the formula being edited (Tab accepts the suggestion);
      // mention suggestions accept on both.
      if (event.key === "Enter" && suggestKind === "formula") return false;
      event.preventDefault();
      acceptActive();
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setShowSuggest(false);
      return true;
    }
    return false;
  };
  const handleCellKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, row: number, col: number) => {
    const id = cellId(row, col);
    const isEditing = editingCell === id;
    if ((event.metaKey || event.ctrlKey) && !event.altKey) {
      const k = event.key.toLowerCase();
      if (k === "b") {
        event.preventDefault();
        applyFormat({ bold: !focusedFormat?.bold });
        return;
      }
      if (k === "i") {
        event.preventDefault();
        applyFormat({ italic: !focusedFormat?.italic });
        return;
      }
      if (k === "a") {
        // While editing, let ⌘A select the cell's text; otherwise select all cells.
        if (isEditing) return;
        event.preventDefault();
        setSelection({ r1: 0, c1: 0, r2: active.rows - 1, c2: active.cols - 1 });
        return;
      }
    }
    // Shift+Arrow extends a cell-range selection from the focused (anchor) cell.
    // Skip while editing so Shift+Arrow selects text instead.
    const arrowDelta: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    if (event.shiftKey && !isEditing && arrowDelta[event.key]) {
      event.preventDefault();
      const [dr, dc] = arrowDelta[event.key];
      // Active corner = last moved corner, else the selection corner opposite the
      // anchor (handles a mouse-dragged selection), else the focused cell itself.
      const cur =
        selectionActiveRef.current ??
        (selection
          ? {
              row: selection.r1 === row ? selection.r2 : selection.r1,
              col: selection.c1 === col ? selection.c2 : selection.c1,
            }
          : { row, col });
      const nr = Math.max(0, Math.min(cur.row + dr, renderRows - 1));
      const nc = Math.max(0, Math.min(cur.col + dc, renderCols - 1));
      selectionActiveRef.current = { row: nr, col: nc };
      setSelection(normRect(row, col, nr, nc));
      return;
    }
    // Delete/Backspace over a multi-cell selection clears every selected cell.
    if (
      !isEditing &&
      (event.key === "Delete" || event.key === "Backspace") &&
      selection &&
      !(selection.r1 === selection.r2 && selection.c1 === selection.c2)
    ) {
      event.preventDefault();
      const rect = selection;
      commitGrid((g) => clearRect(g, rect.r1, rect.c1, rect.r2, rect.c2));
      return;
    }
    if (!isEditing) {
      // Selected (not editing): keys navigate the grid / act on the cell.
      if (arrowDelta[event.key] && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        const [dr, dc] = arrowDelta[event.key];
        const nr = Math.max(0, Math.min(row + dr, renderRows - 1));
        const nc = Math.max(0, Math.min(col + dc, renderCols - 1));
        document.getElementById(`sheet-cell-${cellId(nr, nc)}`)?.focus();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        startEditing(id, "end");
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (isEditable) setCellValue(id, "");
        return;
      }
      if (event.key === "Escape") {
        // Esc on a selected cell → drop the selection entirely.
        event.preventDefault();
        event.currentTarget.blur();
        setFocused(null);
        setSelection(null);
        setFormulaEditing(null);
        return;
      }
      // Typing on a selected cell starts a fresh edit (type-to-replace). Dead keys
      // (accents) begin an empty edit so the composed character lands in the input.
      if (isEditable && !event.metaKey && !event.ctrlKey && (event.key.length === 1 || event.key === "Dead")) {
        if (event.key.length === 1) {
          event.preventDefault();
          startEditing(id, "replace", event.key);
        } else {
          startEditing(id, "replace", "");
        }
      }
      return;
    }
    if (handleSuggestKeyDown(event)) return;
    if (event.key === "Escape") {
      // Cancel the edit: restore the value from before editing, then deselect the cell.
      event.preventDefault();
      if ((active.cells[id] ?? "") !== editOriginalRef.current) setCellValue(id, editOriginalRef.current);
      stopEditing();
      event.currentTarget.blur();
      setFocused(null);
      setSelection(null);
      return;
    }
    if (event.key === "Enter") {
      // Commit the edit (the value/formula is already written), then move down.
      event.preventDefault();
      stopEditing();
      document.getElementById(`sheet-cell-${cellId(row + 1, col)}`)?.focus();
    }
  };

  // Suggestion dropdown, positioned via `anchorClass` — reused by cells and the fx bar.
  const renderSuggestions = (anchorClass: string) => {
    if (suggestKind === "formula" && formulaItems.length > 0) {
      return (
        <div
          className={cn(
            "shadow-lg absolute z-30 mt-px max-h-56 w-52 overflow-auto rounded-md border border-subtle bg-surface-1 py-1 text-left",
            anchorClass
          )}
        >
          {formulaItems.map((fn, i) => (
            <button
              key={fn}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                acceptFormula(fn);
              }}
              className={cn("font-mono block w-full px-3 py-1 text-left text-12", {
                "bg-layer-2 text-primary": i === activeSuggest,
                "text-secondary hover:bg-layer-1": i !== activeSuggest,
              })}
            >
              {fn}
            </button>
          ))}
        </div>
      );
    }
    if (suggestKind === "mention" && mentionItems.length > 0) {
      return (
        <div
          className={cn(
            "shadow-lg absolute z-30 mt-px max-h-60 w-64 overflow-auto rounded-md border border-subtle bg-surface-1 py-1 text-left",
            anchorClass
          )}
        >
          {mentionItems.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                acceptMention(m);
              }}
              className={cn("flex w-full items-center gap-2 px-3 py-1 text-left", {
                "bg-layer-2": i === activeSuggest,
                "hover:bg-layer-1": i !== activeSuggest,
              })}
            >
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent-primary/15 text-10 font-medium text-accent-primary">
                {memberLabel(m).charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate text-12 text-primary">{memberLabel(m)}</span>
              {m.email && <span className="shrink-0 truncate text-11 text-tertiary">{m.email}</span>}
            </button>
          ))}
        </div>
      );
    }
    return null;
  };

  const toggle = (key: "bold" | "italic" | "strike") => applyFormat({ [key]: !focusedFormat?.[key] });
  const setNumberFormat = (nf: "currency" | "percent") =>
    applyFormat({ numberFormat: focusedFormat?.numberFormat === nf ? "plain" : nf });
  const bumpDecimals = (delta: number) => {
    const fallback = focusedFormat?.numberFormat === "currency" ? 2 : 0;
    applyFormat({ decimals: Math.max(0, Math.min(10, (focusedFormat?.decimals ?? fallback) + delta)) });
  };

  // Rows/columns rendered: enough to fill the viewport, never fewer than the grid.
  const renderRows = Math.max(active.rows, Math.floor((viewport.height - SHEET_ROW_HEIGHT) / SHEET_ROW_HEIGHT) || 0);
  const renderCols = useMemo(() => {
    const fillWidth = Math.max(viewport.width, viewport.maxWidth);
    let used = SHEET_ROWNUM_WIDTH;
    let c = 0;
    while (used < fillWidth && c < SHEET_MAX_COLS) {
      used += c < active.cols ? colWidth(active, c) : SHEET_DEFAULT_COL_WIDTH;
      c += 1;
    }
    return Math.max(active.cols, c);
  }, [active, viewport.width, viewport.maxWidth]);

  const rows = Array.from({ length: renderRows }, (_, r) => r);
  const cols = Array.from({ length: renderCols }, (_, c) => c);
  const totalWidth = SHEET_ROWNUM_WIDTH + cols.reduce((sum, c) => sum + colWidth(active, c), 0);

  // Add row/column relative to what's actually rendered, so one always appears
  // (the grid fills the viewport, so grid.cols may be below the visible count).
  const addRow = () => {
    if (!isEditable) return;
    commitGrid((grid) => ({ ...grid, rows: Math.min(renderRows + 1, SHEET_MAX_ROWS) }));
  };
  const addColumn = () => {
    if (!isEditable) return;
    commitGrid((grid) => ({ ...grid, cols: Math.min(renderCols + 1, SHEET_MAX_COLS) }));
  };

  const toggleFilters = () => {
    if (!isEditable) return;
    commitGrid((grid) => ({ ...grid, filterEnabled: !grid.filterEnabled }));
    setFilterMenu(null);
  };
  const setColumnFilter = (col: number, filter: TColumnFilter | null) => {
    commitGrid((grid) => {
      const filters = { ...grid.filters };
      if (!filter || (!(filter.hidden?.length ?? 0) && !filter.query?.trim())) delete filters[col];
      else filters[col] = filter;
      return { ...grid, filters };
    });
  };
  const setColumnSelect = (col: number, config: TColumnSelect | null) => {
    commitGrid((grid) => {
      const selects = { ...grid.selects };
      if (!config || config.options.length === 0) delete selects[col];
      else selects[col] = config;
      return { ...grid, selects };
    });
  };
  const toggleSelectValue = (id: string, value: string, multi: boolean) => {
    const current = parseSelected(active.cells[id] ?? "");
    const next = multi
      ? current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value]
      : current.includes(value)
        ? []
        : [value];
    setCellValue(id, serializeSelected(next));
  };

  // Frozen columns: sticky-left offsets for the first `frozen` columns.
  const frozen = active.frozenCols ?? 0;
  const colLeft: number[] = [];
  {
    let acc = SHEET_ROWNUM_WIDTH;
    for (let c = 0; c < renderCols; c++) {
      colLeft[c] = acc;
      acc += colWidth(active, c);
    }
  }

  const selectColumn = (c: number) => {
    setSelection(normRect(0, c, renderRows - 1, c));
    setFocused(cellId(0, c));
    stopEditing();
  };
  const selectRow = (r: number) => {
    setSelection(normRect(r, 0, r, renderCols - 1));
    setFocused(cellId(r, 0));
    stopEditing();
  };
  const openMenu = (e: React.MouseEvent, kind: "col" | "row", index: number) => {
    if (!isEditable) return;
    e.preventDefault();
    if (kind === "col") selectColumn(index);
    else selectRow(index);
    setMenu({ x: e.clientX, y: e.clientY, kind, index });
  };

  // Fill handle: drag from the focused cell to replicate its value + format.
  const startFill = (e: React.MouseEvent) => {
    if (!isEditable || !focused) return;
    e.preventDefault();
    e.stopPropagation();
    const p = parseCellId(focused);
    if (!p) return;
    fillRef.current = { srcId: focused, srcR: p.row, srcC: p.col, r: p.row, c: p.col };
    setFillPreview(normRect(p.row, p.col, p.row, p.col));
    const onUp = () => {
      window.removeEventListener("mouseup", onUp);
      const f = fillRef.current;
      fillRef.current = null;
      setFillPreview(null);
      if (f && (f.r !== f.srcR || f.c !== f.srcC)) {
        commitGrid((grid) => fillRange(grid, f.srcId, f.srcR, f.srcC, f.r, f.c));
        setSelection(normRect(f.srcR, f.srcC, f.r, f.c));
      }
    };
    window.addEventListener("mouseup", onUp);
  };
  const onCellEnter = (r: number, c: number) => {
    if (!fillRef.current) return;
    fillRef.current = { ...fillRef.current, r, c };
    setFillPreview(normRect(fillRef.current.srcR, fillRef.current.srcC, r, c));
  };

  // Clipboard: copy/cut the selected range as TSV; paste spills a TSV block from
  // the anchor. A single cell with a text selection defers to native input behaviour.
  const hasTextSelection = () => {
    const el = document.activeElement;
    return el instanceof HTMLInputElement && el.selectionStart !== el.selectionEnd;
  };
  const isSingleCell = (rect: Rect) => rect.r1 === rect.r2 && rect.c1 === rect.c2;
  const handleCopy = (e: React.ClipboardEvent) => {
    if (!selection || (isSingleCell(selection) && hasTextSelection())) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", rangeToTSV(active, selection.r1, selection.c1, selection.r2, selection.c2));
  };
  const handleCut = (e: React.ClipboardEvent) => {
    if (!isEditable || !selection || (isSingleCell(selection) && hasTextSelection())) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", rangeToTSV(active, selection.r1, selection.c1, selection.r2, selection.c2));
    const rect = selection;
    commitGrid((g) => clearRect(g, rect.r1, rect.c1, rect.r2, rect.c2));
  };
  const handlePaste = (e: React.ClipboardEvent) => {
    if (!isEditable || !selection) return;
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    if (!/[\t\n]/.test(text)) {
      // Single value: native paste while editing; on a selected (read-only) cell,
      // write the pasted text as the cell's value.
      if (editingCell) return;
      if (focused) {
        e.preventDefault();
        setCellValue(focused, text);
      }
      return;
    }
    e.preventDefault();
    const matrix = parseClipboard(text);
    const { r1, c1 } = selection;
    commitGrid((g) => writeMatrix(g, r1, c1, matrix));
    const height = matrix.length;
    const width = Math.max(...matrix.map((row) => row.length));
    setSelection(normRect(r1, c1, r1 + height - 1, c1 + width - 1));
  };

  const menuIcon = "size-4 shrink-0 text-tertiary";
  const menuItems: { label: string; icon: React.ReactNode; run: () => void }[] =
    menu?.kind === "col"
      ? [
          {
            label: "Insert column left",
            icon: <Plus className={menuIcon} />,
            run: () => commitGrid((g) => insertColumn(g, menu.index)),
          },
          {
            label: "Insert column right",
            icon: <Plus className={menuIcon} />,
            run: () => commitGrid((g) => insertColumn(g, menu.index + 1)),
          },
          {
            label: "Delete column",
            icon: <Trash className={menuIcon} />,
            run: () => commitGrid((g) => deleteColumn(g, menu.index)),
          },
          {
            label: "Clear column",
            icon: <Eraser className={menuIcon} />,
            run: () => commitGrid((g) => clearColumn(g, menu.index)),
          },
          {
            label: active.selects?.[menu.index] ? "Edit dropdown…" : "Dropdown…",
            icon: <ChevronDown className={menuIcon} />,
            run: () => setSelectConfig({ col: menu.index, x: menu.x, y: menu.y }),
          },
          ...(active.selects?.[menu.index]
            ? [
                {
                  label: "Remove dropdown",
                  icon: <X className={menuIcon} />,
                  run: () => setColumnSelect(menu.index, null),
                },
              ]
            : []),
          {
            label: `Freeze up to column ${columnLabel(menu.index)}`,
            icon: <Pin className={menuIcon} />,
            run: () => commitGrid((g) => ({ ...g, frozenCols: menu.index + 1 })),
          },
          ...(frozen > 0
            ? [
                {
                  label: "Unfreeze columns",
                  icon: <PinOff className={menuIcon} />,
                  run: () => commitGrid((g) => ({ ...g, frozenCols: 0 })),
                },
              ]
            : []),
        ]
      : menu?.kind === "row"
        ? [
            {
              label: "Insert row above",
              icon: <Plus className={menuIcon} />,
              run: () => commitGrid((g) => insertRow(g, menu.index)),
            },
            {
              label: "Insert row below",
              icon: <Plus className={menuIcon} />,
              run: () => commitGrid((g) => insertRow(g, menu.index + 1)),
            },
            {
              label: "Delete row",
              icon: <Trash className={menuIcon} />,
              run: () => commitGrid((g) => deleteRow(g, menu.index)),
            },
            {
              label: "Clear row",
              icon: <Eraser className={menuIcon} />,
              run: () => commitGrid((g) => clearRow(g, menu.index)),
            },
          ]
        : [];

  return (
    <div ref={rootRef} className="flex h-full w-full flex-col bg-surface-1">
      {/* Title. */}
      <div className="flex flex-shrink-0 items-center border-b border-subtle px-4 py-2.5">
        <input
          type="text"
          value={page.name ?? ""}
          onChange={(e) => page.updateTitle(e.target.value)}
          readOnly={!isEditable}
          maxLength={255}
          placeholder="Untitled sheet"
          aria-label="Sheet name"
          className="w-full min-w-0 flex-1 bg-transparent text-14 font-semibold text-primary outline-none placeholder:text-placeholder read-only:cursor-default"
        />
      </div>

      {/* Formatting toolbar. */}
      {isEditable && (
        <div className="flex flex-shrink-0 flex-wrap items-center gap-0.5 border-b border-subtle px-2 py-1.5">
          <ToolbarButton title="Bold" disabled={!focused} active={!!focusedFormat?.bold} onClick={() => toggle("bold")}>
            <Bold className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            title="Italic"
            disabled={!focused}
            active={!!focusedFormat?.italic}
            onClick={() => toggle("italic")}
          >
            <Italic className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            title="Strikethrough"
            disabled={!focused}
            active={!!focusedFormat?.strike}
            onClick={() => toggle("strike")}
          >
            <Strikethrough className="size-4" />
          </ToolbarButton>
          <ColorMenu
            title="Text color"
            disabled={!focused}
            value={focusedFormat?.color}
            onSelect={(color) => applyFormat({ color })}
            icon={<Type className="size-4" />}
          />
          <ColorMenu
            title="Fill color"
            disabled={!focused}
            value={focusedFormat?.fill}
            palette={FILL_PALETTE}
            onSelect={(fill) => applyFormat({ fill })}
            icon={<PaintBucket className="size-4" />}
          />
          <Separator />
          <NumberFormatMenu
            disabled={!focused}
            numberFormat={focusedFormat?.numberFormat}
            currency={focusedFormat?.currency}
            onSelect={(opt) =>
              applyFormat({ numberFormat: opt.numberFormat, currency: opt.currency, decimals: undefined })
            }
          />
          <ToolbarButton
            title="Format as currency"
            disabled={!focused}
            active={focusedFormat?.numberFormat === "currency"}
            onClick={() => setNumberFormat("currency")}
          >
            <DollarSign className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            title="Format as percent"
            disabled={!focused}
            active={focusedFormat?.numberFormat === "percent"}
            onClick={() => setNumberFormat("percent")}
          >
            <span className="text-13 font-medium">%</span>
          </ToolbarButton>
          <ToolbarButton title="Decrease decimal places" disabled={!focused} onClick={() => bumpDecimals(-1)}>
            <span className="text-11 font-medium tracking-tight">.0</span>
          </ToolbarButton>
          <ToolbarButton title="Increase decimal places" disabled={!focused} onClick={() => bumpDecimals(1)}>
            <span className="text-11 font-medium tracking-tight">.00</span>
          </ToolbarButton>
          <Separator />
          <AlignMenu
            disabled={!focused}
            value={focusedFormat?.align ?? "left"}
            onSelect={(a) => applyFormat({ align: a })}
          />
          <WrapMenu
            disabled={!focused}
            value={focusedFormat?.wrap ?? "overflow"}
            onSelect={(w) => applyFormat({ wrap: w })}
          />
          <BordersMenu disabled={!focused} onApply={applyBordersToSelection} />
          <Separator />
          <ToolbarButton
            title={active.filterEnabled ? "Remove filter" : "Create filter"}
            active={!!active.filterEnabled}
            onClick={toggleFilters}
          >
            <ListFilter className="size-4" />
          </ToolbarButton>
          <Separator />
          <ToolbarButton title="Insert chart from selection" disabled={!selection && !focused} onClick={insertChart}>
            <ChartNoAxesColumn className="size-4" />
          </ToolbarButton>
        </div>
      )}

      {/* Formula bar. */}
      <div className="relative flex flex-shrink-0 items-center gap-2 border-b border-subtle px-4 py-2">
        <span className="font-mono grid h-6 min-w-9 shrink-0 place-items-center rounded-md bg-layer-1 px-1.5 text-11 text-tertiary">
          {focused ?? "—"}
        </span>
        <span
          className="shrink-0 border-l border-subtle pl-2 font-serif text-13 text-tertiary italic select-none"
          aria-hidden
        >
          fx
        </span>
        <div className="relative min-w-0 flex-1">
          {editingFormula && (
            <div
              aria-hidden
              className="font-mono pointer-events-none absolute inset-0 z-0 flex items-center overflow-hidden px-1 text-12 whitespace-pre text-primary"
              style={{ transform: `translateX(${-editScroll}px)` }}
            >
              {renderFormulaText(focusedRaw)}
            </div>
          )}
          <input
            ref={barInputRef}
            type="text"
            value={focusedRaw}
            onChange={(e) => focused && onCellInput(focused, e.target.value, "bar")}
            onKeyDown={(e) => {
              if (handleSuggestKeyDown(e)) return;
              if (e.key === "Enter") {
                // Commit the value/formula back to the sheet.
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            onFocus={() => {
              setBarFocused(true);
              setEditScroll(0);
              if (focused) setFormulaEditing(focusedRaw.startsWith("=") ? { id: focused, source: "bar" } : null);
            }}
            onBlur={() =>
              window.setTimeout(() => {
                setBarFocused(false);
                setShowSuggest(false);
                setFormulaEditing(null);
              }, 120)
            }
            onScroll={(e) => setEditScroll(e.currentTarget.scrollLeft)}
            readOnly={!isEditable || !focused}
            placeholder={focused ? "Value or =formula (e.g. =SUM(A1:A5))" : "Select a cell"}
            aria-label="Formula bar"
            style={{ caretColor: editingFormula ? "var(--txt-primary)" : undefined }}
            className={cn(
              "font-mono relative z-[1] h-6 w-full bg-transparent px-1 text-12 text-primary outline-none placeholder:text-placeholder read-only:cursor-default",
              { "text-transparent": editingFormula }
            )}
          />
          {barFocused && renderSuggestions("left-0 top-full")}
        </div>
      </div>

      {/* Grid + fixed add-column strip on the right. */}
      <div className="flex min-h-0 flex-1">
        <div
          ref={wrapRef}
          onCopy={handleCopy}
          onCut={handleCut}
          onPaste={handlePaste}
          className="relative min-h-0 flex-1 overflow-auto"
        >
          <table className="border-collapse text-12 select-none" style={{ tableLayout: "fixed", width: totalWidth }}>
            <colgroup>
              <col style={{ width: SHEET_ROWNUM_WIDTH }} />
              {cols.map((c) => (
                <col key={c} style={{ width: colWidth(active, c) }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="sticky top-0 left-0 z-20 h-7 border border-subtle bg-layer-1" />
                {cols.map((c) => {
                  const colSelected =
                    selection &&
                    selection.c1 <= c &&
                    c <= selection.c2 &&
                    selection.r2 - selection.r1 >= renderRows - 2;
                  const isFrozen = c < frozen;
                  const thStyle: React.CSSProperties = {};
                  if (isFrozen) {
                    thStyle.left = colLeft[c];
                    thStyle.zIndex = 20;
                  }
                  if (c === frozen - 1) thStyle.boxShadow = "inset -2px 0 0 0 rgba(0,0,0,0.22)";
                  const isDragging = colDrag?.from === c;
                  const isDropOver = colDrag && colDrag.over === c && colDrag.from !== c;
                  if (isDropOver) {
                    // Drop indicator: pink bar on the side the column will land.
                    thStyle.boxShadow = `inset ${colDrag.from < c ? "-3px" : "3px"} 0 0 0 ${SEL_BORDER}`;
                  }
                  return (
                    <th
                      key={c}
                      data-col={c}
                      onClick={() => {
                        if (didDragColRef.current) {
                          didDragColRef.current = false;
                          return;
                        }
                        selectColumn(c);
                      }}
                      onMouseDown={(e) => startColDrag(e, c)}
                      onContextMenu={(e) => openMenu(e, "col", c)}
                      style={Object.keys(thStyle).length ? thStyle : undefined}
                      className={cn(
                        "font-normal sticky top-0 z-10 h-7 cursor-grab border border-subtle bg-layer-1 text-center text-tertiary hover:bg-layer-2",
                        { "bg-accent-primary/15 text-primary": colSelected, "opacity-50": isDragging }
                      )}
                    >
                      <span className="pointer-events-none block truncate px-2">{columnLabel(c)}</span>
                      {active.filterEnabled && (
                        <button
                          type="button"
                          title="Filter column"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            setFilterMenu((m) => (m?.col === c ? null : { col: c, x: rect.left, y: rect.bottom }));
                          }}
                          className={cn(
                            "absolute top-1/2 left-0.5 z-10 grid size-4 -translate-y-1/2 place-items-center rounded hover:bg-layer-3",
                            isColumnFiltered(active.filters?.[c]) ? "text-accent-primary" : "text-tertiary"
                          )}
                        >
                          <ListFilter className="size-3" />
                        </button>
                      )}
                      {isEditable && (
                        <span
                          onMouseDown={(e) => startResize(e, c)}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            autoFitColumn(c);
                          }}
                          title="Drag to resize · double-click to fit"
                          className="absolute top-0 -right-1 z-10 h-full w-2 cursor-col-resize hover:bg-accent-primary/40"
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows
                .filter((r) => r >= active.rows || rowPassesFilters(active, r))
                .map((r) => {
                  const rowSelected =
                    selection &&
                    selection.r1 <= r &&
                    r <= selection.r2 &&
                    selection.c2 - selection.c1 >= renderCols - 2;
                  return (
                    <tr key={r}>
                      <td
                        onClick={() => selectRow(r)}
                        onContextMenu={(e) => openMenu(e, "row", r)}
                        className={cn(
                          "sticky left-0 z-10 h-7 cursor-pointer border border-subtle bg-layer-1 text-center text-tertiary hover:bg-layer-2",
                          { "bg-accent-primary/15 text-primary": rowSelected }
                        )}
                      >
                        {r + 1}
                      </td>
                      {cols.map((c) => {
                        const id = cellId(r, c);
                        const isFocused = focused === id;
                        const isEditing = editingCell === id;
                        const fmt = active.formats?.[id];
                        const colSelect = active.selects?.[c];
                        // Row 0 of a dropdown column is its header/label — keep it a normal
                        // (editable, formattable) text cell; only data rows render as pills.
                        const pillCell = !!colSelect && r > 0;
                        // Selected-but-not-editing cells keep showing the computed value;
                        // the raw text/formula only appears while actually editing.
                        const display = isEditing
                          ? (active.cells[id] ?? "")
                          : formatDisplayValue(computeCell(id, active.cells), fmt);
                        // A non-editing cell whose value is a URL renders as a link chip.
                        const cellLink = !isEditing && !pillCell ? parseCellUrl(display) : null;
                        const wrapMode = fmt?.wrap;
                        // "wrap"/"clip" render via an in-flow div (which sizes the row);
                        // the input is then overlaid for editing. Default is input-only.
                        const layered = wrapMode === "wrap" || wrapMode === "clip";
                        const textStyle: React.CSSProperties = {
                          fontWeight: fmt?.bold ? 600 : undefined,
                          fontStyle: fmt?.italic ? "italic" : undefined,
                          textDecoration: fmt?.strike ? "line-through" : undefined,
                          // Fills use light tints, so keep text dark (readable in every theme).
                          color: fmt?.color || (fmt?.fill ? "#1c1e26" : undefined),
                          textAlign: fmt?.align,
                        };
                        const selected = !!selection && inRect(selection, r, c);
                        const inFill = inRect(fillPreview, r, c);
                        const fref = editingFormula
                          ? formulaRefs.find((rf) => r >= rf.r1 && r <= rf.r2 && c >= rf.c1 && c <= rf.c2)
                          : undefined;
                        const isFrozen = c < frozen;
                        const tdStyle: React.CSSProperties = {};
                        if (fmt?.fill) tdStyle.backgroundColor = fmt.fill;
                        if (isFrozen) {
                          tdStyle.position = "sticky";
                          tdStyle.left = colLeft[c];
                          tdStyle.zIndex = 5;
                        }
                        if (c === frozen - 1) tdStyle.boxShadow = "inset -2px 0 0 0 rgba(0,0,0,0.22)";
                        return (
                          <td
                            key={c}
                            onMouseEnter={() => onCellEnter(r, c)}
                            style={Object.keys(tdStyle).length ? tdStyle : undefined}
                            className={cn(
                              "group relative border border-subtle p-0",
                              layered ? "min-h-7 align-top" : "h-7",
                              {
                                "bg-canvas": isFrozen && !fmt?.fill,
                              }
                            )}
                          >
                            {pillCell ? (
                              <button
                                type="button"
                                id={`sheet-cell-${id}`}
                                onClick={(e) => {
                                  if (!isEditable) return;
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setFocused(id);
                                  setSelection({ r1: r, c1: c, r2: r, c2: c });
                                  stopEditing();
                                  setPickCell((p) =>
                                    p?.id === id ? null : { id, col: c, x: rect.left, y: rect.bottom }
                                  );
                                }}
                                className="relative z-0 flex h-full w-full items-center gap-1 overflow-hidden px-1.5 text-left"
                              >
                                {parseSelected(active.cells[id] ?? "").map((v) => {
                                  const opt = colSelect.options.find((o) => o.value === v);
                                  return (
                                    <span
                                      key={v}
                                      className="shrink-0 rounded-full px-1.5 py-0.5 text-11 text-[#1c1e26]"
                                      style={{ backgroundColor: opt?.color ?? "#e5e7eb" }}
                                    >
                                      {v}
                                    </span>
                                  );
                                })}
                              </button>
                            ) : (
                              <>
                                {layered && (
                                  <div
                                    aria-hidden
                                    style={textStyle}
                                    className={cn(
                                      "px-2 py-1 text-12 text-primary",
                                      wrapMode === "wrap" ? "break-words whitespace-pre-wrap" : "truncate",
                                      {
                                        invisible: isEditing,
                                      }
                                    )}
                                  >
                                    {display || " "}
                                  </div>
                                )}
                                {isEditing && editingFormula && (
                                  <div
                                    aria-hidden
                                    className="font-mono pointer-events-none absolute inset-0 z-0 flex items-center overflow-hidden px-2 text-12 whitespace-pre text-primary"
                                    style={{ transform: `translateX(${-editScroll}px)` }}
                                  >
                                    {renderFormulaText(display)}
                                  </div>
                                )}
                                <input
                                  id={`sheet-cell-${id}`}
                                  type="text"
                                  value={display}
                                  readOnly={!isEditable || !isEditing}
                                  onMouseDown={(e) => {
                                    // While editing a formula, clicking another cell inserts its
                                    // reference instead of moving focus.
                                    if (formulaEditing && formulaEditing.id !== id) {
                                      e.preventDefault();
                                      insertRef(id);
                                      return;
                                    }
                                    if (e.shiftKey && focused) {
                                      // Extend the selection from the anchor to this cell.
                                      e.preventDefault();
                                      const a = parseCellId(focused);
                                      if (a) setSelection(normRect(a.row, a.col, r, c));
                                      selectionActiveRef.current = { row: r, col: c };
                                      return;
                                    }
                                    if (editingCell !== id) {
                                      // First click only selects — no caret until a double-click
                                      // (or typing) starts an edit.
                                      e.preventDefault();
                                      e.currentTarget.focus();
                                    }
                                  }}
                                  onDoubleClick={() => {
                                    if (!isEditable || editingCell === id) return;
                                    startEditing(id, "end");
                                  }}
                                  onFocus={() => {
                                    setFocused(id);
                                    setSelection({ r1: r, c1: c, r2: r, c2: c });
                                    selectionActiveRef.current = null;
                                    setShowSuggest(false);
                                    setEditScroll(0);
                                    editOriginalRef.current = active.cells[id] ?? "";
                                    if (editingCell !== id) {
                                      // Focus landed on a new cell → plain selection, end any edit.
                                      setEditingCell(null);
                                      setFormulaEditing(null);
                                    }
                                  }}
                                  onBlur={() =>
                                    window.setTimeout(() => {
                                      setShowSuggest(false);
                                      setFormulaEditing(null);
                                    }, 120)
                                  }
                                  onChange={(e) => onCellInput(id, e.target.value)}
                                  onKeyDown={(e) => handleCellKeyDown(e, r, c)}
                                  onScroll={(e) => setEditScroll(e.currentTarget.scrollLeft)}
                                  style={{
                                    ...textStyle,
                                    caretColor: isEditing && editingFormula ? "var(--txt-primary)" : undefined,
                                  }}
                                  className={cn(
                                    "z-0 w-full bg-transparent px-2 text-12 text-primary outline-none",
                                    layered ? "absolute inset-0 h-full" : "relative h-full",
                                    isEditing ? "cursor-text" : "cursor-default caret-transparent select-none",
                                    {
                                      "font-mono": isEditing && display.startsWith("="),
                                      // Hide the input's own text so the colored overlay shows (caret stays visible).
                                      "text-transparent": isEditing && editingFormula,
                                      "text-transparent caret-transparent": (layered && !isEditing) || !!cellLink,
                                    }
                                  )}
                                />
                                {cellLink && (
                                  <>
                                    {/* Display-only chip (clicks fall through to the input so the
                                cell still selects / edits); an open button appears on hover. */}
                                    <span
                                      aria-hidden
                                      style={{
                                        justifyContent:
                                          fmt?.align === "center"
                                            ? "center"
                                            : fmt?.align === "right"
                                              ? "flex-end"
                                              : "flex-start",
                                      }}
                                      className="pointer-events-none absolute inset-0 z-[1] flex items-center gap-1.5 overflow-hidden pr-6 pl-2"
                                    >
                                      <img
                                        src={faviconUrl(cellLink.host)}
                                        alt=""
                                        className="size-3.5 shrink-0 rounded-sm"
                                        onError={(e) => {
                                          e.currentTarget.style.display = "none";
                                        }}
                                      />
                                      <span className="decoration-accent-primary/40 truncate text-12 text-accent-primary underline underline-offset-2">
                                        {cellLink.host}
                                      </span>
                                    </span>
                                    <a
                                      href={cellLink.href}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title={`Open ${cellLink.href}`}
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClick={(e) => e.stopPropagation()}
                                      className="absolute top-1/2 right-0.5 z-[4] grid size-5 -translate-y-1/2 place-items-center rounded text-tertiary opacity-0 transition-opacity group-hover:opacity-100 hover:bg-layer-2 hover:text-primary focus:opacity-100"
                                    >
                                      <ExternalLink className="size-3.5" />
                                    </a>
                                  </>
                                )}
                              </>
                            )}
                            {fmt?.border && (
                              <span
                                aria-hidden
                                className="pointer-events-none absolute -inset-px z-[1]"
                                style={{
                                  borderTop: fmt.border.top
                                    ? `${fmt.border.width}px ${fmt.border.style} ${fmt.border.color}`
                                    : undefined,
                                  borderRight: fmt.border.right
                                    ? `${fmt.border.width}px ${fmt.border.style} ${fmt.border.color}`
                                    : undefined,
                                  borderBottom: fmt.border.bottom
                                    ? `${fmt.border.width}px ${fmt.border.style} ${fmt.border.color}`
                                    : undefined,
                                  borderLeft: fmt.border.left
                                    ? `${fmt.border.width}px ${fmt.border.style} ${fmt.border.color}`
                                    : undefined,
                                }}
                              />
                            )}
                            {selected && selection && (
                              // -inset-px so the pink border covers the cell's own gray border.
                              <span
                                className="pointer-events-none absolute -inset-px z-[2]"
                                style={{
                                  backgroundColor: isFocused ? undefined : "rgba(236,72,153,0.1)",
                                  boxShadow: selectionBorder(selection, r, c),
                                }}
                              />
                            )}
                            {inFill && !selected && (
                              <span className="pointer-events-none absolute inset-0 z-[2] bg-accent-primary/20" />
                            )}
                            {fref && (
                              <span
                                className="pointer-events-none absolute -inset-px z-[3]"
                                style={{
                                  backgroundColor: `${fref.color}1a`,
                                  boxShadow: rectBorder(
                                    { r1: fref.r1, c1: fref.c1, r2: fref.r2, c2: fref.c2 },
                                    r,
                                    c,
                                    fref.color
                                  ),
                                }}
                              />
                            )}
                            {isEditable && selection && r === selection.r2 && c === selection.c2 && (
                              <span
                                onMouseDown={startFill}
                                title="Drag to fill"
                                className="absolute -right-[3px] -bottom-[3px] z-10 size-[7px] cursor-crosshair rounded-[1px] border border-[var(--bg-surface-1)] bg-accent-primary"
                              />
                            )}
                            {isEditing && !barFocused && renderSuggestions("left-0 top-full")}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
            </tbody>
          </table>
          {(active.charts ?? []).map((chart) => (
            <SheetChartCard
              key={chart.id}
              chart={chart}
              grid={active}
              isEditable={isEditable}
              selectionRange={selectionRangeRef}
              onUpdate={(patch) => updateChart(chart.id, patch)}
              onDelete={() => deleteChart(chart.id)}
            />
          ))}
        </div>
        {isEditable && (
          <button
            type="button"
            onClick={addColumn}
            title="Add column"
            className="flex w-8 flex-shrink-0 items-center justify-center border-l border-subtle bg-surface-1 text-tertiary transition-colors hover:bg-layer-1 hover:text-primary"
          >
            <Plus className="size-3.5" />
          </button>
        )}
      </div>

      {/* Add-row control — pinned below the grid. */}
      {isEditable && (
        <button
          type="button"
          onClick={addRow}
          title="Add row"
          className="flex h-7 flex-shrink-0 items-center gap-1.5 border-t border-b border-subtle bg-surface-1 pl-3 text-11 text-tertiary transition-colors hover:bg-layer-1 hover:text-primary"
        >
          <Plus className="size-3.5" />
          <span>Add row</span>
        </button>
      )}

      {/* Sheet tabs. */}
      <div
        ref={tabBarRef}
        className="flex flex-shrink-0 items-center gap-1 overflow-x-auto border-t border-subtle bg-surface-1 px-2 py-1.5"
      >
        {snapshot.sheets.map((sheet, sheetIndex) => {
          const isActive = sheet.id === snapshot.activeId;
          const isRenaming = renaming?.id === sheet.id;
          const isTabDragging = tabDrag?.from === sheetIndex;
          // Drop indicator: a line before this tab (or after the last one), shown
          // only when the drop would actually change the order.
          const dropNoop = !tabDrag || tabDropDest(tabDrag.from, tabDrag.over) === tabDrag.from;
          const showLineBefore = !!tabDrag && !dropNoop && tabDrag.over === sheetIndex;
          const showLineAfter =
            !!tabDrag &&
            !dropNoop &&
            tabDrag.over === snapshot.sheets.length &&
            sheetIndex === snapshot.sheets.length - 1;
          return (
            <div
              key={sheet.id}
              data-tab={sheetIndex}
              onMouseDown={(e) => {
                if (!isRenaming) startTabDrag(e, sheetIndex);
              }}
              onContextMenu={(e) => {
                if (!isEditable) return;
                e.preventDefault();
                setMenu(null);
                setTabMenu({ x: e.clientX, y: e.clientY, index: sheetIndex });
              }}
              className={cn(
                "group relative flex flex-shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-12 transition-colors select-none",
                tabDrag ? "cursor-grabbing" : "cursor-grab",
                sheet.color
                  ? cn(
                      "text-[#1c1e26]",
                      isActive ? "border-strong font-medium" : "border-transparent hover:border-subtle"
                    )
                  : isActive
                    ? "border-subtle bg-layer-2 font-medium text-primary"
                    : "border-transparent text-tertiary hover:bg-layer-1 hover:text-primary",
                { "opacity-40": isTabDragging }
              )}
              style={sheet.color ? { backgroundColor: sheet.color } : undefined}
            >
              {/* Insertion line showing where the dragged tab will drop. */}
              {(showLineBefore || showLineAfter) && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0.5 z-10 w-[3px] rounded-full bg-accent-primary"
                  style={{ [showLineAfter ? "right" : "left"]: -3 }}
                />
              )}
              {isRenaming ? (
                <input
                  autoFocus
                  value={renaming.value}
                  onChange={(e) => setRenaming({ id: sheet.id, value: e.target.value })}
                  onBlur={() => {
                    renameSheet(sheet.id, renaming.value);
                    setRenaming(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  className="w-20 bg-transparent text-12 text-primary outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (didDragTabRef.current) {
                      didDragTabRef.current = false;
                      return;
                    }
                    switchSheet(sheet.id);
                  }}
                  onDoubleClick={() => isEditable && setRenaming({ id: sheet.id, value: sheet.name })}
                  className="max-w-[160px] truncate"
                >
                  {sheet.name}
                </button>
              )}
            </div>
          );
        })}
        {isEditable && (
          <button
            type="button"
            onClick={addSheet}
            title="Add sheet"
            className="grid size-6 flex-shrink-0 place-items-center rounded-md text-tertiary hover:bg-layer-1 hover:text-primary"
          >
            <Plus className="size-4" />
          </button>
        )}
      </div>

      {/* Right-click context menu for row / column headers. */}
      {menu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu(null);
            }}
          />
          <div
            className="shadow-lg fixed z-50 min-w-44 rounded-lg border border-subtle bg-surface-1 py-1"
            style={{ top: menu.y, left: menu.x }}
          >
            {menuItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  item.run();
                  setMenu(null);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-12 text-primary hover:bg-layer-1"
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Right-click context menu for sheet tabs. */}
      {tabMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setTabMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setTabMenu(null);
            }}
          />
          <div
            // The tab bar sits at the bottom of the viewport, so a menu opening
            // downward gets clipped. Measure it and flip up / clamp into view.
            ref={(el) => {
              if (!el) return;
              const pad = 8;
              const r = el.getBoundingClientRect();
              const left = Math.max(pad, Math.min(tabMenu.x, window.innerWidth - r.width - pad));
              const top =
                tabMenu.y + r.height > window.innerHeight - pad ? Math.max(pad, tabMenu.y - r.height) : tabMenu.y;
              el.style.left = `${left}px`;
              el.style.top = `${top}px`;
            }}
            className="shadow-lg fixed z-50 min-w-44 rounded-lg border border-subtle bg-surface-1 py-1"
            style={{ top: tabMenu.y, left: tabMenu.x }}
          >
            {(() => {
              const idx = tabMenu.index;
              const last = snapshot.sheets.length - 1;
              const run = (fn: () => void) => () => {
                fn();
                setTabMenu(null);
              };
              const item = (icon: React.ReactNode, label: string, onClick: () => void, disabled = false) => (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={onClick}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-12 text-primary hover:bg-layer-1 disabled:pointer-events-none disabled:opacity-40"
                >
                  {icon}
                  <span>{label}</span>
                </button>
              );
              const sep = <div className="my-1 border-t border-subtle" />;
              return (
                <>
                  {item(
                    <Copy className={menuIcon} />,
                    "Duplicate",
                    run(() => duplicateSheet(idx))
                  )}
                  {item(
                    <Pencil className={menuIcon} />,
                    "Rename",
                    run(() => setRenaming({ id: snapshot.sheets[idx].id, value: snapshot.sheets[idx].name }))
                  )}
                  {item(
                    <Trash className={menuIcon} />,
                    "Delete",
                    run(() => deleteSheet(snapshot.sheets[idx].id)),
                    snapshot.sheets.length <= 1
                  )}
                  {sep}
                  <div className="px-3 pt-0.5 pb-1 text-11 text-tertiary">Tab color</div>
                  <div className="grid grid-cols-6 gap-1.5 px-3 pb-2">
                    {FILL_PALETTE.map((c) => (
                      <button
                        key={c}
                        type="button"
                        title={c}
                        onClick={run(() => setSheetColor(idx, c))}
                        className={cn(
                          "grid size-5 place-items-center rounded-full border border-subtle transition-transform hover:scale-110",
                          {
                            "ring-primary ring-1 ring-offset-1": snapshot.sheets[idx].color === c,
                          }
                        )}
                        style={{ backgroundColor: c }}
                      >
                        {snapshot.sheets[idx].color === c && <Check className="size-3 text-primary" />}
                      </button>
                    ))}
                    <button
                      type="button"
                      title="No color"
                      onClick={run(() => setSheetColor(idx, undefined))}
                      className="grid size-5 place-items-center rounded-full border border-subtle text-tertiary hover:text-primary"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                  {sep}
                  {item(
                    <ArrowLeft className={menuIcon} />,
                    "Move left",
                    run(() => moveSheet(idx, idx - 1)),
                    idx === 0
                  )}
                  {item(
                    <ArrowRight className={menuIcon} />,
                    "Move right",
                    run(() => moveSheet(idx, idx + 1)),
                    idx === last
                  )}
                </>
              );
            })()}
          </div>
        </>
      )}

      {/* Column filter dropdown. */}
      {filterMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setFilterMenu(null)} />
          <FilterMenu
            x={filterMenu.x}
            y={filterMenu.y}
            values={columnDistinctValues(active, filterMenu.col)}
            filter={active.filters?.[filterMenu.col]}
            onChange={(f) => setColumnFilter(filterMenu.col, f)}
          />
        </>
      )}

      {/* Dropdown-column config popover. */}
      {selectConfig && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setSelectConfig(null)} />
          <SelectConfigMenu
            x={selectConfig.x}
            y={selectConfig.y}
            config={active.selects?.[selectConfig.col]}
            onChange={(cfg) => setColumnSelect(selectConfig.col, cfg)}
          />
        </>
      )}

      {/* Pill-cell option picker. */}
      {pickCell && active.selects?.[pickCell.col] && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPickCell(null)} />
          <PillPicker
            x={pickCell.x}
            y={pickCell.y}
            options={active.selects[pickCell.col].options}
            selected={parseSelected(active.cells[pickCell.id] ?? "")}
            onToggle={(v) => toggleSelectValue(pickCell.id, v, active.selects?.[pickCell.col]?.multi ?? false)}
          />
        </>
      )}

      {/* Floating tab preview that follows the cursor while reordering. */}
      {tabDrag && snapshot.sheets[tabDrag.from] && (
        <div
          aria-hidden
          className="shadow-lg pointer-events-none fixed z-[60] flex items-center gap-1 rounded-md border border-subtle bg-surface-1 px-2 py-1 text-12 font-medium text-primary"
          style={{
            left: tabDrag.x,
            top: tabDrag.y,
            width: tabDrag.width,
            height: tabDrag.height,
            transform: "rotate(-2deg)",
          }}
        >
          <span className="truncate">{snapshot.sheets[tabDrag.from].name}</span>
        </div>
      )}
    </div>
  );
});

const Separator = () => <span className="bg-subtle mx-1 h-5 w-px flex-shrink-0" />;

type FilterMenuProps = {
  x: number;
  y: number;
  values: string[];
  filter: TColumnFilter | undefined;
  onChange: (filter: TColumnFilter | null) => void;
};

function FilterMenu({ x, y, values, filter, onChange }: FilterMenuProps) {
  const hidden = new Set(filter?.hidden ?? []);
  const query = filter?.query ?? "";
  const shown = values.filter((v) => v.toLowerCase().includes(query.toLowerCase()));

  const toggle = (v: string) => {
    const next = new Set(hidden);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange({ query, hidden: [...next] });
  };

  return (
    <div
      className="shadow-lg fixed z-50 flex max-h-80 w-60 flex-col rounded-lg border border-subtle bg-surface-1 p-2"
      style={{ top: y + 2, left: x }}
    >
      <input
        type="text"
        autoFocus
        value={query}
        onChange={(e) => onChange({ query: e.target.value, hidden: [...hidden] })}
        placeholder="Search values"
        className="mb-1.5 h-7 w-full rounded-md border border-subtle bg-canvas px-2 text-12 text-primary outline-none placeholder:text-placeholder focus:border-strong"
      />
      <div className="mb-1 flex items-center justify-between px-1 text-11 text-tertiary">
        <button type="button" className="hover:text-primary" onClick={() => onChange({ query, hidden: [] })}>
          Select all
        </button>
        <button type="button" className="hover:text-primary" onClick={() => onChange({ query, hidden: [...values] })}>
          Clear
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {shown.length === 0 ? (
          <p className="px-2 py-2 text-11 text-placeholder italic">No values</p>
        ) : (
          shown.map((v) => (
            <label
              key={v}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-12 text-primary hover:bg-layer-1"
            >
              <input
                type="checkbox"
                checked={!hidden.has(v)}
                onChange={() => toggle(v)}
                className="size-3.5"
                style={{ accentColor: "#ec4899" }}
              />
              <span className="truncate">{v === "" ? "(blank)" : v}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}

type ToolbarButtonProps = {
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
};

function ToolbarButton({ title, active, disabled, onClick, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid size-7 flex-shrink-0 place-items-center rounded-md text-tertiary transition-colors hover:bg-layer-1 hover:text-primary disabled:pointer-events-none disabled:opacity-40",
        { "bg-layer-2 text-primary": active }
      )}
    >
      {children}
    </button>
  );
}

const ALIGN_OPTIONS = [
  { key: "left" as const, Icon: AlignLeft, label: "Left" },
  { key: "center" as const, Icon: AlignCenter, label: "Center" },
  { key: "right" as const, Icon: AlignRight, label: "Right" },
];

type AlignMenuProps = {
  disabled?: boolean;
  value: "left" | "center" | "right";
  onSelect: (align: "left" | "center" | "right") => void;
};

function AlignMenu({ disabled, value, onSelect }: AlignMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const Current = ALIGN_OPTIONS.find((o) => o.key === value)?.Icon ?? AlignLeft;

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        title="Horizontal align"
        aria-label="Horizontal align"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-7 items-center gap-0.5 rounded-md px-1.5 text-tertiary transition-colors hover:bg-layer-1 hover:text-primary disabled:pointer-events-none disabled:opacity-40",
          { "bg-layer-2 text-primary": open }
        )}
      >
        <Current className="size-4" />
        <ChevronDown className="size-3" />
      </button>
      {open && (
        <div className="shadow-lg absolute top-full left-0 z-30 mt-1 flex gap-0.5 rounded-lg border border-subtle bg-surface-1 p-1">
          {ALIGN_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              title={`Align ${o.label.toLowerCase()}`}
              onClick={() => {
                onSelect(o.key);
                setOpen(false);
              }}
              className={cn(
                "grid size-7 place-items-center rounded-md text-tertiary hover:bg-layer-1 hover:text-primary",
                {
                  "bg-layer-2 text-primary": value === o.key,
                }
              )}
            >
              <o.Icon className="size-4" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const WrapGlyph = () => (
  <svg
    viewBox="0 0 16 16"
    className="size-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M2 3.5h12" />
    <path d="M2 8h9.5a2.5 2.5 0 0 1 0 5H8.5" />
    <path d="M10.5 11l-2 2 2 2" />
    <path d="M2 12.5h3.5" />
  </svg>
);

const WRAP_OPTIONS = [
  { key: "overflow" as const, label: "Overflow" },
  { key: "wrap" as const, label: "Wrap" },
  { key: "clip" as const, label: "Clip" },
];

type WrapMenuProps = {
  disabled?: boolean;
  value: "overflow" | "wrap" | "clip";
  onSelect: (wrap: "overflow" | "wrap" | "clip") => void;
};

function WrapMenu({ disabled, value, onSelect }: WrapMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        title="Text wrapping"
        aria-label="Text wrapping"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-7 items-center gap-0.5 rounded-md px-1.5 text-tertiary transition-colors hover:bg-layer-1 hover:text-primary disabled:pointer-events-none disabled:opacity-40",
          { "bg-layer-2 text-primary": open }
        )}
      >
        <WrapGlyph />
        <ChevronDown className="size-3" />
      </button>
      {open && (
        <div className="shadow-lg absolute top-full left-0 z-30 mt-1 w-36 rounded-lg border border-subtle bg-surface-1 py-1">
          {WRAP_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => {
                onSelect(o.key);
                setOpen(false);
              }}
              className={cn(
                "block w-full px-3 py-1.5 text-left text-12 hover:bg-layer-1",
                value === o.key ? "text-primary" : "text-secondary"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type SelectConfigMenuProps = {
  x: number;
  y: number;
  config: TColumnSelect | undefined;
  onChange: (config: TColumnSelect | null) => void;
};

function SelectConfigMenu({ x, y, config, onChange }: SelectConfigMenuProps) {
  const [options, setOptions] = useState<TSelectOption[]>(config?.options ?? [{ value: "", color: FILL_PALETTE[0] }]);
  const [multi, setMulti] = useState(config?.multi ?? true);
  const commit = (opts: TSelectOption[], m: boolean) => {
    setOptions(opts);
    setMulti(m);
    const clean = opts.filter((o) => o.value.trim());
    onChange(clean.length ? { options: clean, multi: m } : null);
  };

  return (
    <div
      className="shadow-lg fixed z-50 w-64 rounded-lg border border-subtle bg-surface-1 p-2"
      style={{ top: y + 2, left: x }}
    >
      <div className="mb-1 px-1 text-11 font-medium text-tertiary">Dropdown options</div>
      <div className="max-h-56 space-y-1 overflow-y-auto">
        {options.map((o, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <button
              type="button"
              title="Cycle color"
              onClick={() => {
                const idx = FILL_PALETTE.indexOf(o.color);
                const color = FILL_PALETTE[(idx + 1) % FILL_PALETTE.length];
                commit(
                  options.map((op, j) => (j === i ? { ...op, color } : op)),
                  multi
                );
              }}
              className="size-5 shrink-0 rounded-full border border-subtle"
              style={{ backgroundColor: o.color }}
            />
            <input
              type="text"
              value={o.value}
              placeholder="Option"
              onChange={(e) =>
                commit(
                  options.map((op, j) => (j === i ? { ...op, value: e.target.value } : op)),
                  multi
                )
              }
              className="h-7 min-w-0 flex-1 rounded-md border border-subtle bg-canvas px-2 text-12 text-primary outline-none focus:border-strong"
            />
            <button
              type="button"
              title="Remove"
              onClick={() =>
                commit(
                  options.filter((_, j) => j !== i),
                  multi
                )
              }
              className="grid size-5 shrink-0 place-items-center rounded text-tertiary hover:bg-layer-1 hover:text-primary"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() =>
          commit([...options, { value: "", color: FILL_PALETTE[options.length % FILL_PALETTE.length] }], multi)
        }
        className="mt-1.5 flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-12 text-tertiary hover:bg-layer-1 hover:text-primary"
      >
        <Plus className="size-3.5" /> Add option
      </button>
      <label className="mt-1 flex cursor-pointer items-center gap-2 border-t border-subtle px-2 pt-2 text-12 text-primary">
        <input
          type="checkbox"
          checked={multi}
          onChange={(e) => commit(options, e.target.checked)}
          className="size-3.5"
          style={{ accentColor: "#ec4899" }}
        />
        Allow multiple
      </label>
    </div>
  );
}

type PillPickerProps = {
  x: number;
  y: number;
  options: TSelectOption[];
  selected: string[];
  onToggle: (value: string) => void;
};

function PillPicker({ x, y, options, selected, onToggle }: PillPickerProps) {
  return (
    <div
      className="shadow-lg fixed z-50 max-h-64 w-52 overflow-y-auto rounded-lg border border-subtle bg-surface-1 p-1"
      style={{ top: y + 2, left: x }}
    >
      {options.length === 0 ? (
        <p className="px-2 py-2 text-11 text-placeholder italic">No options</p>
      ) : (
        options.map((o) => {
          const on = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onToggle(o.value)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-layer-1"
            >
              <span
                className={cn(
                  "grid size-4 shrink-0 place-items-center rounded border",
                  on ? "border-accent-primary text-accent-primary" : "border-subtle text-transparent"
                )}
              >
                {on && <Check className="size-3" />}
              </span>
              <span
                className="shrink-0 rounded-full px-1.5 py-0.5 text-11 text-[#1c1e26]"
                style={{ backgroundColor: o.color }}
              >
                {o.value}
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}

type NumberFormatMenuProps = {
  disabled?: boolean;
  numberFormat?: TCellNumberFormat;
  currency?: string;
  onSelect: (opt: TNumberFormatOption) => void;
};

function NumberFormatMenu({ disabled, numberFormat, currency, onSelect }: NumberFormatMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        title="Number format"
        aria-label="Number format"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "grid h-7 min-w-8 place-items-center rounded-md px-1.5 text-12 font-medium text-tertiary transition-colors hover:bg-layer-1 hover:text-primary disabled:pointer-events-none disabled:opacity-40",
          { "bg-layer-2 text-primary": open }
        )}
      >
        123
      </button>
      {open && (
        <div className="shadow-lg absolute top-full left-0 z-30 mt-1 max-h-[60vh] w-64 overflow-auto rounded-lg border border-subtle bg-surface-1 py-1">
          {NUMBER_FORMAT_GROUPS.map((group, gi) => (
            <div key={gi} className={cn({ "border-t border-subtle": gi > 0 })}>
              {group.map((f) => {
                const active = f.numberFormat === numberFormat && (f.currency ?? undefined) === (currency ?? undefined);
                return (
                  <button
                    key={f.label}
                    type="button"
                    onClick={() => {
                      onSelect(f);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left text-12 hover:bg-layer-1",
                      active ? "text-primary" : "text-secondary"
                    )}
                  >
                    <span className="truncate">{f.label}</span>
                    {f.sample && <span className="shrink-0 text-tertiary">{f.sample}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type ColorMenuProps = {
  title: string;
  disabled?: boolean;
  value?: string;
  icon: React.ReactNode;
  palette?: string[];
  onSelect: (color: string | undefined) => void;
};

function ColorMenu({ title, disabled, value, icon, palette = PALETTE, onSelect }: ColorMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        title={title}
        aria-label={title}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-7 flex-col items-center justify-center gap-0.5 rounded-md px-1.5 text-tertiary transition-colors hover:bg-layer-1 hover:text-primary disabled:pointer-events-none disabled:opacity-40",
          { "bg-layer-2 text-primary": open }
        )}
      >
        {icon}
        <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: value || "transparent" }} />
      </button>
      {open && (
        <div className="shadow-lg absolute top-full left-0 z-30 mt-1 w-max rounded-lg border border-subtle bg-surface-1 p-2">
          <div className="grid grid-cols-5 gap-1">
            {palette.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                onClick={() => {
                  onSelect(c);
                  setOpen(false);
                }}
                className={cn("size-5 rounded-md border border-subtle transition-transform hover:scale-110", {
                  "ring-accent-primary ring-1 ring-offset-1": value === c,
                })}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-11 text-tertiary hover:bg-layer-1 hover:text-primary">
            <input
              type="color"
              value={value || "#000000"}
              onChange={(e) => onSelect(e.target.value)}
              className="size-5 cursor-pointer rounded border border-subtle bg-transparent p-0"
            />
            <span>Custom…</span>
          </label>
          <button
            type="button"
            onClick={() => {
              onSelect(undefined);
              setOpen(false);
            }}
            className="mt-1 w-full rounded-md px-2 py-1 text-left text-11 text-tertiary hover:bg-layer-1 hover:text-primary"
          >
            Reset
          </button>
        </div>
      )}
    </div>
  );
}

const BORDER_PALETTE = ["#000000", "#5f6368", "#c5221f", "#e8710a", "#188038", "#1a73e8", "#9334e6", "#ffffff"];

/** A 16×16 preview of which edges a border position fills. */
function BorderIcon({ position }: { position: TBorderPosition }) {
  const on = "currentColor";
  const off = "var(--color-border-subtle, #d1d5db)";
  const e = {
    top: position === "all" || position === "outer" || position === "top",
    bottom: position === "all" || position === "outer" || position === "bottom",
    left: position === "all" || position === "outer" || position === "left",
    right: position === "all" || position === "outer" || position === "right",
  };
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" strokeWidth={1.5}>
      {/* faint full box */}
      <rect x="2.5" y="2.5" width="11" height="11" stroke={off} />
      {position === "inner" && <path d="M8 2.5V13.5M2.5 8H13.5" stroke={on} strokeDasharray="1.5 1.5" />}
      {e.top && <path d="M2.5 2.5H13.5" stroke={on} />}
      {e.bottom && <path d="M2.5 13.5H13.5" stroke={on} />}
      {e.left && <path d="M2.5 2.5V13.5" stroke={on} />}
      {e.right && <path d="M13.5 2.5V13.5" stroke={on} />}
      {position === "none" && <path d="M4 12L12 4" stroke="#c5221f" />}
    </svg>
  );
}

type BordersMenuProps = {
  disabled?: boolean;
  onApply: (position: TBorderPosition, style: { color: string; width: number; style: TCellBorderStyle }) => void;
};

function BordersMenu({ disabled, onApply }: BordersMenuProps) {
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState("#000000");
  const [width, setWidth] = useState(1);
  const [style, setStyle] = useState<TCellBorderStyle>("solid");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const positions: { key: TBorderPosition; label: string }[] = [
    { key: "all", label: "All borders" },
    { key: "inner", label: "Inner" },
    { key: "outer", label: "Outer" },
    { key: "none", label: "Clear" },
    { key: "top", label: "Top" },
    { key: "bottom", label: "Bottom" },
    { key: "left", label: "Left" },
    { key: "right", label: "Right" },
  ];

  const apply = (p: TBorderPosition) => {
    onApply(p, { color, width, style });
    setOpen(false);
  };
  // Changing color / width / dash restyles the selection's existing borders
  // immediately (no need to re-click a position icon).
  const update = (next: Partial<{ color: string; width: number; style: TCellBorderStyle }>) => {
    const merged = { color, width, style, ...next };
    setColor(merged.color);
    setWidth(merged.width);
    setStyle(merged.style);
    onApply("restyle", merged);
  };

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        title="Borders"
        aria-label="Borders"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-7 flex-col items-center justify-center gap-0.5 rounded-md px-1.5 text-tertiary transition-colors hover:bg-layer-1 hover:text-primary disabled:pointer-events-none disabled:opacity-40",
          { "bg-layer-2 text-primary": open }
        )}
      >
        <BorderIcon position="all" />
        <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: color }} />
      </button>
      {open && (
        <div className="shadow-lg absolute top-full left-0 z-30 mt-1 w-max rounded-lg border border-subtle bg-surface-1 p-2">
          <div className="grid grid-cols-4 gap-1">
            {positions.map((p) => (
              <button
                key={p.key}
                type="button"
                title={p.label}
                onClick={() => apply(p.key)}
                className="grid size-8 place-items-center rounded-md text-tertiary transition-colors hover:bg-layer-1 hover:text-primary"
              >
                <BorderIcon position={p.key} />
              </button>
            ))}
          </div>

          <div className="mt-2 flex items-center gap-1 border-t border-subtle pt-2">
            <span className="mr-1 text-11 text-tertiary">Style</span>
            {([1, 2, 3] as const).map((w) => (
              <button
                key={w}
                type="button"
                title={`${w}px`}
                onClick={() => update({ width: w })}
                className={cn("flex h-6 w-7 items-center justify-center rounded-md hover:bg-layer-1", {
                  "ring-accent-primary bg-layer-2 ring-1": width === w,
                })}
              >
                <span className="w-4 rounded-full" style={{ height: w, backgroundColor: "var(--txt-primary)" }} />
              </button>
            ))}
            <button
              type="button"
              title="Dashed"
              onClick={() => update({ style: style === "dashed" ? "solid" : "dashed" })}
              className={cn("ml-0.5 flex h-6 w-7 items-center justify-center rounded-md hover:bg-layer-1", {
                "ring-accent-primary bg-layer-2 ring-1": style === "dashed",
              })}
            >
              <span
                className="w-4 border-t border-dashed"
                style={{ borderTopWidth: 1.5, borderColor: "var(--txt-primary)" }}
              />
            </button>
          </div>

          <div className="mt-2 border-t border-subtle pt-2">
            <div className="grid grid-cols-8 gap-1">
              {BORDER_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  onClick={() => update({ color: c })}
                  className={cn("size-4 rounded border border-subtle transition-transform hover:scale-110", {
                    "ring-accent-primary ring-1 ring-offset-1": color === c,
                  })}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-11 text-tertiary hover:text-primary">
              <input
                type="color"
                value={color}
                onChange={(e) => update({ color: e.target.value })}
                className="size-5 cursor-pointer rounded border border-subtle bg-transparent p-0"
              />
              <span>Custom color…</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A chart card floating over the grid, absolutely positioned inside the
 * scroll container so it moves with the cells it charts. Drag by the header,
 * resize from the corner — geometry is committed once on pointer-up so a
 * whole gesture is a single undo step; in-flight geometry lives in local
 * state only.
 */
function SheetChartCard(props: {
  chart: TSheetChart;
  grid: TSheetGrid;
  isEditable: boolean;
  selectionRange: string | null;
  onUpdate: (patch: Partial<TSheetChart>) => void;
  onDelete: () => void;
}) {
  const { chart, grid, isEditable, selectionRange, onUpdate, onDelete } = props;
  const [live, setLive] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const liveRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const gestureRef = useRef<{
    mode: "move" | "resize";
    pointerId: number;
    startX: number;
    startY: number;
    base: { x: number; y: number; w: number; h: number };
  } | null>(null);

  const spec = useMemo(() => sheetChartSpec(grid, chart), [grid, chart]);

  const x = live?.x ?? chart.x;
  const y = live?.y ?? chart.y;
  const w = live?.w ?? chart.w;
  const h = live?.h ?? chart.h;

  const applyLive = (next: { x: number; y: number; w: number; h: number }) => {
    liveRef.current = next;
    setLive(next);
  };

  const beginGesture = (event: React.PointerEvent, mode: "move" | "resize") => {
    if (!isEditable) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    gestureRef.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      base: { x: chart.x, y: chart.y, w: chart.w, h: chart.h },
    };
  };

  const moveGesture = (event: React.PointerEvent) => {
    const gesture = gestureRef.current;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (gesture.mode === "move") {
      applyLive({
        x: Math.max(0, gesture.base.x + dx),
        y: Math.max(0, gesture.base.y + dy),
        w: gesture.base.w,
        h: gesture.base.h,
      });
    } else {
      applyLive({
        x: gesture.base.x,
        y: gesture.base.y,
        w: Math.max(260, gesture.base.w + dx),
        h: Math.max(180, gesture.base.h + dy),
      });
    }
  };

  const endGesture = () => {
    if (!gestureRef.current) return;
    gestureRef.current = null;
    if (liveRef.current) onUpdate(liveRef.current);
    liveRef.current = null;
    setLive(null);
  };

  return (
    <div
      // Cards keep a surface (they must occlude the gridlines beneath) but go
      // borderless — the shadow alone defines the edge.
      className="group/sheetchart absolute z-[5] flex flex-col overflow-hidden rounded-lg bg-surface-1 shadow-raised-100"
      style={{ left: x, top: y, width: w, height: h }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div
        className={cn(
          "flex h-7 flex-shrink-0 items-center gap-1.5 px-2",
          isEditable && "cursor-grab active:cursor-grabbing"
        )}
        onPointerDown={(event) => beginGesture(event, "move")}
        onPointerMove={moveGesture}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
      >
        <span className="font-mono rounded bg-layer-1 px-1 text-10 text-tertiary">{chart.range}</span>
        {chart.title && <span className="truncate text-11 font-medium text-secondary">{chart.title}</span>}
        <span className="flex-1" />
        {isEditable && (
          <div
            className="hidden items-center gap-0.5 group-hover/sheetchart:flex"
            onPointerDown={(event) => event.stopPropagation()}
          >
            {SHEET_CHART_TYPES.map((type: TSheetChartType) => (
              <button
                key={type}
                type="button"
                className={cn(
                  "rounded px-1 py-0.5 text-10 capitalize transition-colors",
                  chart.type === type ? "bg-layer-2 font-medium text-primary" : "text-tertiary hover:text-primary"
                )}
                onClick={() => onUpdate({ type })}
              >
                {type}
              </button>
            ))}
            {selectionRange && selectionRange !== chart.range && (
              <button
                type="button"
                title={`Chart the selected cells (${selectionRange})`}
                className="font-mono rounded px-1 py-0.5 text-10 whitespace-nowrap text-tertiary hover:text-primary"
                onClick={() => onUpdate({ range: selectionRange })}
              >
                Use {selectionRange}
              </button>
            )}
            <button
              type="button"
              title="Delete chart"
              className="rounded p-0.5 text-tertiary transition-colors hover:text-danger-primary"
              onClick={onDelete}
            >
              <Trash className="size-3" />
            </button>
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 p-2">
        {spec ? (
          <Suspense fallback={<div className="size-full animate-pulse rounded bg-layer-1" />}>
            <LazyChartSpecView spec={spec} height={h - 28 - 16} />
          </Suspense>
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-1 text-tertiary">
            <ChartNoAxesColumn className="size-4" />
            <span className="text-11">No numeric data in {chart.range}</span>
          </div>
        )}
      </div>
      {isEditable && (
        <div
          title="Resize chart"
          className="absolute right-0 bottom-0 grid size-3.5 cursor-nwse-resize place-items-end p-0.5"
          onPointerDown={(event) => beginGesture(event, "resize")}
          onPointerMove={moveGesture}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
        >
          <svg viewBox="0 0 8 8" className="size-2.5 text-tertiary">
            <path d="M7 1L1 7M7 4.5L4.5 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </div>
      )}
    </div>
  );
}
