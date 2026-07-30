import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SimpleEmptyState } from "./simple-empty-state-root";

describe("SimpleEmptyState visuals", () => {
  it("renders a semantic Solar icon for routine empty states", () => {
    const markup = renderToStaticMarkup(
      <SimpleEmptyState title="No activity" visual={{ type: "icon", name: "activity" }} />
    );

    expect(markup).toContain("<svg");
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain("<img");
  });

  it("retains illustrations for explanatory empty states", () => {
    const markup = renderToStaticMarkup(
      <SimpleEmptyState title="Learn more" visual={{ type: "asset", path: "/explanation.webp", alt: "Guide" }} />
    );

    expect(markup).toContain('<img src="/explanation.webp"');
    expect(markup).toContain('alt="Guide"');
  });
});
