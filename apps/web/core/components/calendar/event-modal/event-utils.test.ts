import { describe, expect, it } from "vitest";
import {
  buildEventTimeRange,
  eventDateTimeFields,
  formatEventWhen,
  googleAllDayInclusiveEnd,
  htmlToPlainText,
} from "./event-utils";

describe("htmlToPlainText", () => {
  it("strips tags and collapses whitespace", () => {
    expect(htmlToPlainText("<p>Hello</p>\n<p>  world  </p>")).toBe("Hello world");
  });

  it("returns an empty string for empty or missing descriptions", () => {
    expect(htmlToPlainText("")).toBe("");
    expect(htmlToPlainText(null)).toBe("");
    expect(htmlToPlainText(undefined)).toBe("");
  });
});

describe("googleAllDayInclusiveEnd", () => {
  it("shifts an exclusive end date back one day", () => {
    expect(googleAllDayInclusiveEnd("2026-08-05")).toBe("2026-08-04");
  });

  it("passes through an empty string", () => {
    expect(googleAllDayInclusiveEnd("")).toBe("");
  });

  it("falls back to the original value on invalid input", () => {
    expect(googleAllDayInclusiveEnd("not-a-date")).toBe("not-a-date");
  });
});

describe("eventDateTimeFields", () => {
  it("splits an ISO instant into date/time parts in the given timezone", () => {
    expect(eventDateTimeFields("2026-08-05T14:30:00Z", "UTC")).toEqual({ date: "2026-08-05", time: "14:30" });
  });

  it("converts across a timezone offset", () => {
    expect(eventDateTimeFields("2026-08-05T14:30:00Z", "America/Los_Angeles")).toEqual({
      date: "2026-08-05",
      time: "07:30",
    });
  });

  it("falls back to a default time on invalid input", () => {
    expect(eventDateTimeFields("not-a-date", "UTC")).toEqual({ date: "not-a-date", time: "09:00" });
  });
});

describe("buildEventTimeRange", () => {
  it("builds a timed range with the timezone attached", () => {
    expect(
      buildEventTimeRange(
        { allDay: false, startDate: "2026-08-05", startTime: "09:00", endDate: "2026-08-05", endTime: "10:00" },
        "America/Bogota"
      )
    ).toEqual({ start: "2026-08-05T09:00:00", end: "2026-08-05T10:00:00", timeZone: "America/Bogota" });
  });

  it("builds an all-day range with no timezone", () => {
    expect(
      buildEventTimeRange(
        { allDay: true, startDate: "2026-08-05", startTime: "09:00", endDate: "2026-08-06", endTime: "10:00" },
        "America/Bogota"
      )
    ).toEqual({ start: "2026-08-05", end: "2026-08-06", timeZone: undefined });
  });

  it("defaults the end date to the start date when missing", () => {
    expect(
      buildEventTimeRange(
        { allDay: true, startDate: "2026-08-05", startTime: "09:00", endDate: "", endTime: "10:00" },
        "UTC"
      )
    ).toEqual({ start: "2026-08-05", end: "2026-08-05", timeZone: undefined });
  });

  it("rejects a timed range that doesn't end after it starts", () => {
    expect(
      buildEventTimeRange(
        { allDay: false, startDate: "2026-08-05", startTime: "10:00", endDate: "2026-08-05", endTime: "10:00" },
        "UTC"
      )
    ).toBeNull();
  });

  it("rejects a timed range with a missing time", () => {
    expect(
      buildEventTimeRange(
        { allDay: false, startDate: "2026-08-05", startTime: "", endDate: "2026-08-05", endTime: "10:00" },
        "UTC"
      )
    ).toBeNull();
  });

  it("rejects an all-day range that ends before it starts", () => {
    expect(
      buildEventTimeRange(
        { allDay: true, startDate: "2026-08-05", startTime: "09:00", endDate: "2026-08-04", endTime: "10:00" },
        "UTC"
      )
    ).toBeNull();
  });

  it("rejects a range missing a start date", () => {
    expect(
      buildEventTimeRange({ allDay: false, startDate: "", startTime: "09:00", endDate: "", endTime: "10:00" }, "UTC")
    ).toBeNull();
  });
});

describe("formatEventWhen", () => {
  it("formats a same-day timed event", () => {
    expect(formatEventWhen({ all_day: false, start: "2026-08-05T14:00:00Z", end: "2026-08-05T15:00:00Z" }, "UTC")).toBe(
      "Wed, Aug 5 · 2:00 PM – 3:00 PM"
    );
  });

  it("formats a multi-day timed event", () => {
    expect(formatEventWhen({ all_day: false, start: "2026-08-05T23:00:00Z", end: "2026-08-06T01:00:00Z" }, "UTC")).toBe(
      "Wed, Aug 5 11:00 PM – Thu, Aug 6 1:00 AM"
    );
  });

  it("formats a single-day all-day event", () => {
    expect(formatEventWhen({ all_day: true, start: "2026-08-05", end: "2026-08-06" }, "UTC")).toBe("Wed, Aug 5, 2026");
  });

  it("formats a multi-day all-day event with an inclusive end", () => {
    expect(formatEventWhen({ all_day: true, start: "2026-08-05", end: "2026-08-08" }, "UTC")).toBe(
      "Wed, Aug 5, 2026 – Fri, Aug 7, 2026"
    );
  });

  it("falls back to the raw start/end on invalid input", () => {
    expect(formatEventWhen({ all_day: false, start: "", end: "" }, "UTC")).toBe(" – ");
  });
});
