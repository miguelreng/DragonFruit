/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { SPACE_BASE_URL } from "@plane/constants";
import type { TPageType } from "@plane/types";
import { validateSlug } from "@plane/utils";

type TPageLike = {
  id?: string;
  page_type?: TPageType;
  view_props?: Record<string, unknown> | undefined;
};

export type TPublicPageContentType = Exclude<TPageType, "folder"> | "wiki";

export const getPublicPageSlug = (page: TPageLike): string => {
  const raw = page?.view_props?.public_slug;
  if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
  return page?.id ?? "";
};

export const getPublicPageContentType = (page: TPageLike): TPublicPageContentType =>
  page.page_type === "folder" ? "wiki" : (page.page_type ?? "doc");

export const buildPublicPagePath = (
  workspaceIdentifier: string,
  pageSlug: string,
  contentType: TPublicPageContentType = "doc"
) => `/${encodeURIComponent(workspaceIdentifier)}/${contentType}/${encodeURIComponent(pageSlug)}`;

type TPublicPageUrlOptions = {
  currentOrigin?: string;
  publicBaseUrl?: string;
};

export const buildPublicPageUrl = (
  workspaceIdentifier: string,
  pageSlug: string,
  contentType: TPublicPageContentType = "doc",
  {
    currentOrigin = typeof window !== "undefined" ? window.location.origin : "",
    publicBaseUrl = SPACE_BASE_URL,
  }: TPublicPageUrlOptions = {}
) => {
  const configuredBaseUrl = publicBaseUrl.trim();
  const isPublicContentOrigin = (() => {
    try {
      return ["dragonfruit.page", "www.dragonfruit.page"].includes(new URL(configuredBaseUrl).hostname);
    } catch {
      return false;
    }
  })();
  const base = (isPublicContentOrigin ? configuredBaseUrl : currentOrigin).replace(/\/+$/, "");
  const path = isPublicContentOrigin
    ? buildPublicPagePath(workspaceIdentifier, pageSlug, contentType)
    : `/published/${encodeURIComponent(workspaceIdentifier)}/${encodeURIComponent(pageSlug)}`;
  return `${base}${path}`;
};

export const normalizePublicPageSlug = (input: string): string => input.trim().toLowerCase().replace(/\s+/g, "-");

export const validatePublicPageSlug = (input: string): string | null => {
  const normalized = normalizePublicPageSlug(input);
  const validity = validateSlug(normalized);
  if (validity === true) return null;
  if (typeof validity === "string") return validity;
  return "Invalid slug";
};
