import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AtlasActivityIndicatorGraphic } from "./atlas-activity-indicator";

describe("AtlasActivityIndicatorGraphic", () => {
  it("keeps the morph animation when motion is allowed", () => {
    const markup = renderToStaticMarkup(<AtlasActivityIndicatorGraphic prefersReducedMotion={false} />);

    expect(markup).toContain('data-reduced-motion="false"');
    expect(markup).toContain("<animate");
  });

  it("renders a static indicator when reduced motion is preferred", () => {
    const markup = renderToStaticMarkup(<AtlasActivityIndicatorGraphic prefersReducedMotion />);

    expect(markup).toContain('data-reduced-motion="true"');
    expect(markup).not.toContain("<animate");
  });
});
