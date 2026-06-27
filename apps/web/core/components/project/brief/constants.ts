/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// The Brief is backed by a hidden, per-project "doc" page so it can reuse the
// full collaborative editor (and the Atlas AI bar). `is_brief` is the durable
// backend identity; the reserved name remains as a fallback for legacy pages
// created before the flag existed.
export const BRIEF_PAGE_NAME = "Project Brief";

export const isBriefPageName = (name: string | undefined) => (name ?? "").trim() === BRIEF_PAGE_NAME;

export const isBriefPage = (page: { is_brief?: boolean; name?: string; page_type?: string } | undefined) =>
  page?.page_type === "doc" && (page.is_brief === true || isBriefPageName(page.name));

export const getBriefPageDisplayName = (projectName: string | undefined) =>
  `Brief - ${projectName?.trim() || "Project"}`;

export const briefCacheKey = (projectId: string) => `df:brief-page:${projectId}`;
