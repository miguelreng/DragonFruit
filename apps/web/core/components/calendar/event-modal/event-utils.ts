/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Temporal } from "@js-temporal/polyfill";

export type TEventTimeFields = {
  allDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
};

export type TEventTimeRange = {
  start: string;
  end: string;
  timeZone: string | undefined;
};

export type TEventWhenInput = {
  all_day: boolean;
  start: string;
  end: string;
};

// Strip Google's description HTML down to plain, whitespace-collapsed text.
export function htmlToPlainText(html: string | null | undefined): string {
  return (html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Google's all-day `end` is exclusive; shift it back a day for an inclusive form field.
export function googleAllDayInclusiveEnd(iso: string): string {
  if (!iso) return iso;
  try {
    return Temporal.PlainDate.from(iso.slice(0, 10)).subtract({ days: 1 }).toString();
  } catch {
    return iso;
  }
}

// Split an ISO instant into the date/time fields a form input needs, in the given timezone.
export function eventDateTimeFields(iso: string, timezone: string): { date: string; time: string } {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(iso));
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return { date: `${value.year}-${value.month}-${value.day}`, time: `${value.hour}:${value.minute}` };
  } catch {
    return { date: iso.slice(0, 10), time: "09:00" };
  }
}

// Turn form fields into a Google Calendar start/end pair, or null if the range is invalid
// (missing dates, or the event doesn't end after it starts).
export function buildEventTimeRange(fields: TEventTimeFields, timezone: string): TEventTimeRange | null {
  const { allDay, startDate, startTime, endDate, endTime } = fields;
  const effectiveEndDate = endDate || startDate;
  if (!startDate || !effectiveEndDate) return null;
  if (!allDay && (!startTime || !endTime)) return null;

  const start = allDay ? startDate : `${startDate}T${startTime}:00`;
  const end = allDay ? effectiveEndDate : `${effectiveEndDate}T${endTime}:00`;
  if ((allDay && end < start) || (!allDay && end <= start)) return null;

  return { start, end, timeZone: allDay ? undefined : timezone };
}

const formatEventDay = (d: Date) =>
  d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

// Human-readable "when" for a Google event, in the calendar's display timezone.
export function formatEventWhen(event: TEventWhenInput, timezone: string): string {
  try {
    if (event.all_day || event.start?.length === 10) {
      const start = new Date(`${event.start}T00:00:00`);
      // Google's all-day `end` is exclusive.
      const end = new Date(`${event.end?.length === 10 ? event.end : event.start}T00:00:00`);
      end.setDate(end.getDate() - 1);
      return end > start ? `${formatEventDay(start)} – ${formatEventDay(end)}` : formatEventDay(start);
    }
    const start = new Date(event.start);
    const end = new Date(event.end);
    const dateFormat = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: timezone,
    });
    const timeFormat = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "numeric", timeZone: timezone });
    if (dateFormat.format(start) === dateFormat.format(end)) {
      return `${dateFormat.format(start)} · ${timeFormat.format(start)} – ${timeFormat.format(end)}`;
    }
    return `${dateFormat.format(start)} ${timeFormat.format(start)} – ${dateFormat.format(end)} ${timeFormat.format(end)}`;
  } catch {
    return `${event.start ?? ""} – ${event.end ?? ""}`;
  }
}
