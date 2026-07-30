/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { format, parseISO } from "date-fns";
// types
import type { IIssue } from "@/types/issue";

export function getIssueDate(issue: IIssue): Date | undefined {
  const value = issue.target_date || issue.start_date;
  if (!value) return undefined;

  const date = parseISO(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function getMostPopulatedIssueMonth(issues: IIssue[]): string | undefined {
  const issueCountByMonth = new Map<string, number>();

  for (const issue of issues) {
    const date = getIssueDate(issue);
    if (!date) continue;

    const monthKey = format(date, "yyyy-MM");
    issueCountByMonth.set(monthKey, (issueCountByMonth.get(monthKey) ?? 0) + 1);
  }

  let mostPopulatedMonth: string | undefined;
  let mostPopulatedMonthCount = 0;
  for (const [month, count] of issueCountByMonth) {
    if (
      count > mostPopulatedMonthCount ||
      (count === mostPopulatedMonthCount && (mostPopulatedMonth === undefined || month < mostPopulatedMonth))
    ) {
      mostPopulatedMonth = month;
      mostPopulatedMonthCount = count;
    }
  }

  return mostPopulatedMonth;
}

export function getIssueDateRange(issue: IIssue): { start: string; end: string } | undefined {
  const start = issue.start_date || issue.target_date;
  const end = issue.target_date || issue.start_date;
  if (!start || !end) return undefined;

  const startDate = parseISO(start);
  const endDate = parseISO(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return undefined;

  const startValue = format(startDate, "yyyy-MM-dd");
  const endValue = format(endDate, "yyyy-MM-dd");
  return startValue <= endValue ? { start: startValue, end: endValue } : { start: endValue, end: startValue };
}

const shortMonth = (date: Date) => date.toLocaleDateString("en-US", { month: "short" });

export function formatPublicCalendarToolbarLabel(
  view: string,
  current: Date,
  rangeStart: string | null,
  rangeEnd: string | null
): string {
  if (view === "day") {
    return current.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }

  if (view === "week" && rangeStart && rangeEnd) {
    const start = new Date(`${rangeStart}T00:00:00`);
    const end = new Date(`${rangeEnd}T00:00:00`);
    const sameYear = start.getFullYear() === end.getFullYear();

    if (sameYear && start.getMonth() === end.getMonth()) {
      return `${shortMonth(start)} ${start.getDate()} – ${end.getDate()}, ${end.getFullYear()}`;
    }
    if (sameYear) {
      return `${shortMonth(start)} ${start.getDate()} – ${shortMonth(end)} ${end.getDate()}, ${end.getFullYear()}`;
    }
    return `${shortMonth(start)} ${start.getDate()}, ${start.getFullYear()} – ${shortMonth(end)} ${end.getDate()}, ${end.getFullYear()}`;
  }

  return `${current.toLocaleString("en-US", { month: "long" })} ${current.getFullYear()}`;
}
