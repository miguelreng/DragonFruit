import { describe, expect, it } from "vitest";
import { computeTaskSortOrder } from "./task-forest";

describe("computeTaskSortOrder", () => {
  it("places an item midway between two neighbors", () => {
    expect(computeTaskSortOrder(100, 200)).toBe(150);
  });

  it("places an item after the final neighbor", () => {
    expect(computeTaskSortOrder(100, undefined)).toBeGreaterThan(100);
  });

  it("places an item before the first neighbor", () => {
    expect(computeTaskSortOrder(undefined, 100)).toBeLessThan(100);
  });

  it("returns a stable positive order for an empty list", () => {
    expect(computeTaskSortOrder()).toBeGreaterThan(0);
  });
});
