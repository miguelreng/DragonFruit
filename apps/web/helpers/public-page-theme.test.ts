// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { applyPublicPageLightTheme } from "./public-page-theme";

describe("public page theme", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.removeProperty("color-scheme");
  });

  it("forces light mode and restores the previous root theme", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    document.documentElement.style.setProperty("color-scheme", "dark");

    const restore = applyPublicPageLightTheme();

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.documentElement.style.getPropertyValue("color-scheme")).toBe("only light");

    restore();

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.style.getPropertyValue("color-scheme")).toBe("dark");
  });

  it("removes public theme overrides when no root theme existed", () => {
    const restore = applyPublicPageLightTheme();

    restore();

    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(document.documentElement.style.getPropertyValue("color-scheme")).toBe("");
  });
});
