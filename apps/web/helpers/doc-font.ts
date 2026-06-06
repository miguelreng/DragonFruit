/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export const DOC_FONT_STYLE_OPTIONS = [
  {
    value: "font-default",
    label: "Default (Figtree + Newsreader)",
  },
  {
    value: "font-figtree",
    label: "Figtree",
  },
  {
    value: "font-newsreader",
    label: "Newsreader",
  },
  {
    value: "font-inter",
    label: "Inter",
  },
] as const;

export type TDocFontStyle = (typeof DOC_FONT_STYLE_OPTIONS)[number]["value"];

export const DEFAULT_DOC_FONT_STYLE: TDocFontStyle = "font-default";

const DOC_FONT_STYLE_SET = new Set<TDocFontStyle>(DOC_FONT_STYLE_OPTIONS.map((option) => option.value));
const LEGACY_DOC_FONT_STYLE_MAP: Record<string, TDocFontStyle> = {
  "sans-serif": "font-default",
  serif: "font-newsreader",
  monospace: "font-inter",
};

export function normalizeDocFontStyle(value: unknown): TDocFontStyle {
  if (typeof value === "string") {
    if (DOC_FONT_STYLE_SET.has(value as TDocFontStyle)) {
      return value as TDocFontStyle;
    }
    const legacyFontStyle = LEGACY_DOC_FONT_STYLE_MAP[value];
    if (legacyFontStyle) {
      return legacyFontStyle;
    }
  }

  return DEFAULT_DOC_FONT_STYLE;
}
