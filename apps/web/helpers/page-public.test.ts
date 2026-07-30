import { describe, expect, it } from "vitest";
import { buildPublicPagePath, buildPublicPageUrl, getPublicPageContentType } from "./page-public";

describe("public page URLs", () => {
  it("includes the workspace identifier and content type", () => {
    expect(buildPublicPagePath("rengi-media", "campaign brief", "doc")).toBe("/rengi-media/doc/campaign%20brief");
    expect(buildPublicPagePath("rengi-media", "campaign-wiki", "wiki")).toBe("/rengi-media/wiki/campaign-wiki");
  });

  it("uses the configured public-content domain", () => {
    expect(
      buildPublicPageUrl("rengi-media", "campaign-brief", "doc", {
        currentOrigin: "https://app.dragonfruit.sh",
        publicBaseUrl: "https://dragonfruit.page/",
      })
    ).toBe("https://dragonfruit.page/rengi-media/doc/campaign-brief");
  });

  it("keeps the existing local published-page route for development", () => {
    expect(
      buildPublicPageUrl("rengi-media", "campaign-brief", "doc", {
        currentOrigin: "http://localhost:3000",
        publicBaseUrl: "http://localhost:3002",
      })
    ).toBe("http://localhost:3000/published/rengi-media/campaign-brief");
  });

  it("maps folders to wiki URLs and keeps other page types explicit", () => {
    expect(getPublicPageContentType({ page_type: "folder" })).toBe("wiki");
    expect(getPublicPageContentType({ page_type: "whiteboard" })).toBe("whiteboard");
    expect(getPublicPageContentType({})).toBe("doc");
  });
});
