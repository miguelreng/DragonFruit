/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { lazy, Suspense, useEffect, useMemo, useRef } from "react";
import { observer } from "mobx-react";
import { debounce } from "lodash-es";
import type { TPageInstance } from "@/store/pages/base-page";
import type { TPageRootHandlers } from "../editor/page-root";

// tldraw ships its base styles separately. Lazy-load JS + CSS together so
// non-whiteboard pages don't pay for either. Stash the resolved module so
// onMount can reach the snapshot helpers without a second dynamic import.
let tldrawModule: typeof import("tldraw") | null = null;

const TldrawCanvas = lazy(async () => {
  const [mod] = await Promise.all([import("tldraw"), import("tldraw/tldraw.css")]);
  tldrawModule = mod;
  return { default: mod.Tldraw };
});

type Props = {
  page: TPageInstance;
  handlers: TPageRootHandlers;
  isEditable: boolean;
};

export const TldrawEditor = observer(function TldrawEditor({ page, handlers, isEditable }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null);

  // Stash the initial snapshot in a ref so we hand it to tldraw exactly once
  // on mount — re-applying after a description_json refresh would clobber
  // unsaved local edits.
  const initialSnapshotRef = useRef<unknown>(undefined);
  if (initialSnapshotRef.current === undefined) {
    const raw = (page.description_json ?? {}) as { tldraw_snapshot?: unknown };
    initialSnapshotRef.current = raw.tldraw_snapshot ?? null;
  }

  // Whiteboard pages skip the doc Yjs provider; mark synced on mount so the
  // header badge clears, then drive transitions ourselves around each save.
  useEffect(() => {
    page.setSyncingStatus("synced");
  }, [page]);

  const persist = useMemo(
    () =>
      debounce((snapshot: unknown) => {
        page.setSyncingStatus("syncing");
        // IMPORTANT: only send `description_json`. Including
        // `description_binary: ""` overwrites the Yjs binary column with an
        // empty bytea (which the API surfaces as a save failure → the
        // "Connection lost" badge), and including `description_html: ""`
        // triggers the page-history transaction pipeline.
        handlers
          .updateDescription({
            description_json: { tldraw_snapshot: snapshot },
          })
          .then(() => page.setSyncingStatus("synced"))
          .catch((e) => {
            console.error("whiteboard save failed", e);
            page.setSyncingStatus("error");
          });
      }, 700),
    [handlers, page]
  );

  // Mirror lock/role-derived isEditable into tldraw's instance state when it
  // flips mid-session (page locked, role downgraded).
  useEffect(() => {
    const ed = editorRef.current;
    if (ed) ed.updateInstanceState({ isReadonly: !isEditable });
  }, [isEditable]);

  // tldraw notifies us via the store, not React props. Grab the editor on
  // mount, hydrate the saved snapshot, then debounce-persist document-scope
  // user changes — camera/selection noise lives on "session" scope and is
  // intentionally excluded so we don't autosave on every pan or click.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleMount = (editor: any) => {
    editorRef.current = editor;
    if (!tldrawModule) return;
    const { loadSnapshot, getSnapshot } = tldrawModule;
    if (initialSnapshotRef.current) {
      try {
        loadSnapshot(editor.store, initialSnapshotRef.current as Parameters<typeof loadSnapshot>[1]);
      } catch (e) {
        console.warn("tldraw: could not load saved snapshot, starting fresh", e);
      }
    }
    editor.updateInstanceState({ isReadonly: !isEditable });
    editor.store.listen(
      () => {
        persist(getSnapshot(editor.store));
      },
      { scope: "document", source: "user" }
    );
  };

  return (
    <div className="h-full w-full">
      <Suspense
        fallback={
          <div className="text-sm flex h-full w-full items-center justify-center text-tertiary">
            Loading whiteboard…
          </div>
        }
      >
        <TldrawCanvas onMount={handleMount} />
      </Suspense>
    </div>
  );
});
