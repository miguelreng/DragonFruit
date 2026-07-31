// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import {
  applyPublicPageMetadata,
  buildPublicPageMetadata,
  publicPageHtmlToDescription,
  publicPageHtmlToPlainText,
  truncatePublicPageText,
} from "./public-page-metadata";

describe("public page metadata", () => {
  afterEach(() => {
    document.head.innerHTML = "";
    document.title = "";
  });

  it("extracts a safe readable excerpt from document HTML", () => {
    expect(
      publicPageHtmlToPlainText(
        '<h1>Publishing &amp; Media</h1><script>alert("no")</script><p>Plan&nbsp;for August.</p>'
      )
    ).toBe("Publishing & Media Plan for August.");
  });

  it("prefers the first meaningful paragraph over section labels", () => {
    expect(
      publicPageHtmlToDescription(
        "<h2>Objetivo</h2><p></p><p>Mantener un flujo de publicaciones consistente durante agosto.</p>"
      )
    ).toBe("Mantener un flujo de publicaciones consistente durante agosto.");
  });

  it("truncates at a word boundary without splitting emoji", () => {
    expect(truncatePublicPageText("A clear publishing plan 🚀 for the whole team", 28)).toBe(
      "A clear publishing plan 🚀…"
    );
  });

  it("builds canonical social metadata around the public page", () => {
    const metadata = buildPublicPageMetadata({
      canonicalUrl: "https://dragonfruit.page/rengi-media/doc/publishing-brief",
      contentType: "doc",
      descriptionHtml: "<p>Publishing plan for August.</p>",
      pageSlug: "publishing-brief",
      pageTitle: "Publishing",
      updatedAt: "2026-07-31T12:00:00Z",
      workspaceSlug: "rengi-media",
    });

    expect(metadata).toEqual({
      canonicalUrl: "https://dragonfruit.page/rengi-media/doc/publishing-brief",
      description: "Publishing plan for August.",
      imageUrl:
        "https://dragonfruit.page/api/public-page-image?workspaceIdentifier=rengi-media&pageType=doc&pageSlug=publishing-brief",
      siteName: "Rengi Media",
      title: "Publishing",
      updatedAt: "2026-07-31T12:00:00Z",
    });
  });

  it("updates and restores browser metadata", () => {
    document.head.innerHTML = '<meta name="description" content="Generic"><meta property="og:title" content="App">';
    document.title = "DragonFruit";
    const metadata = buildPublicPageMetadata({
      canonicalUrl: "https://dragonfruit.page/rengi-media/doc/publishing-brief",
      contentType: "doc",
      descriptionHtml: "<p>Publishing plan for August.</p>",
      pageSlug: "publishing-brief",
      pageTitle: "Publishing",
      workspaceSlug: "rengi-media",
    });

    const restore = applyPublicPageMetadata(metadata);

    expect(document.title).toBe("Publishing");
    expect(document.head.querySelector("meta[name='description']")?.getAttribute("content")).toBe(
      "Publishing plan for August."
    );
    expect(document.head.querySelector("meta[property='og:title']")?.getAttribute("content")).toBe("Publishing");
    expect(document.head.querySelector("link[rel='canonical']")?.getAttribute("href")).toBe(metadata.canonicalUrl);

    restore();
    expect(document.title).toBe("DragonFruit");
    expect(document.head.querySelector("meta[name='description']")?.getAttribute("content")).toBe("Generic");
    expect(document.head.querySelector("meta[property='og:title']")?.getAttribute("content")).toBe("App");
    expect(document.head.querySelector("link[rel='canonical']")).toBeNull();
  });
});
