/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import { observer } from "mobx-react";
import { debounce } from "lodash-es";
import type { AppState, BinaryFiles, DataURL, ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
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

const MAX_PERSISTED_IMAGE_DATA_URL_CHARS = 3_250_000;
const MAX_PERSISTED_IMAGE_CHARS = 650_000;
const MIN_PERSISTED_IMAGE_CHARS = 180_000;
const MAX_PERSISTED_IMAGE_DIMENSION = 1_600;

type TCompressedImageCacheEntry = {
  sourceLength: number;
  sourceStart: string;
  sourceEnd: string;
  dataURL: DataURL;
};

const compressedImageCache = new Map<string, TCompressedImageCacheEntry>();

const loadImage = (dataURL: DataURL): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error("Unable to decode whiteboard image")), { once: true });
    image.src = dataURL;
  });

const compressImage = async (dataURL: DataURL, targetChars: number): Promise<DataURL> => {
  const image = await loadImage(dataURL);
  let maxDimension = MAX_PERSISTED_IMAGE_DIMENSION;
  let quality = 0.82;
  let smallestDataURL = dataURL;

  for (let attempt = 0; attempt < 7; attempt += 1) {
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

    const context = canvas.getContext("2d");
    if (!context) return smallestDataURL;

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const candidate = canvas.toDataURL("image/webp", quality) as DataURL;
    if (!candidate.startsWith("data:image/webp")) break;

    if (candidate.length < smallestDataURL.length) smallestDataURL = candidate;
    if (smallestDataURL.length <= targetChars) break;

    maxDimension = Math.max(800, Math.round(maxDimension * 0.84));
    quality = Math.max(0.58, quality - 0.05);
  }

  return smallestDataURL;
};

const compactBinaryFiles = async (files: BinaryFiles): Promise<BinaryFiles> => {
  const entries = Object.entries(files);
  const compressibleEntries = entries.filter(
    ([, file]) => file.dataURL.startsWith("data:image/") && !file.dataURL.startsWith("data:image/svg+xml")
  );
  if (!compressibleEntries.length) return files;

  const targetChars = Math.max(
    MIN_PERSISTED_IMAGE_CHARS,
    Math.min(MAX_PERSISTED_IMAGE_CHARS, Math.floor(MAX_PERSISTED_IMAGE_DATA_URL_CHARS / compressibleEntries.length))
  );
  const compactedFiles: BinaryFiles = { ...files };

  await Promise.all(
    compressibleEntries.map(async ([fileId, file]) => {
      if (file.dataURL.length <= targetChars) return;

      const sourceStart = file.dataURL.slice(0, 64);
      const sourceEnd = file.dataURL.slice(-64);
      const cached = compressedImageCache.get(fileId);
      let dataURL: DataURL;

      if (
        cached?.sourceLength === file.dataURL.length &&
        cached.sourceStart === sourceStart &&
        cached.sourceEnd === sourceEnd
      ) {
        dataURL = cached.dataURL;
      } else {
        try {
          dataURL = await compressImage(file.dataURL, targetChars);
        } catch (error) {
          console.warn("whiteboard image compression failed", error);
          return;
        }
        compressedImageCache.set(fileId, {
          sourceLength: file.dataURL.length,
          sourceStart,
          sourceEnd,
          dataURL,
        });
      }

      if (dataURL.length < file.dataURL.length) {
        compactedFiles[fileId] = {
          ...file,
          dataURL,
          mimeType: "image/webp",
        };
      }
    })
  );

  return compactedFiles;
};

const getHttpStatus = (error: unknown): number | undefined => {
  if (!isRecord(error) || !isRecord(error.response)) return undefined;
  return typeof error.response.status === "number" ? error.response.status : undefined;
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
  const hasUserInteractedRef = useRef(false);
  const isCanvasReadyRef = useRef(false);
  const hasQueuedUserChangeRef = useRef(false);

  if (initialDataRef.current === undefined) {
    initialDataRef.current = getInitialData(page.description_json);
  }

  // Whiteboard pages skip the doc Yjs provider; mark synced on mount so the
  // header badge clears, then drive transitions ourselves around each save.
  useEffect(() => {
    page.setSyncingStatus("synced");
  }, [page]);

  const persist = useMemo(() => {
    // Compression is asynchronous. Serialize saves so a slower, older
    // snapshot can never arrive after a newer one and overwrite it.
    let saveQueue = Promise.resolve();

    return debounce((snapshot: TExcalidrawSnapshot) => {
      saveQueue = saveQueue.then(async () => {
        page.setSyncingStatus("syncing");
        // Only send the JSON payload. Including doc binary/html fields would
        // route this through rich-text persistence paths whiteboards don't use.
        try {
          const compactedSnapshot = snapshot.files
            ? { ...snapshot, files: await compactBinaryFiles(snapshot.files) }
            : snapshot;
          await handlers.updateDescription({
            description_json: { excalidraw_snapshot: compactedSnapshot },
          });
          page.setSyncingStatus("synced");
        } catch (error) {
          console.error("whiteboard save failed", error);
          page.setSyncingStatus("error");
          setToast({
            type: TOAST_TYPE.ERROR,
            title: getHttpStatus(error) === 413 ? "Whiteboard is too large to save" : "Couldn't save whiteboard",
            message:
              getHttpStatus(error) === 413
                ? "Some images are still too large. Remove one large image and try again."
                : "Your latest changes are still on this canvas. Try again before refreshing.",
          });
        }
        return undefined;
      });
    }, 700);
  }, [handlers, page]);

  useEffect(
    () => () => {
      if (hasQueuedUserChangeRef.current) persist.flush();
      persist.cancel();
    },
    [persist]
  );

  const handleChange = useCallback(
    (elements: readonly OrderedExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      // Excalidraw can emit an empty change while its initial scene is still
      // mounting. Only persist after a real pointer/keyboard/paste/drop/wheel
      // interaction; mount-only events cannot erase the stored snapshot.
      if (!isEditable || !isCanvasReadyRef.current || !hasUserInteractedRef.current) return;

      hasQueuedUserChangeRef.current = true;
      persist({
        elements,
        appState: getPersistableAppState(appState),
        files,
      });
    },
    [isEditable, persist]
  );

  return (
    <div
      className="flex h-full w-full flex-col"
      onPointerDownCapture={() => {
        hasUserInteractedRef.current = true;
      }}
      onKeyDownCapture={() => {
        hasUserInteractedRef.current = true;
      }}
      onPasteCapture={() => {
        hasUserInteractedRef.current = true;
      }}
      onDropCapture={() => {
        hasUserInteractedRef.current = true;
      }}
      onWheelCapture={() => {
        hasUserInteractedRef.current = true;
      }}
    >
      {/* Editable title. A new whiteboard is created unnamed and the canvas has
          no title field of its own, so this bar is the one place to name (or
          rename) it. Persists via updateTitle's debounced reaction — the same
          path docs and PDFs use. */}
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-subtle px-4 py-2.5">
        <input
          type="text"
          value={page.name ?? ""}
          onChange={(e) => page.updateTitle(e.target.value)}
          readOnly={!isEditable}
          maxLength={255}
          placeholder="Untitled whiteboard"
          aria-label="Whiteboard name"
          className="w-full min-w-0 flex-1 bg-transparent text-14 font-semibold text-primary outline-none placeholder:text-placeholder read-only:cursor-default"
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
            excalidrawAPI={() => {
              isCanvasReadyRef.current = true;
            }}
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
