/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Public-domain Renaissance / classical paintings, sourced from Wikimedia
// Commons. These are the same files the home hero rotates between, reused
// here as doc cover options so the design language stays consistent.
import calling from "@/app/assets/home/calling-of-saint-matthew.jpg?url";
import flight from "@/app/assets/home/flight-into-egypt.jpg?url";
import athens from "@/app/assets/home/school-of-athens.jpg?url";

export type TPageCoverId = "calling-of-saint-matthew" | "school-of-athens" | "flight-into-egypt";

export const PAGE_COVER_OPTIONS: Array<{
  id: TPageCoverId;
  src: string;
  label: string;
  artist: string;
}> = [
  {
    id: "calling-of-saint-matthew",
    src: calling,
    label: "The Calling of Saint Matthew",
    artist: "Caravaggio, c. 1600",
  },
  {
    id: "school-of-athens",
    src: athens,
    label: "The School of Athens",
    artist: "Raphael, c. 1510",
  },
  {
    id: "flight-into-egypt",
    src: flight,
    label: "The Flight into Egypt",
    artist: "Elsheimer, 1609",
  },
];

/** Resolve a stored cover identifier back to its image src. */
export function getPageCoverSrc(id: string | null | undefined): string | undefined {
  if (!id) return undefined;
  return PAGE_COVER_OPTIONS.find((o) => o.id === id)?.src;
}

/** Narrow type guard for the `view_props.cover` slot. */
export function readPageCoverId(viewProps: unknown): TPageCoverId | undefined {
  if (!viewProps || typeof viewProps !== "object") return undefined;
  const cover = (viewProps as Record<string, unknown>).cover;
  if (typeof cover !== "string") return undefined;
  if (!PAGE_COVER_OPTIONS.some((o) => o.id === cover)) return undefined;
  return cover as TPageCoverId;
}
