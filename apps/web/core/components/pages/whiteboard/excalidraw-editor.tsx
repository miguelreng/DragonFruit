/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { lazy, Suspense, useMemo, useRef } from "react";
import { observer } from "mobx-react";
import { debounce } from "lodash-es";
import type { TPageInstance } from "@/store/pages/base-page";
import type { TPageRootHandlers } from "../editor/page-root";

// Excalidraw is ~1.5MB. Lazy-load so the rest of the app isn't paying for it.
const Excalidraw = lazy(async () => {
  const mod = await import("@excalidraw/excalidraw");
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

  const persist = useMemo(
    () =>
      debounce(
        (elements: readonly unknown[], appState: Record<string, unknown>, files: Record<string, unknown>) => {
          handlers
            .updateDescription({
              description_html: "",
              description_json: {
                excalidraw_scene: {
                  elements,
                  // Strip the volatile bits before persisting; collaborators don't need the cursor.
                  appState: stripVolatile(appState),
                  files,
                },
              },
              description_binary: "",
            })
            .catch((e) => console.error("whiteboard save failed", e));
        },
        700
      ),
    [handlers]
  );

  return (
    <div className="h-full w-full">
      <Suspense fallback={<div className="flex h-full w-full items-center justify-center text-sm text-tertiary">Loading whiteboard…</div>}>
        <Excalidraw
          initialData={initialDataRef.current as unknown as Parameters<typeof Excalidraw>[0]["initialData"]}
          viewModeEnabled={!isEditable}
          onChange={(elements, appState, files) =>
            persist(elements, appState as unknown as Record<string, unknown>, files as unknown as Record<string, unknown>)
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
