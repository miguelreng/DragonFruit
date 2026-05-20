/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useSyncExternalStore } from "react";

export const DEFAULT_WORKSPACE_LOGOS = [
  "/workspace-defaults/colosseum-1.jpg",
  "/workspace-defaults/colosseum-2.jpg",
  "/workspace-defaults/colosseum-3.jpg",
  "/workspace-defaults/colosseum-4.jpg",
] as const;

const STORAGE_PREFIX = "workspace-default-logo:";
const CHANGE_EVENT = "workspace-default-logo-changed";

// djb2 — small, stable string hash; deterministic across reloads.
const hashString = (s: string): number => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

const storageKey = (workspaceId: string) => `${STORAGE_PREFIX}${workspaceId}`;

const readOverrideIndex = (workspaceId: string): number | null => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(storageKey(workspaceId));
  if (raw === null) return null;
  const idx = Number.parseInt(raw, 10);
  if (Number.isNaN(idx) || idx < 0 || idx >= DEFAULT_WORKSPACE_LOGOS.length) return null;
  return idx;
};

const deterministicIndex = (workspaceId: string): number => hashString(workspaceId) % DEFAULT_WORKSPACE_LOGOS.length;

export const getDefaultWorkspaceLogo = (workspaceId: string | undefined | null): string => {
  if (!workspaceId) return DEFAULT_WORKSPACE_LOGOS[0];
  const override = readOverrideIndex(workspaceId);
  const idx = override ?? deterministicIndex(workspaceId);
  return DEFAULT_WORKSPACE_LOGOS[idx];
};

export const randomizeDefaultWorkspaceLogo = (workspaceId: string): string => {
  if (typeof window === "undefined") return DEFAULT_WORKSPACE_LOGOS[0];
  const currentIdx = readOverrideIndex(workspaceId) ?? deterministicIndex(workspaceId);
  let nextIdx = Math.floor(Math.random() * DEFAULT_WORKSPACE_LOGOS.length);
  if (nextIdx === currentIdx) nextIdx = (nextIdx + 1) % DEFAULT_WORKSPACE_LOGOS.length;
  window.localStorage.setItem(storageKey(workspaceId), String(nextIdx));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { workspaceId } }));
  return DEFAULT_WORKSPACE_LOGOS[nextIdx];
};

const subscribe = (cb: () => void): (() => void) => {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(CHANGE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CHANGE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};

export const useDefaultWorkspaceLogo = (workspaceId: string | undefined | null): string =>
  useSyncExternalStore(
    subscribe,
    () => getDefaultWorkspaceLogo(workspaceId),
    () => (workspaceId ? DEFAULT_WORKSPACE_LOGOS[deterministicIndex(workspaceId)] : DEFAULT_WORKSPACE_LOGOS[0])
  );
