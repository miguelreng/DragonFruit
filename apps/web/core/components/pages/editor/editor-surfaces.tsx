/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { lazy } from "react";

// Lazy-load the two heaviest editor surfaces.
//   - PageEditorBody pulls in Tiptap + lowlight + every registered
//     highlight.js language (~1.3 MB chunk).
//   - TldrawEditor pulls in the tldraw canvas runtime + its CSS
//     (~1.5 MB across two chunks).
// Doc/whiteboard pages are reached from the sidebar; everything else
// (issues list, projects, settings, calendar) shouldn't pay for them
// on first paint.
export const PageEditorBody = lazy(() => import("./editor-body").then((m) => ({ default: m.PageEditorBody })));
export const TldrawEditor = lazy(() =>
  import("../whiteboard/tldraw-editor").then((m) => ({ default: m.TldrawEditor }))
);

// HMR (React Refresh + Vite) invalidates and re-evaluates chunks on every
// save. When a chunk that backs a `React.lazy` is invalidated, the lazy
// promise transitions through `pending` during the next refresh — and React
// 18 throws "A component suspended while responding to synchronous input"
// because the refresh path itself is synchronous. Production builds never
// hit this (no HMR), so we just warm both chunks at module-load in dev:
// React Refresh always finds them resolved, Suspense never re-fires, the
// warning never appears.
if (import.meta.env.DEV) {
  void import("./editor-body");
  void import("../whiteboard/tldraw-editor");
}

export const EditorFallback = () => (
  <div className="text-sm flex h-full w-full items-center justify-center text-tertiary">Loading editor…</div>
);
