/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * "Active doc page" bridge.
 *
 * The docked Atlas drawer derives the current page id from the route. Most doc
 * surfaces carry a `:pageId`, but the project Brief renders the doc editor on a
 * route that has none (`/projects/:projectId/brief`). Those surfaces publish
 * their resolved page id here so the globally mounted drawer can still target
 * the right page for in-editor co-writing.
 *
 * Mirrors the tiny pub/sub shape of `reply-context.ts`.
 */

import { useSyncExternalStore } from "react";

let activeDocPageId: string | null = null;
const subscribers = new Set<(id: string | null) => void>();

/** Publish (or clear) the page id the drawer should treat as the active doc. */
export function setActiveDocPageId(id: string | null): void {
  if (activeDocPageId === id) return;
  activeDocPageId = id;
  subscribers.forEach((fn) => fn(activeDocPageId));
}

export function getActiveDocPageId(): string | null {
  return activeDocPageId;
}

export function subscribeActiveDocPageId(fn: (id: string | null) => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

/** React binding for the drawer: re-renders when the active doc page changes. */
export function useActiveDocPageId(): string | null {
  return useSyncExternalStore(
    (cb) => subscribeActiveDocPageId(() => cb()),
    getActiveDocPageId,
    () => null
  );
}
