import { describe, expect, it } from "vitest";
import { getPublishedBriefTitle } from "./constants";

describe("getPublishedBriefTitle", () => {
  it("uses the project name for the canonical project brief", () => {
    expect(
      getPublishedBriefTitle(
        {
          name: "Project Brief",
          page_type: "doc",
        },
        " Publishing "
      )
    ).toBe("Publishing");
  });

  it("preserves the page title for regular published documents", () => {
    expect(
      getPublishedBriefTitle(
        {
          name: "Campaign brief",
          page_type: "doc",
        },
        "Publishing"
      )
    ).toBe("Campaign brief");
  });
});
