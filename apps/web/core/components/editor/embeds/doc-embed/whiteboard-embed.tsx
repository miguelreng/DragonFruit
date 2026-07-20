/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { debounce } from "lodash-es";
import type { AppState, BinaryFiles, ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { ExternalLink, Loader2, PenTool, Whiteboard } from "@/components/icons/lucide-shim";
import { useTopBarTheme } from "@/hooks/use-top-bar-theme";
import { ProjectPageService } from "@/services/page";

const pageService = new ProjectPageService();

// Excalidraw ships its base styles separately. Lazy-load JS + CSS together so
// docs without whiteboard embeds don't pay for either.
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
  entityId: string;
  projectId: string | undefined;
  workspaceSlug: string | undefined;
  title?: string;
  isEditable: boolean;
};

type TLoadState = "loading" | "error" | "ready";
type TMode = "preview" | "live";
type TSaveState = "idle" | "saving" | "saved" | "error";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getSnapshot = (descriptionJson: unknown): TExcalidrawSnapshot => {
  if (!isRecord(descriptionJson) || !isRecord(descriptionJson.excalidraw_snapshot)) return {};
  const snapshot = descriptionJson.excalidraw_snapshot as TExcalidrawSnapshot;
  return {
    elements: Array.isArray(snapshot.elements) ? snapshot.elements : [],
    appState: isRecord(snapshot.appState) ? snapshot.appState : undefined,
    files: isRecord(snapshot.files) ? snapshot.files : undefined,
  };
};

/**
 * Native inline whiteboard: renders the source whiteboard page as a live
 * canvas inside the doc. Dormant state is a cheap exported SVG (so the doc
 * scrolls past it without the canvas eating wheel events); clicking arms a
 * real Excalidraw editor bound to the source page. Edits persist to the
 * whiteboard page itself — the same `description_json.excalidraw_snapshot`
 * payload the full-page editor saves — so the embed and the page stay one
 * document.
 */
export function WhiteboardEmbed(props: Props) {
  const { entityId, projectId, workspaceSlug, title, isEditable } = props;
  const surfaceTheme = useTopBarTheme();
  const excalidrawTheme = surfaceTheme === "dark" ? "dark" : "light";

  const [loadState, setLoadState] = useState<TLoadState>("loading");
  const [pageName, setPageName] = useState<string | undefined>(undefined);
  const [mode, setMode] = useState<TMode>("preview");
  const [previewSvg, setPreviewSvg] = useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [saveState, setSaveState] = useState<TSaveState>("idle");
  const [liveInitialData, setLiveInitialData] = useState<ExcalidrawInitialDataState | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  // Latest known snapshot: seeded by the fetch, updated by local edits. The
  // preview export and each save read from here.
  const snapshotRef = useRef<TExcalidrawSnapshot | null>(null);
  // Fingerprint of the last payload sent, so pans/selections in live mode
  // (which also fire onChange) don't produce content-identical PATCHes.
  const lastSentRef = useRef<string | null>(null);

  useEffect(() => {
    if (!workspaceSlug || !projectId || !entityId) {
      setLoadState("error");
      return;
    }
    let cancelled = false;
    setLoadState("loading");
    const load = async () => {
      try {
        const page = await pageService.fetchById(workspaceSlug, projectId, entityId, false);
        if (cancelled) return;
        snapshotRef.current = getSnapshot(page.description_json);
        setPageName(page.name ?? undefined);
        setPreviewVersion((version) => version + 1);
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [entityId, projectId, workspaceSlug]);

  // Dormant preview: export the snapshot to SVG. Re-runs when the theme flips
  // or after a live-edit session hands back changed content.
  useEffect(() => {
    if (loadState !== "ready" || mode !== "preview") return;
    const snapshot = snapshotRef.current;
    const elements = Array.isArray(snapshot?.elements) ? snapshot.elements : [];
    if (elements.length === 0) {
      setPreviewSvg(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { exportToSvg } = await import("@excalidraw/excalidraw");
        const svg = await exportToSvg({
          elements: elements as Parameters<typeof exportToSvg>[0]["elements"],
          appState: {
            ...(isRecord(snapshot?.appState) ? snapshot.appState : {}),
            exportBackground: true,
            exportWithDarkMode: excalidrawTheme === "dark",
          },
          files: snapshot?.files ?? null,
          exportPadding: 24,
        });
        if (cancelled) return;
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", "100%");
        svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
        setPreviewSvg(svg.outerHTML);
      } catch {
        if (!cancelled) setPreviewSvg(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [excalidrawTheme, loadState, mode, previewVersion]);

  const persist = useMemo(
    () =>
      debounce((snapshot: TExcalidrawSnapshot) => {
        if (!workspaceSlug || !projectId) return;
        const fingerprint = JSON.stringify([
          snapshot.elements,
          snapshot.files,
          snapshot.appState?.viewBackgroundColor,
          snapshot.appState?.gridSize,
        ]);
        if (fingerprint === lastSentRef.current) return;
        lastSentRef.current = fingerprint;
        setSaveState("saving");
        // Only send the JSON payload — same shape and endpoint as the
        // full-page whiteboard editor's save path.
        pageService
          .updateDescription(workspaceSlug, projectId, entityId, {
            description_json: { excalidraw_snapshot: snapshot },
          })
          .then(() => setSaveState("saved"))
          .catch((error) => {
            console.error("whiteboard embed save failed", error);
            setSaveState("error");
          });
      }, 700),
    [entityId, projectId, workspaceSlug]
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
      // Preserve the source page's saved viewport (scroll/zoom) — panning
      // around a small embed shouldn't move where the full page opens.
      snapshotRef.current = {
        elements,
        appState: {
          ...snapshotRef.current?.appState,
          viewBackgroundColor: appState.viewBackgroundColor,
          gridSize: appState.gridSize,
        },
        files,
      };
      persist(snapshotRef.current);
    },
    [isEditable, persist]
  );

  const enterLiveMode = useCallback(() => {
    const snapshot = snapshotRef.current;
    setLiveInitialData({
      elements: Array.isArray(snapshot?.elements) ? snapshot.elements : [],
      appState: isRecord(snapshot?.appState)
        ? {
            viewBackgroundColor: snapshot.appState.viewBackgroundColor,
            gridSize: snapshot.appState.gridSize,
          }
        : undefined,
      files: snapshot?.files,
      scrollToContent: true,
    });
    setSaveState("idle");
    setMode("live");
  }, []);

  const exitLiveMode = useCallback(() => {
    persist.flush();
    setPreviewVersion((version) => version + 1);
    setMode("preview");
  }, [persist]);

  // A click anywhere outside the embed puts it back to sleep, so the canvas
  // stops capturing wheel/keyboard once the reader moves on.
  useEffect(() => {
    if (mode !== "live") return;
    const handlePointerDown = (event: PointerEvent) => {
      const container = containerRef.current;
      const target = event.target as Node | null;
      if (!container || !target || container.contains(target)) return;
      exitLiveMode();
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [exitLiveMode, mode]);

  const displayName = pageName || title || "Untitled whiteboard";
  const href = workspaceSlug && projectId ? `/${workspaceSlug}/projects/${projectId}/pages/${entityId}` : undefined;
  const hasContent = (snapshotRef.current?.elements?.length ?? 0) > 0;

  if (loadState === "error") {
    return (
      <div className="not-prose rounded-lg border-[0.5px] border-subtle bg-surface-1 px-4 py-3 text-13 text-secondary">
        Embedded whiteboard is unavailable
      </div>
    );
  }

  const saveLabel = saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Couldn't save" : null;

  return (
    <div
      ref={containerRef}
      className="not-prose group/whiteboard-embed my-2 w-full overflow-hidden rounded-lg border-[0.5px] border-subtle bg-surface-1 shadow-raised-100"
    >
      <div className="flex items-center gap-2 border-b border-subtle bg-layer-1 px-3 py-2">
        <Whiteboard className="size-3.5 shrink-0 text-tertiary" />
        <span className="min-w-0 truncate text-13 font-medium text-primary">{displayName}</span>
        {saveLabel && (
          <span className={saveState === "error" ? "shrink-0 text-11 text-red-500" : "shrink-0 text-11 text-tertiary"}>
            {saveLabel}
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {href && (
            <Link
              to={href}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-11 font-medium text-tertiary transition-colors hover:bg-surface-2 hover:text-secondary"
              title="Open whiteboard page"
            >
              <ExternalLink className="size-3" />
              Open
            </Link>
          )}
          {mode === "live" ? (
            <button
              type="button"
              onClick={exitLiveMode}
              className="rounded bg-layer-2 px-2 py-0.5 text-11 font-medium text-secondary transition-colors hover:text-primary"
            >
              Done
            </button>
          ) : (
            loadState === "ready" && (
              <button
                type="button"
                onClick={enterLiveMode}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-11 font-medium text-tertiary transition-colors hover:bg-surface-2 hover:text-secondary"
              >
                <PenTool className="size-3" />
                {isEditable ? "Edit" : "View"}
              </button>
            )
          )}
        </div>
      </div>
      <div className="relative h-[420px] w-full">
        {loadState === "loading" ? (
          <div className="flex h-full w-full items-center justify-center text-tertiary">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : mode === "live" ? (
          <Suspense
            fallback={
              <div className="flex h-full w-full items-center justify-center text-13 text-tertiary">
                Loading whiteboard…
              </div>
            }
          >
            <ExcalidrawCanvas
              initialData={liveInitialData}
              name={displayName}
              onChange={handleChange}
              theme={excalidrawTheme}
              viewModeEnabled={!isEditable}
            />
          </Suspense>
        ) : (
          <button
            type="button"
            onClick={enterLiveMode}
            className="group/preview block h-full w-full cursor-pointer text-left"
            aria-label={isEditable ? "Edit whiteboard" : "View whiteboard"}
          >
            {hasContent ? (
              previewSvg ? (
                // eslint-disable-next-line react/no-danger
                <div className="h-full w-full" dangerouslySetInnerHTML={{ __html: previewSvg }} />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-tertiary">
                  <Loader2 className="size-4 animate-spin" />
                </div>
              )
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-tertiary">
                <Whiteboard className="size-6" />
                <span className="text-13">{isEditable ? "Blank whiteboard — click to draw" : "Blank whiteboard"}</span>
              </div>
            )}
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center opacity-0 transition-opacity group-hover/preview:opacity-100">
              <span className="rounded-full border border-subtle bg-surface-1 px-2.5 py-1 text-11 font-medium text-secondary shadow-raised-100">
                {isEditable ? "Click to edit" : "Click to explore"}
              </span>
            </div>
          </button>
        )}
      </div>
    </div>
  );
}
