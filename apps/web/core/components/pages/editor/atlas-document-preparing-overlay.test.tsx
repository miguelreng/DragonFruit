import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AtlasDocumentPreparingOverlay } from "./atlas-document-preparing-overlay";

describe("AtlasDocumentPreparingOverlay", () => {
  it("is a visual-only skeleton with semantic theme colors", () => {
    const markup = renderToStaticMarkup(<AtlasDocumentPreparingOverlay blockWidthClassName="max-w-doc" />);

    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain('role="status"');
    expect(markup).not.toContain("aria-live");
    expect(markup).toContain("bg-surface-1");
    expect(markup).toContain("bg-layer-1");
  });

  it("removes the pulse under reduced motion without removing the loading silhouette", () => {
    const markup = renderToStaticMarkup(<AtlasDocumentPreparingOverlay blockWidthClassName="max-w-doc" />);

    expect(markup).toContain("animate-pulse");
    expect(markup).toContain("motion-reduce:animate-none");
    expect(markup).toContain('data-atlas-document-skeleton="true"');
  });
});
