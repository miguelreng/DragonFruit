import { describe, expect, it } from "vitest";
import { getScheduleXPayloadDate } from "./calendar-date.utils";

describe("getScheduleXPayloadDate", () => {
  it("keeps a date-only string", () => {
    expect(getScheduleXPayloadDate("2026-07-29")).toBe("2026-07-29");
  });

  it("extracts the date from a Schedule-X Temporal value", () => {
    const temporalValue = {
      toString: () => "2026-07-29",
    };

    expect(getScheduleXPayloadDate(temporalValue)).toBe("2026-07-29");
  });

  it("extracts the date from a date-time value", () => {
    expect(getScheduleXPayloadDate("2026-07-29T14:30:00-05:00[America/Bogota]")).toBe("2026-07-29");
  });

  it("rejects empty and malformed values", () => {
    expect(getScheduleXPayloadDate("")).toBeNull();
    expect(getScheduleXPayloadDate({})).toBeNull();
  });
});
