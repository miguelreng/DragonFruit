import { describe, expect, it } from "vitest";
import { buildPublishedProjectCalendarUrl, buildPublishedProjectUrl } from "./public-link";

describe("buildPublishedProjectCalendarUrl", () => {
  it("keeps local Space links compatible with the mounted app path", () => {
    expect(
      buildPublishedProjectCalendarUrl("rengi-media", "calendar-anchor", {
        currentOrigin: "https://app.example.com",
        spaceBasePath: "/spaces",
        spaceBaseUrl: "",
      })
    ).toBe("https://app.example.com/spaces/issues/calendar-anchor?board=calendar");
  });

  it("uses the canonical root path on the public-content domain", () => {
    expect(
      buildPublishedProjectCalendarUrl("rengi-media", "calendar-anchor", {
        currentOrigin: "https://app.example.com",
        spaceBasePath: "/spaces/",
        spaceBaseUrl: "https://dragonfruit.page/",
      })
    ).toBe("https://dragonfruit.page/rengi-media/calendar/calendar-anchor?board=calendar");
  });

  it("encodes the public anchor on local Space links", () => {
    expect(
      buildPublishedProjectCalendarUrl("rengi media", "calendar anchor", {
        currentOrigin: "https://app.example.com",
        spaceBasePath: "/spaces",
        spaceBaseUrl: "",
      })
    ).toContain("/spaces/issues/calendar%20anchor?board=calendar");
  });

  it("prefers the public-content current origin over a localhost SPACE_BASE_URL", () => {
    expect(
      buildPublishedProjectCalendarUrl("rengi-media", "calendar-anchor", {
        currentOrigin: "https://dragonfruit.page",
        spaceBasePath: "/spaces",
        spaceBaseUrl: "http://localhost:3002",
      })
    ).toBe("https://dragonfruit.page/rengi-media/calendar/calendar-anchor?board=calendar");
  });

  it("builds a canonical public project URL", () => {
    expect(
      buildPublishedProjectUrl("rengi-media", "project-anchor", "project", {
        spaceBasePath: "/spaces",
        spaceBaseUrl: "https://dragonfruit.page",
      })
    ).toBe("https://dragonfruit.page/rengi-media/project/project-anchor");
  });
});
