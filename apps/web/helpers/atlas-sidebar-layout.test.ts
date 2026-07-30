import { describe, expect, it } from "vitest";
import {
  ATLAS_SIDEBAR_DEFAULT_WIDTH,
  ATLAS_SIDEBAR_MAX_WIDTH_CAP,
  ATLAS_SIDEBAR_MIN_WIDTH,
  clampAtlasSidebarWidth,
  getAtlasSidebarMaxWidth,
  getAtlasSidebarWidthForKey,
  parsePersistedAtlasSidebarWidth,
  resolveAtlasSidebarWidth,
  snapAtlasSidebarWidth,
} from "./atlas-sidebar-layout";

describe("getAtlasSidebarMaxWidth", () => {
  it("caps at 720px on wide viewports", () => {
    expect(getAtlasSidebarMaxWidth(1920)).toBe(ATLAS_SIDEBAR_MAX_WIDTH_CAP);
  });

  it("leaves 420px for content on narrower viewports", () => {
    expect(getAtlasSidebarMaxWidth(1024)).toBe(1024 - 420);
  });

  it("never drops below the min width on very narrow viewports", () => {
    expect(getAtlasSidebarMaxWidth(600)).toBe(ATLAS_SIDEBAR_MIN_WIDTH);
  });
});

describe("clampAtlasSidebarWidth", () => {
  it("clamps below-min widths up to the min", () => {
    expect(clampAtlasSidebarWidth(100, 1440)).toBe(ATLAS_SIDEBAR_MIN_WIDTH);
  });

  it("clamps above-max widths down to the max", () => {
    expect(clampAtlasSidebarWidth(2000, 1920)).toBe(ATLAS_SIDEBAR_MAX_WIDTH_CAP);
  });

  it("passes through widths already in range", () => {
    expect(clampAtlasSidebarWidth(500, 1440)).toBe(500);
  });

  it("clamps to the min on a narrow viewport even if that exceeds the nominal max", () => {
    expect(clampAtlasSidebarWidth(500, 600)).toBe(ATLAS_SIDEBAR_MIN_WIDTH);
  });
});

describe("snapAtlasSidebarWidth", () => {
  it("snaps widths within the threshold below the default", () => {
    expect(snapAtlasSidebarWidth(ATLAS_SIDEBAR_DEFAULT_WIDTH - 24)).toBe(ATLAS_SIDEBAR_DEFAULT_WIDTH);
  });

  it("snaps widths within the threshold above the default", () => {
    expect(snapAtlasSidebarWidth(ATLAS_SIDEBAR_DEFAULT_WIDTH + 24)).toBe(ATLAS_SIDEBAR_DEFAULT_WIDTH);
  });

  it("does not snap just outside the threshold", () => {
    expect(snapAtlasSidebarWidth(ATLAS_SIDEBAR_DEFAULT_WIDTH + 25)).toBe(ATLAS_SIDEBAR_DEFAULT_WIDTH + 25);
  });

  it("leaves widths far from the default untouched", () => {
    expect(snapAtlasSidebarWidth(500)).toBe(500);
  });
});

describe("parsePersistedAtlasSidebarWidth", () => {
  it("parses a valid numeric string", () => {
    expect(parsePersistedAtlasSidebarWidth("420")).toBe(420);
  });

  it("returns null for missing values", () => {
    expect(parsePersistedAtlasSidebarWidth(null)).toBeNull();
    expect(parsePersistedAtlasSidebarWidth(undefined)).toBeNull();
    expect(parsePersistedAtlasSidebarWidth("")).toBeNull();
  });

  it("returns null for corrupted or non-positive storage", () => {
    expect(parsePersistedAtlasSidebarWidth("not-a-number")).toBeNull();
    expect(parsePersistedAtlasSidebarWidth("0")).toBeNull();
    expect(parsePersistedAtlasSidebarWidth("-100")).toBeNull();
  });
});

describe("resolveAtlasSidebarWidth", () => {
  it("falls back to the 350px default when storage is empty", () => {
    expect(resolveAtlasSidebarWidth(null, 1440)).toBe(ATLAS_SIDEBAR_DEFAULT_WIDTH);
  });

  it("falls back to the default when storage is corrupted", () => {
    expect(resolveAtlasSidebarWidth("garbage", 1440)).toBe(ATLAS_SIDEBAR_DEFAULT_WIDTH);
  });

  it("re-clamps a persisted width that no longer fits a smaller viewport", () => {
    expect(resolveAtlasSidebarWidth("700", 900)).toBe(getAtlasSidebarMaxWidth(900));
  });

  it("keeps a persisted width that still fits", () => {
    expect(resolveAtlasSidebarWidth("500", 1440)).toBe(500);
  });
});

describe("getAtlasSidebarWidthForKey", () => {
  it("grows the panel on ArrowLeft by the small step", () => {
    expect(getAtlasSidebarWidthForKey("ArrowLeft", 400, false, 1440)).toBe(416);
  });

  it("shrinks the panel on ArrowRight by the small step", () => {
    expect(getAtlasSidebarWidthForKey("ArrowRight", 400, false, 1440)).toBe(384);
  });

  it("uses the large step with Shift", () => {
    expect(getAtlasSidebarWidthForKey("ArrowLeft", 400, true, 1440)).toBe(464);
  });

  it("resets to the default on Home", () => {
    expect(getAtlasSidebarWidthForKey("Home", 600, false, 1440)).toBe(ATLAS_SIDEBAR_DEFAULT_WIDTH);
  });

  it("clamps keyboard adjustments at the bounds", () => {
    expect(getAtlasSidebarWidthForKey("ArrowRight", ATLAS_SIDEBAR_MIN_WIDTH + 5, false, 1440)).toBe(
      ATLAS_SIDEBAR_MIN_WIDTH
    );
  });

  it("returns null for unhandled keys", () => {
    expect(getAtlasSidebarWidthForKey("Tab", 400, false, 1440)).toBeNull();
  });
});
