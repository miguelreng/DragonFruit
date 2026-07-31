import { describe, expect, it } from "vitest";
import {
  buildPublicPagePath,
  buildPublicPageUrl,
  getPublicPageContentType,
  isCanonicalPublicPagePath,
} from "./page-public";

describe("public page URLs", () => {
  it("recognizes every canonical public page route without matching private workspace routes", () => {
    expect(isCanonicalPublicPagePath("/rengi-media/doc/publishing-brief")).toBe(true);
    expect(isCanonicalPublicPagePath("/rengi-media/wiki/brand-guide/")).toBe(true);
    expect(isCanonicalPublicPagePath("/rengi-media/whiteboard/story-map")).toBe(true);
    expect(isCanonicalPublicPagePath("/rengi-media/pdf/press-kit")).toBe(true);
    expect(isCanonicalPublicPagePath("/rengi-media/sheet/content-plan")).toBe(true);

    expect(isCanonicalPublicPagePath("/rengi-media/docs")).toBe(false);
    expect(isCanonicalPublicPagePath("/rengi-media/projects/project-id")).toBe(false);
    expect(isCanonicalPublicPagePath("/published/rengi-media/publishing-brief")).toBe(false);
  });

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
