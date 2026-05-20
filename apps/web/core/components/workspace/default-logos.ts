/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { getFileURL } from "@plane/utils";

export const DEFAULT_WORKSPACE_LOGOS = [
  "/workspace-defaults/colosseum-1.jpg",
  "/workspace-defaults/colosseum-2.jpg",
  "/workspace-defaults/colosseum-3.jpg",
  "/workspace-defaults/colosseum-4.jpg",
] as const;

const DEFAULT_LOGO_PREFIX = "/workspace-defaults/";

// djb2 — small, stable string hash; deterministic across reloads.
const hashString = (s: string): number => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

const deterministicIndex = (workspaceId: string): number => hashString(workspaceId) % DEFAULT_WORKSPACE_LOGOS.length;

export const isDefaultWorkspaceLogo = (url: string | null | undefined): boolean =>
  !!url && url.startsWith(DEFAULT_LOGO_PREFIX);

export const getDeterministicDefaultWorkspaceLogo = (workspaceId: string | undefined | null): string => {
  if (!workspaceId) return DEFAULT_WORKSPACE_LOGOS[0];
  return DEFAULT_WORKSPACE_LOGOS[deterministicIndex(workspaceId)];
};

// Pick a random default logo URL distinct from the current one. Pure: caller persists via updateWorkspace.
export const pickRandomDefaultWorkspaceLogo = (currentLogoUrl: string | null | undefined): string => {
  const currentIdx = isDefaultWorkspaceLogo(currentLogoUrl)
    ? DEFAULT_WORKSPACE_LOGOS.indexOf(currentLogoUrl as (typeof DEFAULT_WORKSPACE_LOGOS)[number])
    : -1;
  let nextIdx = Math.floor(Math.random() * DEFAULT_WORKSPACE_LOGOS.length);
  if (nextIdx === currentIdx) nextIdx = (nextIdx + 1) % DEFAULT_WORKSPACE_LOGOS.length;
  return DEFAULT_WORKSPACE_LOGOS[nextIdx];
};

// Resolve the <img src> for a workspace. Default-logo paths are served from the web app's /public,
// so we skip getFileURL (which would prepend API_BASE_URL and break in prod).
export const resolveWorkspaceLogoSrc = (
  logoUrl: string | null | undefined,
  workspaceId: string | undefined | null
): string => {
  if (logoUrl && logoUrl !== "") {
    if (isDefaultWorkspaceLogo(logoUrl)) return logoUrl;
    return getFileURL(logoUrl) ?? "";
  }
  return getDeterministicDefaultWorkspaceLogo(workspaceId);
};
