import { describe, expect, it } from "vitest";
import { getLabelSwatches } from "./labels-list";

describe("getLabelSwatches", () => {
  it("returns the real color of each label, in order", () => {
    const labels = [
      { id: "1", color: "#FF6900" },
      { id: "2", color: "#00D084" },
    ];

    expect(getLabelSwatches(labels)).toEqual(labels);
  });

  it("caps the swatch stack at 3 labels", () => {
    const labels = [
      { id: "1", color: "#FF6900" },
      { id: "2", color: "#00D084" },
      { id: "3", color: "#0693E3" },
      { id: "4", color: "#9900EF" },
    ];

    expect(getLabelSwatches(labels)).toEqual(labels.slice(0, 3));
  });

  it("ignores missing labels", () => {
    const label = { id: "1", color: "#FF6900" };

    expect(getLabelSwatches([label, undefined])).toEqual([label]);
  });
});
