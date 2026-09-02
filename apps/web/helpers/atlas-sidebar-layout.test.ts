import { describe, expect, it } from "vitest";
import {
  ATLAS_SIDEBAR_DEFAULT_WIDTH,
  ATLAS_SIDEBAR_MAX_WIDTH_CAP,
  ATLAS_SIDEBAR_MIN_WIDTH,
  ATLAS_SIDEBAR_RAIL_WIDTH,
  ATLAS_SIDEBAR_RUBBER_MAX,
  ATLAS_SIDEBAR_SNAP_OVERSHOOT,
  clampAtlasSidebarPreferredWidth,
  clampAtlasSidebarWidth,
  getAtlasRailDragIntent,
  getAtlasRailLiveDragWidth,
  getAtlasSidebarDragIntent,
  getAtlasSidebarMaxWidth,
  getAtlasSidebarWidthForKey,
  parsePersistedAtlasSidebarWidth,
  resolveAtlasSidebarWidth,
  resolveAtlasSidebarLayout,
  rubberBandAtlasSidebarWidth,
  snapAtlasSidebarWidth,
} from "./atlas-sidebar-layout";

describe("getAtlasSidebarMaxWidth", () => {
  it("caps at 720px on wide viewports", () => {
    expect(getAtlasSidebarMaxWidth(1920)).toBe(ATLAS_SIDEBAR_MAX_WIDTH_CAP);
  });

  it("leaves 600px plus the panel gap for content", () => {
    expect(getAtlasSidebarMaxWidth(1024)).toBe(1024 - 600 - 2);
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

describe("clampAtlasSidebarPreferredWidth", () => {
  it("preserves a valid preference without using the current viewport", () => {
    expect(clampAtlasSidebarPreferredWidth(500)).toBe(500);
  });

  it("bounds persisted preferences globally", () => {
    expect(clampAtlasSidebarPreferredWidth(100)).toBe(ATLAS_SIDEBAR_MIN_WIDTH);
    expect(clampAtlasSidebarPreferredWidth(2000)).toBe(ATLAS_SIDEBAR_MAX_WIDTH_CAP);
  });
});

describe("resolveAtlasSidebarLayout", () => {
  it.each([
    [752, "overlay", 752],
    [766, "overlay", 766],
    [1022, "docked", 670],
    [1182, "docked", 830],
  ] as const)("resolves a %ipx container to %s", (containerWidth, mode, remainingEditorWidth) => {
    expect(resolveAtlasSidebarLayout({ containerWidth, preferredWidth: 350 })).toEqual({
      mode,
      atlasWidth: 350,
      remainingEditorWidth,
    });
  });

  it("shrinks Atlas before letting the editor fall below its minimum", () => {
    expect(resolveAtlasSidebarLayout({ containerWidth: 1000, preferredWidth: 500 })).toEqual({
      mode: "docked",
      atlasWidth: 398,
      remainingEditorWidth: 600,
    });
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

describe("getAtlasSidebarDragIntent", () => {
  it("collapses when the drag overshoots past the min", () => {
    expect(getAtlasSidebarDragIntent(ATLAS_SIDEBAR_MIN_WIDTH - ATLAS_SIDEBAR_SNAP_OVERSHOOT, 1440)).toBe("collapse");
  });

  it("expands to full when the drag overshoots past the max", () => {
    expect(getAtlasSidebarDragIntent(ATLAS_SIDEBAR_MAX_WIDTH_CAP + ATLAS_SIDEBAR_SNAP_OVERSHOOT, 1440)).toBe("expand");
  });

  it("uses the viewport-relative max on narrower containers", () => {
    const max = getAtlasSidebarMaxWidth(1024);
    expect(getAtlasSidebarDragIntent(max + ATLAS_SIDEBAR_SNAP_OVERSHOOT, 1024)).toBe("expand");
    expect(getAtlasSidebarDragIntent(max + ATLAS_SIDEBAR_SNAP_OVERSHOOT - 1, 1024)).toBe("resize");
  });

  it("stays a resize when the drag stops at or near a bound", () => {
    expect(getAtlasSidebarDragIntent(ATLAS_SIDEBAR_MIN_WIDTH, 1440)).toBe("resize");
    expect(getAtlasSidebarDragIntent(ATLAS_SIDEBAR_MIN_WIDTH - ATLAS_SIDEBAR_SNAP_OVERSHOOT + 1, 1440)).toBe("resize");
    expect(getAtlasSidebarDragIntent(ATLAS_SIDEBAR_MAX_WIDTH_CAP + ATLAS_SIDEBAR_SNAP_OVERSHOOT - 1, 1440)).toBe(
      "resize"
    );
  });

  it("stays a resize for in-range widths", () => {
    expect(getAtlasSidebarDragIntent(450, 1440)).toBe("resize");
  });
});

describe("rubberBandAtlasSidebarWidth", () => {
  it("passes through in-range widths", () => {
    expect(rubberBandAtlasSidebarWidth(450, 1440)).toBe(450);
  });

  it("applies resistance below the min", () => {
    const banded = rubberBandAtlasSidebarWidth(ATLAS_SIDEBAR_MIN_WIDTH - 100, 1440);
    expect(banded).toBeLessThan(ATLAS_SIDEBAR_MIN_WIDTH);
    expect(banded).toBeGreaterThan(ATLAS_SIDEBAR_MIN_WIDTH - 100);
  });

  it("caps the visual overshoot on both sides", () => {
    expect(rubberBandAtlasSidebarWidth(0, 1440)).toBe(ATLAS_SIDEBAR_MIN_WIDTH - ATLAS_SIDEBAR_RUBBER_MAX);
    expect(rubberBandAtlasSidebarWidth(5000, 1920)).toBe(ATLAS_SIDEBAR_MAX_WIDTH_CAP + ATLAS_SIDEBAR_RUBBER_MAX);
  });
});

describe("getAtlasRailLiveDragWidth", () => {
  it("tracks the pointer exactly through the sub-minimum peek zone", () => {
    expect(getAtlasRailLiveDragWidth(200, 1440)).toBe(200);
  });

  it("never renders narrower than the rail", () => {
    expect(getAtlasRailLiveDragWidth(10, 1440)).toBe(ATLAS_SIDEBAR_RAIL_WIDTH);
  });

  it("rubber bands past the max like a regular drag", () => {
    expect(getAtlasRailLiveDragWidth(5000, 1920)).toBe(ATLAS_SIDEBAR_MAX_WIDTH_CAP + ATLAS_SIDEBAR_RUBBER_MAX);
  });
});

describe("getAtlasRailDragIntent", () => {
  it("springs back to the rail when released short of the minimum", () => {
    expect(getAtlasRailDragIntent(ATLAS_SIDEBAR_MIN_WIDTH - 1, 1440)).toBe("collapse");
  });

  it("commits the expand once the drag crosses the minimum", () => {
    expect(getAtlasRailDragIntent(ATLAS_SIDEBAR_MIN_WIDTH, 1440)).toBe("resize");
  });

  it("snaps to full width when overshooting the max in the same gesture", () => {
    expect(getAtlasRailDragIntent(ATLAS_SIDEBAR_MAX_WIDTH_CAP + ATLAS_SIDEBAR_SNAP_OVERSHOOT, 1440)).toBe("expand");
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
