import { useMemo, useState } from "react";
import type { TPageVersion } from "@plane/types";
import { cn } from "@plane/utils";

import {
  cellId,
  colWidth,
  columnLabel,
  computeCell,
  formatDisplayValue,
  parseSheetSnapshot,
} from "../sheet/sheet-utils";

export function SheetVersionPreview({ version }: { version: TPageVersion }) {
  const snapshot = useMemo(() => parseSheetSnapshot(version.description_json), [version.description_json]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (!snapshot) {
    return (
      <div className="grid h-full place-items-center px-6 text-12 text-tertiary">This sheet snapshot is invalid.</div>
    );
  }

  const grid =
    snapshot.sheets.find((sheet) => sheet.id === selectedId) ??
    snapshot.sheets.find((sheet) => sheet.id === snapshot.activeId) ??
    snapshot.sheets[0];
  const rows = Array.from({ length: Math.min(grid.rows, 100) }, (_, index) => index);
  const cols = Array.from({ length: Math.min(grid.cols, 26) }, (_, index) => index);

  return (
    <div className="flex h-full min-h-96 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-auto p-5">
        <table className="border-collapse text-12" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 44 }} />
            {cols.map((col) => (
              <col key={col} style={{ width: colWidth(grid, col) }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-20 h-7 border border-subtle bg-layer-1" />
              {cols.map((col) => (
                <th key={col} className="font-normal sticky top-0 h-7 border border-subtle bg-layer-1 text-tertiary">
                  {columnLabel(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row}>
                <td className="sticky left-0 h-7 border border-subtle bg-layer-1 text-center text-tertiary">
                  {row + 1}
                </td>
                {cols.map((col) => {
                  const id = cellId(row, col);
                  const format = grid.formats?.[id];
                  return (
                    <td
                      key={col}
                      className="h-7 truncate border border-subtle px-1.5 text-primary"
                      style={{
                        backgroundColor: format?.fill,
                        color: format?.color,
                        fontWeight: format?.bold ? 600 : undefined,
                        fontStyle: format?.italic ? "italic" : undefined,
                        textAlign: format?.align,
                      }}
                    >
                      {formatDisplayValue(computeCell(id, grid.cells), format)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-shrink-0 gap-1 overflow-x-auto border-t border-subtle bg-layer-1 px-3 py-2">
        {snapshot.sheets.map((sheet) => (
          <button
            key={sheet.id}
            type="button"
            onClick={() => setSelectedId(sheet.id)}
            className={cn(
              "rounded-md px-3 py-1 text-11 text-secondary",
              grid.id === sheet.id && "shadow-xs bg-surface-1 font-medium text-primary"
            )}
          >
            {sheet.name}
          </button>
        ))}
      </div>
    </div>
  );
}
