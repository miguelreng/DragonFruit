import { describe, expect, it } from "vitest";
import { GROUPED_PROJECT_SETTINGS, PROJECT_SETTINGS_CATEGORY } from "./project";

describe("project settings navigation", () => {
  it("keeps Pages and removes Intake and Views from the Features group", () => {
    const featureKeys = GROUPED_PROJECT_SETTINGS[PROJECT_SETTINGS_CATEGORY.FEATURES].map((item) => item.key);

    expect(featureKeys).toEqual(["features_pages"]);
    expect(featureKeys).not.toContain("features_intake");
    expect(featureKeys).not.toContain("features_views");
  });
});
