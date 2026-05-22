/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { validateSlug } from "@plane/utils";

type TPageLike = {
  id?: string;
  view_props?: Record<string, unknown> | undefined;
};

export const getPublicPageSlug = (page: TPageLike): string => {
  const raw = page?.view_props?.public_slug;
  if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
  return page?.id ?? "";
};

export const buildPublicPagePath = (workspaceSlug: string, pageSlug: string) =>
  `/published/${workspaceSlug}/${encodeURIComponent(pageSlug)}`;

export const buildPublicPageUrl = (workspaceSlug: string, pageSlug: string) => {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return `${base}${buildPublicPagePath(workspaceSlug, pageSlug)}`;
};

export const normalizePublicPageSlug = (input: string): string => input.trim().toLowerCase().replace(/\s+/g, "-");

export const validatePublicPageSlug = (input: string): string | null => {
  const normalized = normalizePublicPageSlug(input);
  const validity = validateSlug(normalized);
  if (validity === true) return null;
  if (typeof validity === "string") return validity;
  return "Invalid slug";
};
