/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/** Default docked width — also the snap target and the keyboard "Home" reset. */
export const ATLAS_SIDEBAR_DEFAULT_WIDTH = 350;
/** Width of the collapsed rail (3.25rem) — the origin of rail-edge drags. */
export const ATLAS_SIDEBAR_RAIL_WIDTH = 52;
/** Narrowest a user can drag the docked panel to. */
export const ATLAS_SIDEBAR_MIN_WIDTH = 320;
/** Hard cap on the max width, before the viewport-relative margin is applied. */
export const ATLAS_SIDEBAR_MAX_WIDTH_CAP = 720;
/** Minimum usable width preserved for the workspace editor beside Atlas. */
export const ATLAS_EDITOR_MIN_WIDTH = 600;
/** Visual gap between the workspace panel and a docked Atlas panel. */
export const ATLAS_LAYOUT_GAP = 2;
/** Dragging within this many px of the default snaps to it. */
export const ATLAS_SIDEBAR_SNAP_THRESHOLD = 24;
/**
 * Dragging this many px past the min/max bound snaps to the rail / full
 * width on release, instead of settling at the boundary width.
 */
export const ATLAS_SIDEBAR_SNAP_OVERSHOOT = 60;
/** Resistance applied to the live width when dragging past a bound. */
export const ATLAS_SIDEBAR_RUBBER_FACTOR = 0.3;
/** Cap on how far past a bound the live width visually stretches. */
export const ATLAS_SIDEBAR_RUBBER_MAX = 40;
/** Arrow-key resize step, in px. */
export const ATLAS_SIDEBAR_KEYBOARD_STEP = 16;
/** Shift+Arrow resize step, in px. */
export const ATLAS_SIDEBAR_KEYBOARD_STEP_LARGE = 64;

/**
 * Max docked width for the actual shared container, not the browser viewport.
 */
export function getAtlasSidebarMaxWidth(containerWidth: number): number {
  return Math.max(
    ATLAS_SIDEBAR_MIN_WIDTH,
    Math.min(ATLAS_SIDEBAR_MAX_WIDTH_CAP, containerWidth - ATLAS_EDITOR_MIN_WIDTH - ATLAS_LAYOUT_GAP)
  );
}

/** Clamps a docked candidate against the measured shared container. */
export function clampAtlasSidebarWidth(width: number, containerWidth: number): number {
  const max = getAtlasSidebarMaxWidth(containerWidth);
  return Math.min(Math.max(width, ATLAS_SIDEBAR_MIN_WIDTH), max);
}

/** Store the user's preference independently from today's window/container. */
export function clampAtlasSidebarPreferredWidth(width: number): number {
  return Math.min(Math.max(width, ATLAS_SIDEBAR_MIN_WIDTH), ATLAS_SIDEBAR_MAX_WIDTH_CAP);
}

export type TAtlasSidebarLayout = {
  mode: "docked" | "overlay";
  atlasWidth: number;
  remainingEditorWidth: number;
};

/**
 * Dock only when both surfaces remain genuinely usable. Otherwise Atlas
 * overlays the workspace and preserves the preferred docked width for later.
 */
export function resolveAtlasSidebarLayout({
  containerWidth,
  preferredWidth,
  gap = ATLAS_LAYOUT_GAP,
  minEditorWidth = ATLAS_EDITOR_MIN_WIDTH,
}: {
  containerWidth: number;
  preferredWidth: number;
  gap?: number;
  minEditorWidth?: number;
}): TAtlasSidebarLayout {
  const preferred = clampAtlasSidebarPreferredWidth(preferredWidth);
  const availableForAtlas = containerWidth - minEditorWidth - gap;
  if (availableForAtlas < ATLAS_SIDEBAR_MIN_WIDTH) {
    return {
      mode: "overlay",
      atlasWidth: preferred,
      remainingEditorWidth: Math.max(0, containerWidth),
    };
  }
  const atlasWidth = Math.min(preferred, ATLAS_SIDEBAR_MAX_WIDTH_CAP, availableForAtlas);
  return {
    mode: "docked",
    atlasWidth,
    remainingEditorWidth: Math.max(0, containerWidth - atlasWidth - gap),
  };
}

/** Snaps a width to the default when within the snap threshold of it. */
export function snapAtlasSidebarWidth(width: number): number {
  return Math.abs(width - ATLAS_SIDEBAR_DEFAULT_WIDTH) <= ATLAS_SIDEBAR_SNAP_THRESHOLD
    ? ATLAS_SIDEBAR_DEFAULT_WIDTH
    : width;
}

/**
 * Parses a persisted width value (e.g. from localStorage). Returns `null` for
 * anything that isn't a positive, finite number — a missing key, a corrupted
 * value, or a value written by older code.
 */
export function parsePersistedAtlasSidebarWidth(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

/**
 * Resolves the width to render: parses the persisted value (falling back to
 * the default when missing/invalid) and re-clamps it against the current
 * viewport, since a value saved on a larger monitor may no longer fit.
 */
export function resolveAtlasSidebarWidth(raw: string | null | undefined, containerWidth: number): number {
  const persisted = parsePersistedAtlasSidebarWidth(raw);
  return clampAtlasSidebarWidth(persisted ?? ATLAS_SIDEBAR_DEFAULT_WIDTH, containerWidth);
}

export type TAtlasSidebarDragIntent = "collapse" | "expand" | "resize";

/**
 * Live width while dragging past a bound: the panel follows with diminishing
 * resistance (rubber band) instead of hard-stopping, signalling that pulling
 * further does something (the tier snap) without letting the layout run away.
 */
export function rubberBandAtlasSidebarWidth(raw: number, containerWidth: number): number {
  const max = getAtlasSidebarMaxWidth(containerWidth);
  if (raw < ATLAS_SIDEBAR_MIN_WIDTH)
    return ATLAS_SIDEBAR_MIN_WIDTH - Math.min((ATLAS_SIDEBAR_MIN_WIDTH - raw) * ATLAS_SIDEBAR_RUBBER_FACTOR, ATLAS_SIDEBAR_RUBBER_MAX);
  if (raw > max) return max + Math.min((raw - max) * ATLAS_SIDEBAR_RUBBER_FACTOR, ATLAS_SIDEBAR_RUBBER_MAX);
  return raw;
}

/**
 * Live width for a drag that started on the collapsed rail. Below the regular
 * minimum the panel tracks the pointer exactly (it's growing out of the rail,
 * so sub-minimum widths are the natural peek zone); above the max it rubber
 * bands like a regular drag.
 */
export function getAtlasRailLiveDragWidth(raw: number, containerWidth: number): number {
  const max = getAtlasSidebarMaxWidth(containerWidth);
  if (raw > max) return max + Math.min((raw - max) * ATLAS_SIDEBAR_RUBBER_FACTOR, ATLAS_SIDEBAR_RUBBER_MAX);
  return Math.max(raw, ATLAS_SIDEBAR_RAIL_WIDTH);
}

/**
 * Release intent for a drag that started on the collapsed rail: crossing the
 * regular minimum commits the expand (anything short of it springs back to
 * the rail), and overshooting the max still snaps to full width — so one
 * gesture can go rail → any width → full.
 */
export function getAtlasRailDragIntent(rawWidth: number, containerWidth: number): TAtlasSidebarDragIntent {
  if (rawWidth < ATLAS_SIDEBAR_MIN_WIDTH) return "collapse";
  if (rawWidth >= getAtlasSidebarMaxWidth(containerWidth) + ATLAS_SIDEBAR_SNAP_OVERSHOOT) return "expand";
  return "resize";
}

/**
 * Classifies a finished drag from its raw (unclamped) width: overshooting
 * well past the min collapses to the rail, well past the max expands to full
 * width, anything else is a plain resize. Stopping exactly at a bound stays a
 * resize — only a deliberate overshoot triggers the tier change.
 */
export function getAtlasSidebarDragIntent(rawWidth: number, containerWidth: number): TAtlasSidebarDragIntent {
  if (rawWidth <= ATLAS_SIDEBAR_MIN_WIDTH - ATLAS_SIDEBAR_SNAP_OVERSHOOT) return "collapse";
  if (rawWidth >= getAtlasSidebarMaxWidth(containerWidth) + ATLAS_SIDEBAR_SNAP_OVERSHOOT) return "expand";
  return "resize";
}

/**
 * Given a keyboard event on the resize separator, returns the next width, or
 * `null` if the key isn't handled. Left/Right step by
 * `ATLAS_SIDEBAR_KEYBOARD_STEP` (or `_LARGE` with Shift); Home resets to the
 * default. The result is already clamped to the viewport.
 */
export function getAtlasSidebarWidthForKey(
  key: string,
  currentWidth: number,
  shiftKey: boolean,
  containerWidth: number
): number | null {
  const step = shiftKey ? ATLAS_SIDEBAR_KEYBOARD_STEP_LARGE : ATLAS_SIDEBAR_KEYBOARD_STEP;
  // The separator sits on the panel's left edge and the panel is docked to
  // the right, so moving the handle left grows the panel.
  if (key === "ArrowLeft") return clampAtlasSidebarWidth(currentWidth + step, containerWidth);
  if (key === "ArrowRight") return clampAtlasSidebarWidth(currentWidth - step, containerWidth);
  if (key === "Home") return clampAtlasSidebarWidth(ATLAS_SIDEBAR_DEFAULT_WIDTH, containerWidth);
  return null;
}
