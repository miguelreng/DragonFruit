import { describe, expect, it } from "vitest";
import { format } from "date-fns";
// helpers
import {
  formatPublicCalendarToolbarLabel,
  getIssueDate,
  getIssueDateRange,
  getMostPopulatedIssueMonth,
} from "./public-calendar.utils";
// types
import type { IIssue } from "@/types/issue";

const buildIssue = (overrides: Partial<IIssue>): IIssue =>
  ({
    id: crypto.randomUUID(),
    name: "Scheduled task",
    start_date: null,
    target_date: null,
    ...overrides,
  }) as IIssue;

describe("public calendar helpers", () => {
  it("uses the target date before the start date", () => {
    const issue = buildIssue({ start_date: "2026-07-29", target_date: "2026-08-03" });

    expect(format(getIssueDate(issue)!, "yyyy-MM-dd")).toBe("2026-08-03");
  });

  it("selects the month containing the most scheduled tasks", () => {
    const issues = [
      buildIssue({ target_date: "2026-07-29" }),
      buildIssue({ target_date: "2026-08-03" }),
      buildIssue({ target_date: "2026-08-05" }),
      buildIssue({ target_date: "2026-08-31" }),
      buildIssue({ name: "Undated task" }),
    ];

    expect(getMostPopulatedIssueMonth(issues)).toBe("2026-08");
  });

  it("creates a safe inclusive date range for a scheduled task", () => {
    const issue = buildIssue({ start_date: "2026-08-05", target_date: "2026-08-03" });

    expect(getIssueDateRange(issue)).toEqual({ start: "2026-08-03", end: "2026-08-05" });
  });

  it("formats the toolbar label for each calendar view", () => {
    const current = new Date("2026-08-05T00:00:00");

    expect(formatPublicCalendarToolbarLabel("month-grid", current, null, null)).toBe("August 2026");
    expect(formatPublicCalendarToolbarLabel("day", current, null, null)).toBe("August 5, 2026");
    expect(formatPublicCalendarToolbarLabel("week", current, "2026-08-03", "2026-08-09")).toBe("Aug 3 – 9, 2026");
  });
});
