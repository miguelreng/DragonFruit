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

// Excalidraw is ~1.5MB and ships its styles separately. Lazy-load both the
// component and its CSS so non-whiteboard pages don't pay the cost.
const Excalidraw = lazy(async () => {
  const [mod] = await Promise.all([import("@excalidraw/excalidraw"), import("@excalidraw/excalidraw/index.css")]);
  return { default: mod.Excalidraw };
});

type ExcalidrawScene = {
  elements?: readonly unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
};

function extractScene(page: TPageInstance): ExcalidrawScene {
  const raw = (page.description_json ?? {}) as { excalidraw_scene?: ExcalidrawScene };
  return raw.excalidraw_scene ?? {};
}

type Props = {
  page: TPageInstance;
  handlers: TPageRootHandlers;
  isEditable: boolean;
};

export const ExcalidrawEditor = observer(function ExcalidrawEditor({ page, handlers, isEditable }: Props) {
  const initialDataRef = useRef<ExcalidrawScene | null>(null);
  if (initialDataRef.current === null) {
    initialDataRef.current = extractScene(page);
  }

  // Pages default to `isSyncingWithServer: "syncing"` because doc pages handle
  // the transition to "synced" via the Yjs collaboration provider. Whiteboards
  // skip that provider entirely, so we have to mark the page as synced on
  // mount and drive transitions ourselves around our debounced PATCH.
  useEffect(() => {
    page.setSyncingStatus("synced");
  }, [page]);

  const persist = useMemo(
    () =>
      debounce((elements: readonly unknown[], appState: Record<string, unknown>, files: Record<string, unknown>) => {
        page.setSyncingStatus("syncing");
        // IMPORTANT: only send `description_json`. Including
        // `description_binary: ""` overwrites the Yjs binary column with an
        // empty bytea (which the API surfaces as a save failure → the
        // "Connection lost" badge), and including `description_html: ""`
        // triggers the page-history transaction pipeline.
        handlers
          .updateDescription({
            description_json: {
              excalidraw_scene: {
                elements,
                // Strip the volatile bits before persisting; collaborators don't need the cursor.
                appState: stripVolatile(appState),
                files,
              },
            },
          })
          .then(() => page.setSyncingStatus("synced"))
          .catch((e) => {
            console.error("whiteboard save failed", e);
            page.setSyncingStatus("error");
          });
      }, 700),
    [handlers, page]
  );

  return (
    <div className="h-full w-full">
      <Suspense
        fallback={
          <div className="text-sm flex h-full w-full items-center justify-center text-tertiary">
            Loading whiteboard…
          </div>
        }
      >
        <Excalidraw
          initialData={initialDataRef.current as unknown as Parameters<typeof Excalidraw>[0]["initialData"]}
          viewModeEnabled={!isEditable}
          onChange={(elements, appState, files) =>
            persist(
              elements,
              appState as unknown as Record<string, unknown>,
              files as unknown as Record<string, unknown>
            )
          }
        />
      </Suspense>
    </div>
  );
});

const VOLATILE_KEYS = new Set([
  "collaborators",
  "currentItemFontFamily",
  "draggingElement",
  "editingElement",
  "editingGroupId",
  "editingLinearElement",
  "selectedElementIds",
  "selectionElement",
  "viewBackgroundColor",
  "zoom",
  "scrollX",
  "scrollY",
]);

function stripVolatile(appState: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(appState ?? {})) {
    if (!VOLATILE_KEYS.has(k)) out[k] = v;
  }
  return out;
}
