import { describe, expect, it } from "vitest";
import { getPublicDocMentionPresentation } from "./public-doc-mention";

describe("getPublicDocMentionPresentation", () => {
  it("renders a published project calendar by name with its public link", () => {
    expect(
      getPublicDocMentionPresentation("calendar", "project-id", {
        calendars: {
          "project-id": {
            label: "Publishing calendar",
            href: "https://dragonfruit.page/rengi-media/calendar/calendar-anchor?board=calendar",
          },
        },
      })
    ).toEqual({
      label: "Publishing calendar",
      href: "https://dragonfruit.page/rengi-media/calendar/calendar-anchor?board=calendar",
    });
  });

  it("uses a readable calendar label while publish settings are loading", () => {
    expect(getPublicDocMentionPresentation("calendar", "project-id")).toEqual({
      label: "Project calendar",
    });
  });
});
