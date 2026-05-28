/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CSSProperties } from "react";
import { STATIC_COVER_IMAGES } from "@/helpers/cover-image.helper";

type TPageCoverKind = "image" | "solid" | "gradient";

export type TPageCoverId =
  | "calling-of-saint-matthew"
  | "school-of-athens"
  | "flight-into-egypt"
  | "photo-01"
  | "photo-02"
  | "photo-03"
  | "photo-04"
  | "photo-05"
  | "photo-06"
  | "stone"
  | "sand"
  | "olive"
  | "wine"
  | "midnight"
  | "rose-dawn"
  | "sea-glass"
  | "gold-hour"
  | "ember-night";

export type TPageCoverOption = {
  id: TPageCoverId;
  kind: TPageCoverKind;
  label: string;
  subtitle: string;
  src?: string;
  background: string;
};

const IMAGE_OPTIONS: TPageCoverOption[] = [
  {
    id: "calling-of-saint-matthew",
    kind: "image",
    src: STATIC_COVER_IMAGES.IMAGE_1,
    label: "The Calling of Saint Matthew",
    subtitle: "Caravaggio, c. 1600",
    background: `url(${STATIC_COVER_IMAGES.IMAGE_1})`,
  },
  {
    id: "school-of-athens",
    kind: "image",
    src: STATIC_COVER_IMAGES.IMAGE_24,
    label: "The School of Athens",
    subtitle: "Raphael, c. 1510",
    background: `url(${STATIC_COVER_IMAGES.IMAGE_24})`,
  },
  {
    id: "flight-into-egypt",
    kind: "image",
    src: STATIC_COVER_IMAGES.IMAGE_15,
    label: "The Flight into Egypt",
    subtitle: "Elsheimer, 1609",
    background: `url(${STATIC_COVER_IMAGES.IMAGE_15})`,
  },
  {
    id: "photo-01",
    kind: "image",
    src: STATIC_COVER_IMAGES.IMAGE_7,
    label: "Photo 01",
    subtitle: "Archive cover",
    background: `url(${STATIC_COVER_IMAGES.IMAGE_7})`,
  },
  {
    id: "photo-02",
    kind: "image",
    src: STATIC_COVER_IMAGES.IMAGE_9,
    label: "Photo 02",
    subtitle: "Archive cover",
    background: `url(${STATIC_COVER_IMAGES.IMAGE_9})`,
  },
  {
    id: "photo-03",
    kind: "image",
    src: STATIC_COVER_IMAGES.IMAGE_12,
    label: "Photo 03",
    subtitle: "Archive cover",
    background: `url(${STATIC_COVER_IMAGES.IMAGE_12})`,
  },
  {
    id: "photo-04",
    kind: "image",
    src: STATIC_COVER_IMAGES.IMAGE_18,
    label: "Photo 04",
    subtitle: "Archive cover",
    background: `url(${STATIC_COVER_IMAGES.IMAGE_18})`,
  },
  {
    id: "photo-05",
    kind: "image",
    src: STATIC_COVER_IMAGES.IMAGE_21,
    label: "Photo 05",
    subtitle: "Archive cover",
    background: `url(${STATIC_COVER_IMAGES.IMAGE_21})`,
  },
  {
    id: "photo-06",
    kind: "image",
    src: STATIC_COVER_IMAGES.IMAGE_29,
    label: "Photo 06",
    subtitle: "Archive cover",
    background: `url(${STATIC_COVER_IMAGES.IMAGE_29})`,
  },
];

const SOLID_OPTIONS: TPageCoverOption[] = [
  {
    id: "stone",
    kind: "solid",
    label: "Stone",
    subtitle: "Solid color",
    background: "#D8D2CA",
  },
  {
    id: "sand",
    kind: "solid",
    label: "Sand",
    subtitle: "Solid color",
    background: "#E8D3B5",
  },
  {
    id: "olive",
    kind: "solid",
    label: "Olive",
    subtitle: "Solid color",
    background: "#B7BE9E",
  },
  {
    id: "wine",
    kind: "solid",
    label: "Wine",
    subtitle: "Solid color",
    background: "#72505C",
  },
  {
    id: "midnight",
    kind: "solid",
    label: "Midnight",
    subtitle: "Solid color",
    background: "#273142",
  },
];

const GRADIENT_OPTIONS: TPageCoverOption[] = [
  {
    id: "rose-dawn",
    kind: "gradient",
    label: "Rose Dawn",
    subtitle: "Gradient",
    background: "linear-gradient(135deg, #F3D0CF 0%, #F8E8DD 100%)",
  },
  {
    id: "sea-glass",
    kind: "gradient",
    label: "Sea Glass",
    subtitle: "Gradient",
    background: "linear-gradient(135deg, #C4DDD7 0%, #E8F1E8 100%)",
  },
  {
    id: "gold-hour",
    kind: "gradient",
    label: "Gold Hour",
    subtitle: "Gradient",
    background: "linear-gradient(135deg, #E6B46A 0%, #F6E4BF 100%)",
  },
  {
    id: "ember-night",
    kind: "gradient",
    label: "Ember Night",
    subtitle: "Gradient",
    background: "linear-gradient(135deg, #44313D 0%, #8E5B54 55%, #D2A36D 100%)",
  },
];

export const PAGE_COVER_OPTION_GROUPS: Array<{
  id: string;
  label: string;
  options: TPageCoverOption[];
}> = [
  { id: "photos", label: "Photos", options: IMAGE_OPTIONS },
  { id: "solids", label: "Solid colors", options: SOLID_OPTIONS },
  { id: "gradients", label: "Gradients", options: GRADIENT_OPTIONS },
];

export const PAGE_COVER_OPTIONS: TPageCoverOption[] = PAGE_COVER_OPTION_GROUPS.flatMap((group) => group.options);

export function getPageCoverOption(id: string | null | undefined): TPageCoverOption | undefined {
  if (!id) return undefined;
  return PAGE_COVER_OPTIONS.find((option) => option.id === id);
}

/** Resolve a stored cover identifier back to its display source for image covers. */
export function getPageCoverSrc(id: string | null | undefined): string | undefined {
  return getPageCoverOption(id)?.src;
}

export function getPageCoverStyle(id: string | null | undefined): CSSProperties | undefined {
  const option = getPageCoverOption(id);
  if (!option) return undefined;

  if (option.kind === "image") {
    return {
      backgroundImage: option.background,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }

  return {
    background: option.background,
  };
}

/** Narrow type guard for the `view_props.cover` slot. */
export function readPageCoverId(viewProps: unknown): TPageCoverId | undefined {
  if (!viewProps || typeof viewProps !== "object") return undefined;
  const cover = (viewProps as Record<string, unknown>).cover;
  if (typeof cover !== "string") return undefined;
  if (!PAGE_COVER_OPTIONS.some((option) => option.id === cover)) return undefined;
  return cover as TPageCoverId;
}
