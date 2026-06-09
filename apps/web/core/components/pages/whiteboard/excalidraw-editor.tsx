/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import { observer } from "mobx-react";
import { debounce } from "lodash-es";
import type { AppState, BinaryFiles, ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { useTopBarTheme } from "@/hooks/use-top-bar-theme";
import type { TPageInstance } from "@/store/pages/base-page";
import type { TPageRootHandlers } from "../editor/page-root";

// Excalidraw ships its base styles separately. Lazy-load JS + CSS together so
// non-whiteboard pages don't pay for either.
const ExcalidrawCanvas = lazy(async () => {
  const [mod] = await Promise.all([import("@excalidraw/excalidraw"), import("@excalidraw/excalidraw/index.css")]);
  return { default: mod.Excalidraw };
});

type TExcalidrawSnapshot = {
  elements?: ExcalidrawInitialDataState["elements"];
  appState?: ExcalidrawInitialDataState["appState"];
  files?: BinaryFiles;
};

type Props = {
  page: TPageInstance;
  handlers: TPageRootHandlers;
  isEditable: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getInitialData = (descriptionJson: unknown): ExcalidrawInitialDataState | null => {
  if (!isRecord(descriptionJson) || !isRecord(descriptionJson.excalidraw_snapshot)) return null;

  const snapshot = descriptionJson.excalidraw_snapshot as TExcalidrawSnapshot;

  return {
    elements: Array.isArray(snapshot.elements) ? snapshot.elements : [],
    appState: isRecord(snapshot.appState) ? snapshot.appState : undefined,
    files: isRecord(snapshot.files) ? snapshot.files : undefined,
  };
};

const getPersistableAppState = (appState: AppState): ExcalidrawInitialDataState["appState"] => ({
  viewBackgroundColor: appState.viewBackgroundColor,
  gridSize: appState.gridSize,
  scrollX: appState.scrollX,
  scrollY: appState.scrollY,
  zoom: appState.zoom,
});

export const ExcalidrawEditor = observer(function ExcalidrawEditor({ page, handlers, isEditable }: Props) {
  const surfaceTheme = useTopBarTheme();
  const excalidrawTheme = surfaceTheme === "dark" ? "dark" : "light";
  const initialDataRef = useRef<ExcalidrawInitialDataState | null | undefined>(undefined);

  if (initialDataRef.current === undefined) {
    initialDataRef.current = getInitialData(page.description_json);
  }

  // Whiteboard pages skip the doc Yjs provider; mark synced on mount so the
  // header badge clears, then drive transitions ourselves around each save.
  useEffect(() => {
    page.setSyncingStatus("synced");
  }, [page]);

  const persist = useMemo(
    () =>
      debounce((snapshot: TExcalidrawSnapshot) => {
        page.setSyncingStatus("syncing");
        // Only send the JSON payload. Including doc binary/html fields would
        // route this through rich-text persistence paths whiteboards don't use.
        handlers
          .updateDescription({
            description_json: { excalidraw_snapshot: snapshot },
          })
          .then(() => page.setSyncingStatus("synced"))
          .catch((e) => {
            console.error("whiteboard save failed", e);
            page.setSyncingStatus("error");
          });
      }, 700),
    [handlers, page]
  );

  useEffect(
    () => () => {
      persist.flush();
      persist.cancel();
    },
    [persist]
  );

  const handleChange = useCallback(
    (elements: readonly OrderedExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      if (!isEditable) return;
      persist({
        elements,
        appState: getPersistableAppState(appState),
        files,
      });
    },
    [isEditable, persist]
  );

  return (
    <div className="flex h-full w-full flex-col">
      {/* Editable title. A new whiteboard is created unnamed and the canvas has
          no title field of its own, so this bar is the one place to name (or
          rename) it. Persists via updateTitle's debounced reaction — the same
          path docs and PDFs use. */}
      <div className="flex-shrink-0 border-b border-subtle px-4 py-2.5">
        <input
          type="text"
          value={page.name ?? ""}
          onChange={(e) => page.updateTitle(e.target.value)}
          readOnly={!isEditable}
          maxLength={255}
          placeholder="Untitled whiteboard"
          aria-label="Whiteboard name"
          className="w-full bg-transparent text-14 font-semibold text-primary outline-none placeholder:text-placeholder read-only:cursor-default"
        />
      </div>
      <div className="min-h-0 flex-1">
        <Suspense
          fallback={
            <div className="text-sm flex h-full w-full items-center justify-center text-tertiary">
              Loading whiteboard...
            </div>
          }
        >
          <ExcalidrawCanvas
            initialData={initialDataRef.current}
            name={page.name || "Untitled whiteboard"}
            onChange={handleChange}
            theme={excalidrawTheme}
            viewModeEnabled={!isEditable}
          />
        </Suspense>
      </div>
    </div>
  );
});
