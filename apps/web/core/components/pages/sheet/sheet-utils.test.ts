import { describe, expect, it } from "vitest";

import { parseSheetSnapshot } from "./sheet-utils";

describe("parseSheetSnapshot", () => {
  it("rejects missing and malformed snapshots instead of restoring an empty sheet", () => {
    expect(parseSheetSnapshot({})).toBeNull();
    expect(parseSheetSnapshot({ sheet_snapshot: {} })).toBeNull();
    expect(parseSheetSnapshot({ sheet_snapshot: { sheets: [] } })).toBeNull();
  });

  it("sanitizes a valid multi-sheet snapshot", () => {
    const parsed = parseSheetSnapshot({
      sheet_snapshot: {
        activeId: "sheet-2",
        sheets: [
          { id: "sheet-1", name: "Inputs", rows: 2, cols: 2, cells: { A1: "Revenue" } },
          { id: "sheet-2", name: "Summary", rows: 1, cols: 1, cells: { A1: "=1+1" } },
        ],
      },
    });

    expect(parsed?.activeId).toBe("sheet-2");
    expect(parsed?.sheets).toHaveLength(2);
    expect(parsed?.sheets[0].cells.A1).toBe("Revenue");
  });
});
