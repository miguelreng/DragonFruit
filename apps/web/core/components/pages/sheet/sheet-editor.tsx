/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { debounce } from "lodash-es";
import { cn } from "@plane/utils";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  DollarSign,
  Italic,
  PaintBucket,
  Plus,
  Strikethrough,
  Type,
  X,
} from "@/components/icons/lucide-shim";
import { useMember } from "@/hooks/store/use-member";
import type { TPageInstance } from "@/store/pages/base-page";
import type { TPageRootHandlers } from "../editor/page-root";
import {
  applySuggestion,
  cellId,
  clearColumn,
  clearRect,
  clearRow,
  colWidth,
  columnLabel,
  computeCell,
  createGrid,
  formulaSuggestions,
  deleteColumn,
  deleteRow,
  fillRange,
  formatDisplayValue,
  getInitialSnapshot,
  insertColumn,
  insertRow,
  isEmptyFormat,
  NUMBER_FORMAT_GROUPS,
  parseCellId,
  parseClipboard,
  rangeToTSV,
  writeMatrix,
  SHEET_DEFAULT_COL_WIDTH,
  SHEET_MAX_COL_WIDTH,
  SHEET_MAX_COLS,
  SHEET_MAX_ROWS,
  SHEET_MIN_COL_WIDTH,
  SHEET_ROW_HEIGHT,
  SHEET_ROWNUM_WIDTH,
  type TCellFormat,
  type TCellNumberFormat,
  type TSheetGrid,
  type TSheetSnapshot,
} from "./sheet-utils";

type Props = {
  page: TPageInstance;
  handlers: TPageRootHandlers;
  isEditable: boolean;
};

type Rect = { r1: number; c1: number; r2: number; c2: number };
type ContextMenu = { x: number; y: number; kind: "col" | "row"; index: number };

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

// Selection outline colour — the brand magenta, darker than the light range fill.
const SEL_BORDER = "#aa0276";

// Per-cell inset box-shadow drawing the selection perimeter for cell (r, c).
const selectionBorder = (rect: Rect, r: number, c: number): string | undefined => {
  const parts: string[] = [];
  if (r === rect.r1) parts.push(`inset 0 2px 0 0 ${SEL_BORDER}`);
  if (r === rect.r2) parts.push(`inset 0 -2px 0 0 ${SEL_BORDER}`);
  if (c === rect.c1) parts.push(`inset 2px 0 0 0 ${SEL_BORDER}`);
  if (c === rect.c2) parts.push(`inset -2px 0 0 0 ${SEL_BORDER}`);
  return parts.join(", ") || undefined;
};

const normRect = (r1: number, c1: number, r2: number, c2: number): Rect => ({
  r1: Math.min(r1, r2),
  c1: Math.min(c1, c2),
  r2: Math.max(r1, r2),
  c2: Math.max(c1, c2),
});
const inRect = (rect: Rect | null, r: number, c: number): boolean =>
  !!rect && r >= rect.r1 && r <= rect.r2 && c >= rect.c1 && c <= rect.c2;

export const SheetEditor = observer(function SheetEditor({ page, handlers, isEditable }: Props) {
  const [snapshot, setSnapshot] = useState<TSheetSnapshot>(() => getInitialSnapshot(page.description_json));
  const [focused, setFocused] = useState<string | null>(null);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [menu, setMenu] = useState<ContextMenu | null>(null);
  const [fillPreview, setFillPreview] = useState<Rect | null>(null);
  // `maxWidth` remembers the widest the grid has ever been so opening the Atlas
  // panel (which narrows the grid) doesn't drop columns — the grid overflows-x instead.
  const [viewport, setViewport] = useState({ width: 0, height: 0, maxWidth: 0 });
  const [showSuggest, setShowSuggest] = useState(false);
  const [suggestIndex, setSuggestIndex] = useState(0);

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
      setSnapshot((prev) => {
        const next = updater(prev);
        persist(next);
        return next;
      });
    },
    [persist]
  );

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

  // Format the active selection (or the focused cell), bounded to real cells so
  // selecting a whole column doesn't write formats onto empty filler cells.
  const applyFormat = useCallback(
    (partial: Partial<TCellFormat>) => {
      if (!isEditable) return;
      const rect = selection ?? (focused ? (() => { const p = parseCellId(focused); return p ? { r1: p.row, c1: p.col, r2: p.row, c2: p.col } : null; })() : null);
      if (!rect) return;
      commitGrid((grid) => {
        const formats = { ...(grid.formats ?? {}) };
        const rMax = Math.min(rect.r2, grid.rows - 1);
        const cMax = Math.min(rect.c2, grid.cols - 1);
        for (let r = rect.r1; r <= rMax; r++) {
          for (let c = rect.c1; c <= cMax; c++) {
            const id = cellId(r, c);
            const next: TCellFormat = { ...(formats[id] ?? {}), ...partial };
            if (isEmptyFormat(next)) delete formats[id];
            else formats[id] = next;
          }
        }
        return { ...grid, formats };
      });
    },
    [commitGrid, focused, isEditable, selection]
  );

  const addRow = useCallback(() => {
    if (!isEditable) return;
    commitGrid((grid) => ({ ...grid, rows: Math.min(grid.rows + 1, SHEET_MAX_ROWS) }));
  }, [commitGrid, isEditable]);

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
        commitGrid((grid) => ({ ...grid, colWidths: { ...(grid.colWidths ?? {}), [col]: width } }));
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

  // Sheet-tab operations.
  const switchSheet = (id: string) => {
    if (id === snapshot.activeId) return;
    setFocused(null);
    setSelection(null);
    commit((prev) => ({ ...prev, activeId: id }));
  };
  const addSheet = () => {
    if (!isEditable) return;
    const id = `sheet-${Date.now()}`;
    commit((prev) => ({ ...prev, sheets: [...prev.sheets, createGrid(id, `Sheet ${prev.sheets.length + 1}`)], activeId: id }));
    setFocused(null);
    setSelection(null);
  };
  const deleteSheet = (id: string) => {
    if (!isEditable) return;
    commit((prev) => {
      if (prev.sheets.length <= 1) return prev;
      const sheets = prev.sheets.filter((s) => s.id !== id);
      return { sheets, activeId: prev.activeId === id ? sheets[0].id : prev.activeId };
    });
    setFocused(null);
  };
  const renameSheet = (id: string, name: string) => {
    const trimmed = name.trim();
    if (trimmed) commit((prev) => ({ ...prev, sheets: prev.sheets.map((s) => (s.id === id ? { ...s, name: trimmed } : s)) }));
  };

  // Measure the scroll viewport to fill it with fixed-height rows / columns.
  const wrapRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () =>
      setViewport((v) => ({ width: el.clientWidth, height: el.clientHeight, maxWidth: Math.max(v.maxWidth, el.clientWidth) }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Close the context menu on any outside interaction.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  const focusedFormat = focused ? active.formats?.[focused] : undefined;
  const focusedRaw = focused ? (active.cells[focused] ?? "") : "";

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
          .filter((m) => memberLabel(m).toLowerCase().includes(mentionQuery) || (m.email ?? "").toLowerCase().includes(mentionQuery))
          .slice(0, 6)
      : [];
  const suggestCount = suggestKind === "formula" ? formulaItems.length : mentionItems.length;
  const activeSuggest = suggestCount ? Math.min(suggestIndex, suggestCount - 1) : 0;

  const refocusEnd = () =>
    requestAnimationFrame(() => {
      const el = focused ? (document.getElementById(`sheet-cell-${focused}`) as HTMLInputElement | null) : null;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  const onCellInput = (id: string, value: string) => {
    setCellValue(id, value);
    const hasFormula = value.startsWith("=") && formulaSuggestions(value).length > 0;
    const hasMention = !value.startsWith("=") && /@([^@\s]*)$/.test(value);
    setShowSuggest(hasFormula || hasMention);
    setSuggestIndex(0);
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
  const handleCellKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, row: number, col: number) => {
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
        // Select all cells instead of the input's text.
        event.preventDefault();
        setSelection({ r1: 0, c1: 0, r2: active.rows - 1, c2: active.cols - 1 });
        return;
      }
    }
    // Delete/Backspace over a multi-cell selection clears every selected cell
    // (a single cell still edits its text natively).
    if (
      (event.key === "Delete" || event.key === "Backspace") &&
      selection &&
      !(selection.r1 === selection.r2 && selection.c1 === selection.c2)
    ) {
      event.preventDefault();
      const rect = selection;
      commitGrid((g) => clearRect(g, rect.r1, rect.c1, rect.r2, rect.c2));
      return;
    }
    if (suggestCount > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSuggestIndex((i) => (i + 1) % suggestCount);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSuggestIndex((i) => (i - 1 + suggestCount) % suggestCount);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        acceptActive();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setShowSuggest(false);
        return;
      }
    }
    if (event.key === "Enter") {
      event.preventDefault();
      document.getElementById(`sheet-cell-${cellId(row + 1, col)}`)?.focus();
    }
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
  };
  const selectRow = (r: number) => {
    setSelection(normRect(r, 0, r, renderCols - 1));
    setFocused(cellId(r, 0));
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
    if (!text || !/[\t\n]/.test(text)) return; // single value → let the input paste natively
    e.preventDefault();
    const matrix = parseClipboard(text);
    const { r1, c1 } = selection;
    commitGrid((g) => writeMatrix(g, r1, c1, matrix));
    const height = matrix.length;
    const width = Math.max(...matrix.map((row) => row.length));
    setSelection(normRect(r1, c1, r1 + height - 1, c1 + width - 1));
  };

  const menuItems =
    menu?.kind === "col"
      ? [
          { label: "Insert column left", run: () => commitGrid((g) => insertColumn(g, menu.index)) },
          { label: "Insert column right", run: () => commitGrid((g) => insertColumn(g, menu.index + 1)) },
          { label: "Delete column", run: () => commitGrid((g) => deleteColumn(g, menu.index)) },
          { label: "Clear column", run: () => commitGrid((g) => clearColumn(g, menu.index)) },
          { label: `Freeze up to column ${columnLabel(menu.index)}`, run: () => commitGrid((g) => ({ ...g, frozenCols: menu.index + 1 })) },
          ...(frozen > 0 ? [{ label: "Unfreeze columns", run: () => commitGrid((g) => ({ ...g, frozenCols: 0 })) }] : []),
        ]
      : menu?.kind === "row"
        ? [
            { label: "Insert row above", run: () => commitGrid((g) => insertRow(g, menu.index)) },
            { label: "Insert row below", run: () => commitGrid((g) => insertRow(g, menu.index + 1)) },
            { label: "Delete row", run: () => commitGrid((g) => deleteRow(g, menu.index)) },
            { label: "Clear row", run: () => commitGrid((g) => clearRow(g, menu.index)) },
          ]
        : [];

  return (
    <div className="flex h-full w-full flex-col bg-white">
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
          <ToolbarButton title="Italic" disabled={!focused} active={!!focusedFormat?.italic} onClick={() => toggle("italic")}>
            <Italic className="size-4" />
          </ToolbarButton>
          <ToolbarButton title="Strikethrough" disabled={!focused} active={!!focusedFormat?.strike} onClick={() => toggle("strike")}>
            <Strikethrough className="size-4" />
          </ToolbarButton>
          <ColorMenu title="Text color" disabled={!focused} value={focusedFormat?.color} onSelect={(color) => applyFormat({ color })} icon={<Type className="size-4" />} />
          <ColorMenu title="Fill color" disabled={!focused} value={focusedFormat?.fill} onSelect={(fill) => applyFormat({ fill })} icon={<PaintBucket className="size-4" />} />
          <Separator />
          <NumberFormatMenu
            disabled={!focused}
            value={focusedFormat?.numberFormat}
            onSelect={(nf) => applyFormat({ numberFormat: nf, decimals: undefined })}
          />
          <ToolbarButton title="Format as currency" disabled={!focused} active={focusedFormat?.numberFormat === "currency"} onClick={() => setNumberFormat("currency")}>
            <DollarSign className="size-4" />
          </ToolbarButton>
          <ToolbarButton title="Format as percent" disabled={!focused} active={focusedFormat?.numberFormat === "percent"} onClick={() => setNumberFormat("percent")}>
            <span className="text-13 font-medium">%</span>
          </ToolbarButton>
          <ToolbarButton title="Decrease decimal places" disabled={!focused} onClick={() => bumpDecimals(-1)}>
            <span className="text-11 font-medium tracking-tight">.0</span>
          </ToolbarButton>
          <ToolbarButton title="Increase decimal places" disabled={!focused} onClick={() => bumpDecimals(1)}>
            <span className="text-11 font-medium tracking-tight">.00</span>
          </ToolbarButton>
          <Separator />
          <AlignMenu disabled={!focused} value={focusedFormat?.align ?? "left"} onSelect={(a) => applyFormat({ align: a })} />
          <WrapMenu disabled={!focused} value={focusedFormat?.wrap ?? "overflow"} onSelect={(w) => applyFormat({ wrap: w })} />
        </div>
      )}

      {/* Formula bar. */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-subtle px-4 py-2">
        <span className="grid h-6 min-w-9 shrink-0 place-items-center rounded-md bg-layer-1 px-1.5 font-mono text-11 text-tertiary">
          {focused ?? "—"}
        </span>
        <span className="shrink-0 select-none border-l border-subtle pl-2 font-serif text-13 italic text-tertiary" aria-hidden>
          fx
        </span>
        <input
          type="text"
          value={focusedRaw}
          onChange={(e) => focused && setCellValue(focused, e.target.value)}
          readOnly={!isEditable || !focused}
          placeholder={focused ? "Value or =formula (e.g. =SUM(A1:A5))" : "Select a cell"}
          aria-label="Formula bar"
          className="h-6 w-full min-w-0 flex-1 bg-transparent px-1 font-mono text-12 text-primary outline-none placeholder:text-placeholder read-only:cursor-default"
        />
      </div>

      {/* Grid. */}
      <div ref={wrapRef} onCopy={handleCopy} onCut={handleCut} onPaste={handlePaste} className="min-h-0 flex-1 overflow-auto">
        <table className="select-none border-collapse text-12" style={{ tableLayout: "fixed", width: totalWidth }}>
          <colgroup>
            <col style={{ width: SHEET_ROWNUM_WIDTH }} />
            {cols.map((c) => (
              <col key={c} style={{ width: colWidth(active, c) }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 h-7 border border-subtle bg-layer-1" />
              {cols.map((c) => {
                const colSelected = selection && selection.c1 <= c && c <= selection.c2 && selection.r2 - selection.r1 >= renderRows - 2;
                const isFrozen = c < frozen;
                const thStyle: React.CSSProperties = {};
                if (isFrozen) {
                  thStyle.left = colLeft[c];
                  thStyle.zIndex = 20;
                }
                if (c === frozen - 1) thStyle.boxShadow = "inset -2px 0 0 0 rgba(0,0,0,0.22)";
                return (
                  <th
                    key={c}
                    onClick={() => selectColumn(c)}
                    onContextMenu={(e) => openMenu(e, "col", c)}
                    style={Object.keys(thStyle).length ? thStyle : undefined}
                    className={cn(
                      "sticky top-0 z-10 h-7 cursor-pointer border border-subtle bg-layer-1 text-center font-normal text-tertiary hover:bg-layer-2",
                      { "bg-accent-primary/15 text-primary": colSelected }
                    )}
                  >
                    <span className="pointer-events-none block truncate px-2">{columnLabel(c)}</span>
                    {isEditable && (
                      <span
                        onMouseDown={(e) => startResize(e, c)}
                        title="Drag to resize column"
                        className="absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize hover:bg-accent-primary/40"
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const rowSelected = selection && selection.r1 <= r && r <= selection.r2 && selection.c2 - selection.c1 >= renderCols - 2;
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
                    const fmt = active.formats?.[id];
                    const display = isFocused
                      ? (active.cells[id] ?? "")
                      : formatDisplayValue(computeCell(id, active.cells), fmt);
                    const wrapMode = fmt?.wrap;
                    // "wrap"/"clip" render via an in-flow div (which sizes the row);
                    // the input is then overlaid for editing. Default is input-only.
                    const layered = wrapMode === "wrap" || wrapMode === "clip";
                    const textStyle: React.CSSProperties = {
                      fontWeight: fmt?.bold ? 600 : undefined,
                      fontStyle: fmt?.italic ? "italic" : undefined,
                      textDecoration: fmt?.strike ? "line-through" : undefined,
                      color: fmt?.color || undefined,
                      textAlign: fmt?.align,
                    };
                    const selected = !!selection && inRect(selection, r, c);
                    const inFill = inRect(fillPreview, r, c);
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
                        className={cn("relative border border-subtle p-0", layered ? "min-h-7 align-top" : "h-7", {
                          "bg-canvas": isFrozen && !fmt?.fill,
                        })}
                      >
                        {layered && (
                          <div
                            aria-hidden
                            style={textStyle}
                            className={cn("px-2 py-1 text-12 text-primary", wrapMode === "wrap" ? "whitespace-pre-wrap break-words" : "truncate", {
                              invisible: isFocused,
                            })}
                          >
                            {display || " "}
                          </div>
                        )}
                        <input
                          id={`sheet-cell-${id}`}
                          type="text"
                          value={display}
                          readOnly={!isEditable}
                          onMouseDown={(e) => {
                            if (e.shiftKey && focused) {
                              // Extend the selection from the anchor to this cell.
                              e.preventDefault();
                              const a = parseCellId(focused);
                              if (a) setSelection(normRect(a.row, a.col, r, c));
                            }
                          }}
                          onFocus={() => {
                            setFocused(id);
                            setSelection({ r1: r, c1: c, r2: r, c2: c });
                            setShowSuggest(false);
                          }}
                          onBlur={() => window.setTimeout(() => setShowSuggest(false), 120)}
                          onChange={(e) => onCellInput(id, e.target.value)}
                          onKeyDown={(e) => handleCellKeyDown(e, r, c)}
                          style={textStyle}
                          className={cn(
                            "z-0 w-full bg-transparent px-2 text-12 text-primary outline-none",
                            layered ? "absolute inset-0 h-full" : "relative h-full",
                            isFocused ? "cursor-text" : "cursor-default",
                            {
                              "font-mono": isFocused && display.startsWith("="),
                              "text-transparent caret-transparent": layered && !isFocused,
                            }
                          )}
                        />
                        {selected && selection && (
                          // -inset-px so the pink border covers the cell's own gray border.
                          <span
                            className="pointer-events-none absolute -inset-px z-[2]"
                            style={{
                              backgroundColor: isFocused ? undefined : "rgba(170,2,118,0.08)",
                              boxShadow: selectionBorder(selection, r, c),
                            }}
                          />
                        )}
                        {inFill && !selected && <span className="pointer-events-none absolute inset-0 z-[2] bg-accent-primary/20" />}
                        {isEditable && selection && r === selection.r2 && c === selection.c2 && (
                          <span
                            onMouseDown={startFill}
                            title="Drag to fill"
                            className="absolute -bottom-[3px] -right-[3px] z-10 size-[7px] cursor-crosshair rounded-[1px] border border-white bg-accent-primary"
                          />
                        )}
                        {isFocused && suggestKind === "formula" && formulaItems.length > 0 && (
                          <div className="absolute left-0 top-full z-30 mt-px max-h-56 w-52 overflow-auto rounded-md border border-subtle bg-surface-1 py-1 text-left shadow-lg">
                            {formulaItems.map((fn, i) => (
                              <button
                                key={fn}
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  acceptFormula(fn);
                                }}
                                className={cn("block w-full px-3 py-1 text-left font-mono text-12", {
                                  "bg-layer-2 text-primary": i === activeSuggest,
                                  "text-secondary hover:bg-layer-1": i !== activeSuggest,
                                })}
                              >
                                {fn}
                              </button>
                            ))}
                          </div>
                        )}
                        {isFocused && suggestKind === "mention" && mentionItems.length > 0 && (
                          <div className="absolute left-0 top-full z-30 mt-px max-h-60 w-64 overflow-auto rounded-md border border-subtle bg-surface-1 py-1 text-left shadow-lg">
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
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add-row control — pinned below the grid. */}
      {isEditable && (
        <button
          type="button"
          onClick={addRow}
          title="Add row"
          className="flex h-7 flex-shrink-0 items-center gap-1.5 border-b border-t border-subtle bg-white pl-3 text-11 text-tertiary transition-colors hover:bg-layer-1 hover:text-primary"
        >
          <Plus className="size-3.5" />
          <span>Add row</span>
        </button>
      )}

      {/* Sheet tabs. */}
      <div className="flex flex-shrink-0 items-center gap-1 overflow-x-auto border-t border-subtle bg-white px-2 py-1.5">
        {snapshot.sheets.map((sheet) => {
          const isActive = sheet.id === snapshot.activeId;
          const isRenaming = renaming?.id === sheet.id;
          return (
            <div
              key={sheet.id}
              className={cn(
                "group flex flex-shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-12 transition-colors",
                isActive ? "border-subtle bg-layer-2 font-medium text-primary" : "border-transparent text-tertiary hover:bg-layer-1 hover:text-primary"
              )}
            >
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
                  onClick={() => switchSheet(sheet.id)}
                  onDoubleClick={() => isEditable && setRenaming({ id: sheet.id, value: sheet.name })}
                  className="max-w-[160px] truncate"
                >
                  {sheet.name}
                </button>
              )}
              {isEditable && snapshot.sheets.length > 1 && !isRenaming && (
                <button
                  type="button"
                  onClick={() => deleteSheet(sheet.id)}
                  title="Delete sheet"
                  className="grid size-4 place-items-center rounded text-tertiary opacity-0 hover:bg-layer-3 hover:text-primary group-hover:opacity-100"
                >
                  <X className="size-3" />
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
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
          <div
            className="fixed z-50 min-w-44 rounded-lg border border-subtle bg-surface-1 py-1 shadow-lg"
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
                className="block w-full px-3 py-1.5 text-left text-12 text-primary hover:bg-layer-1"
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
});

const Separator = () => <span className="mx-1 h-5 w-px flex-shrink-0 bg-subtle" />;

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
        <div className="absolute left-0 top-full z-30 mt-1 flex gap-0.5 rounded-lg border border-subtle bg-surface-1 p-1 shadow-lg">
          {ALIGN_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              title={`Align ${o.label.toLowerCase()}`}
              onClick={() => {
                onSelect(o.key);
                setOpen(false);
              }}
              className={cn("grid size-7 place-items-center rounded-md text-tertiary hover:bg-layer-1 hover:text-primary", {
                "bg-layer-2 text-primary": value === o.key,
              })}
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
  <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
        <div className="absolute left-0 top-full z-30 mt-1 w-36 rounded-lg border border-subtle bg-surface-1 py-1 shadow-lg">
          {WRAP_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => {
                onSelect(o.key);
                setOpen(false);
              }}
              className={cn("block w-full px-3 py-1.5 text-left text-12 hover:bg-layer-1", value === o.key ? "text-primary" : "text-secondary")}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type NumberFormatMenuProps = {
  disabled?: boolean;
  value?: TCellNumberFormat;
  onSelect: (nf: TCellNumberFormat) => void;
};

function NumberFormatMenu({ disabled, value, onSelect }: NumberFormatMenuProps) {
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
        <div className="absolute left-0 top-full z-30 mt-1 w-64 overflow-hidden rounded-lg border border-subtle bg-surface-1 py-1 shadow-lg">
          {NUMBER_FORMAT_GROUPS.map((group, gi) => (
            <div key={gi} className={cn({ "border-t border-subtle": gi > 0 })}>
              {group.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => {
                    onSelect(f.key);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left text-12 hover:bg-layer-1",
                    value === f.key ? "text-primary" : "text-secondary"
                  )}
                >
                  <span className="truncate">{f.label}</span>
                  {f.sample && <span className="shrink-0 text-tertiary">{f.sample}</span>}
                </button>
              ))}
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
  onSelect: (color: string | undefined) => void;
};

function ColorMenu({ title, disabled, value, icon, onSelect }: ColorMenuProps) {
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
        <div className="absolute left-0 top-full z-30 mt-1 w-max rounded-lg border border-subtle bg-surface-1 p-2 shadow-lg">
          <div className="grid grid-cols-5 gap-1">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                onClick={() => {
                  onSelect(c);
                  setOpen(false);
                }}
                className={cn("size-5 rounded-md border border-subtle transition-transform hover:scale-110", {
                  "ring-1 ring-accent-primary ring-offset-1": value === c,
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
