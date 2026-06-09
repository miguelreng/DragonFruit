/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TProjectBookmark } from "@plane/types";

export const normalizeTags = (tags: string) =>
  tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

export const domainFromUrl = (url: string) => {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0];
  }
};

export const isTweetUrl = (url: string) => /https?:\/\/(x|twitter)\.com\/[^/]+\/status\/\d+/i.test(url);

export const internalBookmarkHref = (workspaceSlug: string, bookmark: TProjectBookmark) => {
  const projectId = bookmark.project_id;
  const entityId = bookmark.entity_identifier;
  switch (bookmark.entity_type) {
    case "project":
      return `/${workspaceSlug}/projects/${projectId}/issues`;
    case "issue":
    case "work_item":
      return entityId ? `/${workspaceSlug}/projects/${projectId}/issues/${entityId}` : "";
    case "page":
      return entityId ? `/${workspaceSlug}/projects/${projectId}/pages/${entityId}` : "";
    case "cycle":
      return entityId ? `/${workspaceSlug}/projects/${projectId}/cycles/${entityId}` : "";
    case "module":
      return entityId ? `/${workspaceSlug}/projects/${projectId}/modules/${entityId}` : "";
    case "view":
      return entityId ? `/${workspaceSlug}/projects/${projectId}/views/${entityId}` : "";
    default:
      return "";
  }
};

export const bookmarkHref = (workspaceSlug: string, bookmark: TProjectBookmark) =>
  bookmark.url || internalBookmarkHref(workspaceSlug, bookmark);

export const bookmarkSource = (bookmark: TProjectBookmark) =>
  bookmark.metadata?.site_name || domainFromUrl(bookmark.url) || bookmark.entity_type || "DragonFruit";

// Imported image/file saves often carry the raw filename as their title
// (e.g. Facebook CDN names like "706873799_15204..._n.jpg"). Those add nothing
// over the preview image, so we treat them as "no title" and hide them.
const MEDIA_FILE_TITLE_RE = /\.(jpe?g|png|gif|webp|heic|heif|bmp|svg|tiff?|avif|mp4|mov|webm|pdf)$/i;

const isJunkTitle = (rawTitle: string) => {
  const title = (rawTitle ?? "").trim();
  if (!title) return true;
  const base = title.replace(MEDIA_FILE_TITLE_RE, "");
  if (base !== title) return true; // a bare filename used as a title
  const tokens = base.split(/[\s._-]+/).filter(Boolean);
  if (tokens.length === 0) return true;
  // machine IDs: long digit runs, hex blobs, or the lone trailing letters FB appends
  const idLike = tokens.filter(
    (token) => /^\d{4,}$/.test(token) || /^[0-9a-f]{8,}$/i.test(token) || /^[a-z]$/i.test(token)
  );
  return idLike.length / tokens.length >= 0.7;
};

export const bookmarkDisplayTitle = (bookmark: TProjectBookmark) =>
  isJunkTitle(bookmark.title) ? "" : bookmark.title.trim();

export const bookmarkPreviewImage = (bookmark: TProjectBookmark) => {
  const metadata = bookmark.metadata ?? {};
  if (typeof metadata.image_url === "string" && metadata.image_url) return metadata.image_url;
  if (typeof metadata.og_image_url === "string" && metadata.og_image_url) return metadata.og_image_url;
  return "";
};

export const bookmarkSuggestedTags = (bookmark: TProjectBookmark): string[] => {
  const raw = bookmark.metadata?.suggested_tags;
  if (!Array.isArray(raw)) return [];
  const existing = new Set(bookmark.tags.map((tag) => tag.toLowerCase()));
  return raw.filter(
    (tag): tag is string => typeof tag === "string" && tag.trim().length > 0 && !existing.has(tag.toLowerCase())
  );
};

export const bookmarkHasTwitterScreenshot = (bookmark: TProjectBookmark, imageUrl: string) =>
  Boolean(imageUrl) && isTweetUrl(bookmark.url) && bookmark.metadata?.screenshot_source === "chrome_extension";

export const openImageUrl = async (imageUrl: string) => {
  if (!imageUrl) return;

  if (!imageUrl.startsWith("data:")) {
    window.open(imageUrl, "_blank", "noopener,noreferrer");
    return;
  }

  const imageWindow = window.open("about:blank", "_blank");
  if (!imageWindow) {
    setToast({ type: TOAST_TYPE.ERROR, title: "Screenshot could not be opened" });
    return;
  }

  imageWindow.opener = null;

  try {
    const response = await fetch(imageUrl);
    const imageBlob = await response.blob();
    const objectUrl = URL.createObjectURL(imageBlob);
    imageWindow.location.href = objectUrl;
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch {
    imageWindow.close();
    setToast({ type: TOAST_TYPE.ERROR, title: "Screenshot could not be opened" });
  }
};

export const openBookmarkLink = (href: string, isExternal: boolean) => {
  if (!href) return;
  if (isExternal) window.open(href, "_blank", "noopener,noreferrer");
};
