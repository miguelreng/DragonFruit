import { describe, expect, it } from "vitest";
import { resolveCompactIssueStateId } from "./compact-form.utils";

describe("resolveCompactIssueStateId", () => {
  it("keeps a selected state that belongs to the active project", () => {
    expect(
      resolveCompactIssueStateId(
        "project-a",
        {
          id: "in-progress",
          project_id: "project-a",
        },
        "backlog"
      )
    ).toBe("in-progress");
  });

  it("uses the active project's default when the selected state belongs to another project", () => {
    expect(
      resolveCompactIssueStateId(
        "project-b",
        {
          id: "project-a-backlog",
          project_id: "project-a",
        },
        "project-b-backlog"
      )
    ).toBe("project-b-backlog");
  });

  it("returns undefined when the project has no selected or default state", () => {
    expect(resolveCompactIssueStateId("project-a", undefined, undefined)).toBeUndefined();
  });
});
