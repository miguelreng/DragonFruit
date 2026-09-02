import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  HORIZONTAL_STACK_ASSETS,
  VERTICAL_STACK_ASSETS,
  ILLUSTRATION_ASSETS,
} from "@plane/propel/empty-state";
import { EmptyStateIcon, EMPTY_STATE_ICON_NAMES } from "./empty-state-icon";
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

  it("renders every registered icon name as an inline svg", () => {
    for (const name of EMPTY_STATE_ICON_NAMES) {
      const markup = renderToStaticMarkup(<EmptyStateIcon name={name} />);
      expect(markup, `icon "${name}"`).toContain("<svg");
      expect(markup, `icon "${name}"`).not.toContain("<img");
    }
  });
});

describe("propel empty-state asset registry", () => {
  it("renders every assetKey as an inline svg icon, never an image", () => {
    const registries = { ...HORIZONTAL_STACK_ASSETS, ...VERTICAL_STACK_ASSETS, ...ILLUSTRATION_ASSETS };
    for (const [key, Asset] of Object.entries(registries)) {
      const markup = renderToStaticMarkup(<Asset />);
      expect(markup, `assetKey "${key}"`).toContain("<svg");
      expect(markup, `assetKey "${key}"`).not.toContain("<img");
    }
  });
});
