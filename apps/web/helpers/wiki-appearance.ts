/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Appearance + ordering settings for a published wiki (a folder page).
 * Persisted on the folder's view_props.wiki so the public reader and the
 * in-app settings modal share one source of truth.
 */

export type TWikiAccentKey = "magenta" | "green" | "blue" | "amber" | "ink";

/** Absent = follow the reader's system preference. */
export type TWikiThemeKey = "light" | "dark";

export type TWikiViewProps = {
  /** Child doc ids in reader order; docs not listed keep creation order after these. */
  order?: string[];
  accent?: TWikiAccentKey;
  theme?: TWikiThemeKey;
  /** Child doc ids excluded from the published reader. */
  hidden?: string[];
};

export const WIKI_ACCENTS: Record<TWikiAccentKey, { label: string; light: string; dark: string }> = {
  magenta: { label: "Magenta", light: "#b30f78", dark: "#e4519f" },
  green: { label: "Forest", light: "#486c4a", dark: "#93b894" },
  blue: { label: "Cobalt", light: "#2757c4", dark: "#7ca6f5" },
  amber: { label: "Amber", light: "#b45309", dark: "#e5a158" },
  ink: { label: "Ink", light: "#171914", dark: "#eceade" },
};

export const DEFAULT_WIKI_ACCENT: TWikiAccentKey = "magenta";

export const getWikiViewProps = (viewProps: Record<string, unknown> | undefined | null): TWikiViewProps => {
  const raw = viewProps?.wiki;
  if (!raw || typeof raw !== "object") return {};
  const wiki = raw as Record<string, unknown>;
  const order = Array.isArray(wiki.order) ? wiki.order.filter((id): id is string => typeof id === "string") : undefined;
  const accent =
    typeof wiki.accent === "string" && wiki.accent in WIKI_ACCENTS ? (wiki.accent as TWikiAccentKey) : undefined;
  const theme = wiki.theme === "light" || wiki.theme === "dark" ? (wiki.theme as TWikiThemeKey) : undefined;
  const hidden = Array.isArray(wiki.hidden)
    ? wiki.hidden.filter((id): id is string => typeof id === "string")
    : undefined;
  return { order, accent, theme, hidden };
};
