/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { debounce } from "lodash-es";
import { cn } from "@plane/utils";
import { Plus } from "@/components/icons/lucide-shim";
import type { TPageInstance } from "@/store/pages/base-page";
import type { TPageRootHandlers } from "../editor/page-root";
import {
  cellId,
  columnLabel,
  computeCell,
  getInitialSnapshot,
  SHEET_MAX_COLS,
  SHEET_MAX_ROWS,
  type TSheetSnapshot,
} from "./sheet-utils";

type Props = {
  page: TPageInstance;
  handlers: TPageRootHandlers;
  isEditable: boolean;
};

export const SheetEditor = observer(function SheetEditor({ page, handlers, isEditable }: Props) {
  const [snapshot, setSnapshot] = useState<TSheetSnapshot>(() => getInitialSnapshot(page.description_json));
  // The cell that currently has focus — shows its raw formula while editing and
  // drives the formula bar. Everything else shows the computed value.
  const [focused, setFocused] = useState<string | null>(null);

  // Sheets skip the doc Yjs provider; mark synced on mount so the header badge
  // clears, then drive transitions ourselves around each save.
  useEffect(() => {
    page.setSyncingStatus("synced");
  }, [page]);

  const persist = useMemo(
    () =>
      debounce((next: TSheetSnapshot) => {
        page.setSyncingStatus("syncing");
        // Only send the JSON payload — including doc binary/html fields would
        // route this through rich-text persistence paths sheets don't use.
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

  const setCellValue = useCallback(
    (id: string, value: string) => {
      commit((prev) => {
        const cells = { ...prev.cells };
        if (value === "") delete cells[id];
        else cells[id] = value;
        return { ...prev, cells };
      });
    },
    [commit]
  );

  const addRow = useCallback(() => {
    if (!isEditable) return;
    commit((prev) => ({ ...prev, rows: Math.min(prev.rows + 1, SHEET_MAX_ROWS) }));
  }, [commit, isEditable]);

  const addColumn = useCallback(() => {
    if (!isEditable) return;
    commit((prev) => ({ ...prev, cols: Math.min(prev.cols + 1, SHEET_MAX_COLS) }));
  }, [commit, isEditable]);

  // Enter moves focus to the cell below (the familiar spreadsheet behaviour).
  const handleCellKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>, row: number, col: number) => {
      if (event.key === "Enter") {
        event.preventDefault();
        const belowRow = row + 1;
        if (belowRow < snapshot.rows) {
          document.getElementById(`sheet-cell-${cellId(belowRow, col)}`)?.focus();
        } else {
          event.currentTarget.blur();
        }
      }
    },
    [snapshot.rows]
  );

  const focusedRaw = focused ? (snapshot.cells[focused] ?? "") : "";

  const rows = Array.from({ length: snapshot.rows }, (_, r) => r);
  const cols = Array.from({ length: snapshot.cols }, (_, c) => c);

  return (
    <div className="flex h-full w-full flex-col">
      {/* Title + formula bar. A new sheet is created unnamed, so this is the one
          place to name it — persists via the same debounced path docs use. */}
      <div className="flex flex-shrink-0 flex-col gap-2 border-b border-subtle px-4 py-2.5">
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
        <div className="flex items-center gap-2">
          <span className="grid h-6 min-w-9 shrink-0 place-items-center rounded-md border border-subtle bg-layer-1 px-1.5 font-mono text-11 text-tertiary">
            {focused ?? "—"}
          </span>
          <input
            type="text"
            value={focusedRaw}
            onChange={(e) => focused && setCellValue(focused, e.target.value)}
            readOnly={!isEditable || !focused}
            placeholder={focused ? "Value or =formula (e.g. =SUM(A1:A5))" : "Select a cell"}
            aria-label="Formula bar"
            className="h-6 w-full min-w-0 flex-1 rounded-md border border-subtle bg-canvas px-2 font-mono text-12 text-primary outline-none placeholder:text-placeholder focus:border-strong read-only:cursor-default"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="border-collapse select-none text-12">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 h-7 w-12 border border-subtle bg-layer-1" />
              {cols.map((c) => (
                <th
                  key={c}
                  className="sticky top-0 z-10 h-7 min-w-24 border border-subtle bg-layer-1 px-2 text-center font-normal text-tertiary"
                >
                  {columnLabel(c)}
                </th>
              ))}
              {isEditable && (
                <th className="sticky top-0 z-10 h-7 border border-subtle bg-layer-1 px-1">
                  <button
                    type="button"
                    onClick={addColumn}
                    title="Add column"
                    className="grid size-5 place-items-center rounded text-tertiary hover:bg-layer-2 hover:text-primary"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r}>
                <td className="sticky left-0 z-10 h-7 w-12 border border-subtle bg-layer-1 text-center text-tertiary">
                  {r + 1}
                </td>
                {cols.map((c) => {
                  const id = cellId(r, c);
                  const isFocused = focused === id;
                  const display = isFocused ? (snapshot.cells[id] ?? "") : computeCell(id, snapshot.cells);
                  return (
                    <td key={c} className="h-7 min-w-24 border border-subtle p-0">
                      <input
                        id={`sheet-cell-${id}`}
                        type="text"
                        value={display}
                        readOnly={!isEditable}
                        onFocus={() => setFocused(id)}
                        onChange={(e) => setCellValue(id, e.target.value)}
                        onKeyDown={(e) => handleCellKeyDown(e, r, c)}
                        className={cn(
                          "h-full w-full bg-transparent px-2 text-12 text-primary outline-none read-only:cursor-default",
                          { "bg-accent-primary/5 ring-1 ring-inset ring-accent-primary": isFocused }
                        )}
                      />
                    </td>
                  );
                })}
                {isEditable && <td className="border-none" />}
              </tr>
            ))}
            {isEditable && (
              <tr>
                <td className="sticky left-0 z-10 h-7 w-12 border border-subtle bg-layer-1 p-0">
                  <button
                    type="button"
                    onClick={addRow}
                    title="Add row"
                    className="grid size-full place-items-center text-tertiary hover:bg-layer-2 hover:text-primary"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});
