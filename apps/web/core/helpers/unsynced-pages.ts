/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Local-only registry of pages whose HocusPocus session ended without a
 * successful sync — i.e. you typed, then dropped connection / closed the tab,
 * and the server never received the final state. Surfaced in the Drafts page.
 * Cleared automatically the next time the editor reaches `stage === "synced"`.
 */

const STORAGE_KEY = "dragonfruit:unsynced-pages";

export type TUnsyncedPageEntry = {
  page_id: string;
  page_name: string;
  workspace_slug: string;
  project_id: string;
  last_edit_at: string; // ISO timestamp
};

type Registry = Record<string, TUnsyncedPageEntry>;

function readRegistry(): Registry {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Registry) : {};
  } catch {
    return {};
  }
}

function writeRegistry(reg: Registry): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reg));
    // Notify same-tab listeners; the native `storage` event only fires for other tabs.
    window.dispatchEvent(new CustomEvent("dragonfruit:unsynced-pages-updated"));
  } catch {
    // Quota or serialization failure — silent. Worst case the user loses the
    // hint, but the doc itself is still in Yjs IndexedDB.
  }
}

export function markPageUnsynced(entry: TUnsyncedPageEntry): void {
  const reg = readRegistry();
  reg[entry.page_id] = entry;
  writeRegistry(reg);
}

export function clearPageUnsynced(pageId: string): void {
  const reg = readRegistry();
  if (!(pageId in reg)) return;
  delete reg[pageId];
  writeRegistry(reg);
}

export function listUnsyncedPages(workspaceSlug?: string): TUnsyncedPageEntry[] {
  const all = Object.values(readRegistry());
  const filtered = workspaceSlug ? all.filter((e) => e.workspace_slug === workspaceSlug) : all;
  return filtered.sort((a, b) => b.last_edit_at.localeCompare(a.last_edit_at));
}
