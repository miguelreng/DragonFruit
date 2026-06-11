/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { debounce } from "lodash-es";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { AppState, BinaryFiles, ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { searchWikipedia } from "@plane/editor";
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

const SKIPPED_WIKI_SECTIONS = new Set([
  "references",
  "external links",
  "see also",
  "notes",
  "bibliography",
  "further reading",
  "sources",
  "gallery",
]);

/** Top-level section titles of a Wikipedia article via the parse API (CORS-enabled with origin=*). */
async function fetchWikipediaSections(title: string): Promise<string[]> {
  const params = new URLSearchParams({
    action: "parse",
    page: title,
    prop: "sections",
    format: "json",
    origin: "*",
    redirects: "1",
  });
  const response = await fetch(`https://en.wikipedia.org/w/api.php?${params.toString()}`);
  if (!response.ok) return [];
  const data = (await response.json()) as { parse?: { sections?: { line?: string; toclevel?: number }[] } };
  return (data.parse?.sections ?? [])
    .filter((s) => s.toclevel === 1 && s.line && !SKIPPED_WIKI_SECTIONS.has(s.line.toLowerCase()))
    .map((s) => (s.line ?? "").replace(/<[^>]*>/g, ""))
    .filter(Boolean)
    .slice(0, 10);
}

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

  // Wikipedia mindmap: expand an article's section structure into connected
  // nodes (central topic + one node per top-level section).
  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [mindmapTopic, setMindmapTopic] = useState("");
  const [isBuildingMindmap, setIsBuildingMindmap] = useState(false);

  const buildWikiMindmap = useCallback(async () => {
    const topic = mindmapTopic.trim();
    const api = excalidrawApiRef.current;
    if (!topic || !api || isBuildingMindmap) return;
    setIsBuildingMindmap(true);
    try {
      const hits = await searchWikipedia(topic, { limit: 1 });
      const articleTitle = hits[0]?.title;
      if (!articleTitle) {
        setToast({ type: TOAST_TYPE.ERROR, title: `No Wikipedia article found for “${topic}”` });
        return;
      }
      const sections = await fetchWikipediaSections(articleTitle);
      const { convertToExcalidrawElements } = await import("@excalidraw/excalidraw");

      const centerId = `wiki-center-${Date.now()}`;
      const skeleton: Parameters<typeof convertToExcalidrawElements>[0] = [
        {
          type: "ellipse",
          id: centerId,
          x: 0,
          y: 0,
          width: 240,
          height: 100,
          backgroundColor: "#ffd3e8",
          label: { text: articleTitle },
        },
      ];
      const radius = Math.max(300, sections.length * 46);
      sections.forEach((section, index) => {
        const angle = (2 * Math.PI * index) / Math.max(sections.length, 1) - Math.PI / 2;
        const nodeId = `${centerId}-node-${index}`;
        skeleton.push({
          type: "rectangle",
          id: nodeId,
          x: 120 + Math.cos(angle) * radius - 90,
          y: 50 + Math.sin(angle) * radius - 30,
          width: 180,
          height: 60,
          label: { text: section },
        });
        skeleton.push({
          type: "arrow",
          x: 120,
          y: 50,
          start: { id: centerId },
          end: { id: nodeId },
        });
      });

      const elements = convertToExcalidrawElements(skeleton);
      api.updateScene({ elements: [...api.getSceneElements(), ...elements] });
      api.scrollToContent(elements, { fitToViewport: true });
      setMindmapTopic("");
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: `Mapped “${articleTitle}”`,
        message: sections.length
          ? `${sections.length} sections added.`
          : "Article has no sections — added the topic node.",
      });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Couldn't build the mindmap" });
    } finally {
      setIsBuildingMindmap(false);
    }
  }, [isBuildingMindmap, mindmapTopic]);

  return (
    <div className="flex h-full w-full flex-col">
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
        {isEditable && (
          <div className="flex shrink-0 items-center gap-1.5">
            <input
              type="text"
              value={mindmapTopic}
              onChange={(e) => setMindmapTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void buildWikiMindmap();
              }}
              placeholder="Wikipedia topic…"
              aria-label="Wikipedia mindmap topic"
              className="w-40 rounded-md border border-subtle bg-layer-1 px-2 py-1 text-12 text-primary outline-none placeholder:text-placeholder focus:border-strong"
            />
            <button
              type="button"
              onClick={() => void buildWikiMindmap()}
              disabled={isBuildingMindmap || !mindmapTopic.trim()}
              className="rounded-md border border-subtle px-2 py-1 text-12 font-medium text-secondary transition-colors hover:bg-layer-1 hover:text-primary disabled:opacity-50"
              title="Expand a Wikipedia article's sections into a mindmap"
            >
              {isBuildingMindmap ? "Mapping…" : "Wiki map"}
            </button>
          </div>
        )}
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
            excalidrawAPI={(api) => {
              excalidrawApiRef.current = api;
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
