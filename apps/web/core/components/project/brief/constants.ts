/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// The Brief is backed by a hidden, per-project "doc" page so it can reuse the
// full collaborative editor (and the Atlas AI bar). We can't add a backend
// field to associate it (the API is remote), so the page is identified by a
// reserved name and cached per-browser for fast subsequent loads.
export const BRIEF_PAGE_NAME = "Project Brief";

export const briefCacheKey = (projectId: string) => `df:brief-page:${projectId}`;
