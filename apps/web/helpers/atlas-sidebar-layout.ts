/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/** Default docked width — also the snap target and the keyboard "Home" reset. */
export const ATLAS_SIDEBAR_DEFAULT_WIDTH = 350;
/** Narrowest a user can drag the docked panel to. */
export const ATLAS_SIDEBAR_MIN_WIDTH = 320;
/** Hard cap on the max width, before the viewport-relative margin is applied. */
export const ATLAS_SIDEBAR_MAX_WIDTH_CAP = 720;
/** Content pane must keep at least this much space beside the docked panel. */
export const ATLAS_SIDEBAR_VIEWPORT_MARGIN = 420;
/** Dragging within this many px of the default snaps to it. */
export const ATLAS_SIDEBAR_SNAP_THRESHOLD = 24;
/** Arrow-key resize step, in px. */
export const ATLAS_SIDEBAR_KEYBOARD_STEP = 16;
/** Shift+Arrow resize step, in px. */
export const ATLAS_SIDEBAR_KEYBOARD_STEP_LARGE = 64;

/**
 * Max allowed width for a given viewport: `min(720px, viewport - 420px)`,
 * floored at the min width so an inverted range (very narrow viewports) never
 * produces a max below the min.
 */
export function getAtlasSidebarMaxWidth(viewportWidth: number): number {
  return Math.max(
    ATLAS_SIDEBAR_MIN_WIDTH,
    Math.min(ATLAS_SIDEBAR_MAX_WIDTH_CAP, viewportWidth - ATLAS_SIDEBAR_VIEWPORT_MARGIN)
  );
}

/** Clamps a candidate width to `[MIN, getAtlasSidebarMaxWidth(viewportWidth)]`. */
export function clampAtlasSidebarWidth(width: number, viewportWidth: number): number {
  const max = getAtlasSidebarMaxWidth(viewportWidth);
  return Math.min(Math.max(width, ATLAS_SIDEBAR_MIN_WIDTH), max);
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
export function resolveAtlasSidebarWidth(raw: string | null | undefined, viewportWidth: number): number {
  const persisted = parsePersistedAtlasSidebarWidth(raw);
  return clampAtlasSidebarWidth(persisted ?? ATLAS_SIDEBAR_DEFAULT_WIDTH, viewportWidth);
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
  viewportWidth: number
): number | null {
  const step = shiftKey ? ATLAS_SIDEBAR_KEYBOARD_STEP_LARGE : ATLAS_SIDEBAR_KEYBOARD_STEP;
  // The separator sits on the panel's left edge and the panel is docked to
  // the right, so moving the handle left grows the panel.
  if (key === "ArrowLeft") return clampAtlasSidebarWidth(currentWidth + step, viewportWidth);
  if (key === "ArrowRight") return clampAtlasSidebarWidth(currentWidth - step, viewportWidth);
  if (key === "Home") return clampAtlasSidebarWidth(ATLAS_SIDEBAR_DEFAULT_WIDTH, viewportWidth);
  return null;
}
