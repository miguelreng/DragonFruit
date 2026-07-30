/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { observer } from "mobx-react";
import type { OnProgressParameters, PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
// Vite's `?url` transform provides the default string export at build time.
// oxlint-disable-next-line import/default
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
} from "@/components/icons/lucide-shim";
import { PageEditorHeaderRoot } from "@/components/pages/editor/header";
import { PageEditorTitle } from "@/components/pages/editor/title";
import type { TPageInstance } from "@/store/pages/base-page";
import { cn, getEditorAssetInlineSrc, getEditorAssetPdfContentSrc } from "@plane/utils";
import { clampPdfScale, getPdfFitWidthScale, PDF_MAX_SCALE, PDF_MIN_SCALE, PDF_SCALE_STEP } from "./pdf-viewer-utils";

type Props = {
  page: TPageInstance;
  projectId?: string;
  workspaceSlug: string;
};

type PdfAsset = {
  assetId: string;
  projectId?: string;
  name: string;
};

type ZoomMode = "fit-width" | "custom";

const readPdfAsset = (viewProps: Record<string, unknown> | undefined): PdfAsset | undefined => {
  const rawPdf = viewProps?.pdf;
  if (!rawPdf || typeof rawPdf !== "object") return undefined;
  const pdf = rawPdf as Record<string, unknown>;
  if (typeof pdf.asset_id !== "string" || !pdf.asset_id) return undefined;
  return {
    assetId: pdf.asset_id,
    projectId: typeof pdf.project_id === "string" ? pdf.project_id : undefined,
    name: typeof pdf.name === "string" && pdf.name.trim() ? pdf.name : "PDF",
  };
};

type ToolbarButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  label: string;
  children: ReactNode;
};

function ToolbarButton({ active = false, label, children, className, ...props }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-lg text-secondary transition-colors",
        "hover:bg-layer-2 hover:text-primary disabled:pointer-events-none disabled:opacity-35",
        active && "bg-accent-primary/10 text-accent-primary",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export const PdfPageViewer = observer(function PdfPageViewer({ page, projectId, workspaceSlug }: Props) {
  const pdf = readPdfAsset(page.view_props);
  const assetProjectId = pdf?.projectId ?? projectId;
  const inlineSrc =
    pdf && assetProjectId
      ? getEditorAssetInlineSrc({ assetId: pdf.assetId, projectId: assetProjectId, workspaceSlug })
      : undefined;
  const contentSrc =
    pdf && assetProjectId
      ? getEditorAssetPdfContentSrc({ assetId: pdf.assetId, projectId: assetProjectId, workspaceSlug })
      : undefined;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const [documentProxy, setDocumentProxy] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [zoomMode, setZoomMode] = useState<ZoomMode>("fit-width");
  const [customScale, setCustomScale] = useState(1);
  const [renderedScale, setRenderedScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [loadProgress, setLoadProgress] = useState<number | null>(null);
  const [isDocumentLoading, setIsDocumentLoading] = useState(Boolean(contentSrc));
  const [isPageRendering, setIsPageRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    page.setSyncingStatus("synced");
  }, [page]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const updateWidth = () => setContainerWidth(viewer.clientWidth);
    updateWidth();
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(viewer);
    return () => resizeObserver.disconnect();
  }, [contentSrc]);

  useEffect(() => {
    let loadingTask: PDFDocumentLoadingTask | undefined;
    let cancelled = false;

    setDocumentProxy(null);
    setPageCount(0);
    setPageNumber(1);
    setError(null);
    setLoadProgress(null);
    setIsDocumentLoading(Boolean(contentSrc));

    if (!contentSrc) return;

    const loadDocument = async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        loadingTask = pdfjs.getDocument({
          url: contentSrc,
          withCredentials: true,
          disableRange: true,
          disableStream: true,
        });
        loadingTask.onProgress = ({ loaded, total }: OnProgressParameters) => {
          if (!cancelled && total > 0) setLoadProgress(Math.round((loaded / total) * 100));
        };
        const loadedDocument = await loadingTask.promise;
        if (cancelled) {
          await loadedDocument.destroy();
          return;
        }
        setDocumentProxy(loadedDocument);
        setPageCount(loadedDocument.numPages);
      } catch (loadError) {
        if (cancelled) return;
        console.error("Failed to load PDF", loadError);
        setError("This PDF couldn’t be opened. It may be damaged, protected, or temporarily unavailable.");
      } finally {
        if (!cancelled) setIsDocumentLoading(false);
      }
    };

    void loadDocument();

    return () => {
      cancelled = true;
      void loadingTask?.destroy();
    };
  }, [contentSrc, reloadKey]);

  useEffect(() => {
    let renderTask: RenderTask | undefined;
    let cancelled = false;

    if (!documentProxy || !canvasRef.current || containerWidth <= 0) return;

    const renderPage = async () => {
      setIsPageRendering(true);
      try {
        const pdfPage = await documentProxy.getPage(pageNumber);
        if (cancelled || !canvasRef.current) return;

        const baseViewport = pdfPage.getViewport({ scale: 1, rotation });
        const nextScale =
          zoomMode === "fit-width"
            ? getPdfFitWidthScale(containerWidth, baseViewport.width)
            : clampPdfScale(customScale);
        const logicalViewport = pdfPage.getViewport({ scale: nextScale, rotation });
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const renderViewport = pdfPage.getViewport({ scale: nextScale * outputScale, rotation });
        const canvas = canvasRef.current;
        canvas.width = Math.floor(renderViewport.width);
        canvas.height = Math.floor(renderViewport.height);
        canvas.style.width = `${Math.floor(logicalViewport.width)}px`;
        canvas.style.height = `${Math.floor(logicalViewport.height)}px`;

        renderTask = pdfPage.render({
          canvas,
          viewport: renderViewport,
          background: "rgb(255, 255, 255)",
        });
        await renderTask.promise;
        if (!cancelled) setRenderedScale(nextScale);
      } catch (renderError) {
        if (cancelled || (renderError as { name?: string }).name === "RenderingCancelledException") return;
        console.error("Failed to render PDF page", renderError);
        setError("This page couldn’t be rendered. Try reloading the PDF.");
      } finally {
        if (!cancelled) setIsPageRendering(false);
      }
    };

    void renderPage();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [containerWidth, customScale, documentProxy, pageNumber, rotation, zoomMode]);

  const changeZoom = useCallback(
    (direction: -1 | 1) => {
      const nextScale = clampPdfScale(renderedScale + direction * PDF_SCALE_STEP);
      setCustomScale(nextScale);
      setZoomMode("custom");
    },
    [renderedScale]
  );

  const goToPage = useCallback(
    (nextPage: number) => {
      setPageNumber(Math.min(pageCount, Math.max(1, nextPage)));
      viewerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    },
    [pageCount]
  );

  const retry = () => {
    setError(null);
    setReloadKey((current) => current + 1);
  };

  const unavailable = !contentSrc;
  const showEmptyState = unavailable || error;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-canvas">
      <div className="mx-auto w-full max-w-[1120px] px-page-x pt-6">
        <div className="page-header-container group/page-header">
          <PageEditorHeaderRoot page={page} projectId={projectId} />
          <PageEditorTitle
            editorRef={null}
            readOnly={!page.isContentEditable}
            title={page.name}
            updateTitle={page.updateTitle}
          />
        </div>
      </div>

      {inlineSrc && (
        <div className="mt-3 shrink-0 border-y border-subtle bg-surface-1">
          <div className="mx-auto flex h-11 w-full max-w-[1120px] items-center gap-2 px-3 sm:px-page-x">
            <div className="hidden min-w-0 flex-1 items-center gap-2 sm:flex">
              <FileText className="size-4 shrink-0 text-tertiary" />
              <span className="truncate text-12 font-medium text-secondary">{pdf?.name ?? "PDF"}</span>
            </div>

            <div className="flex flex-1 items-center justify-start gap-0.5 sm:flex-none sm:justify-center">
              <ToolbarButton
                label="Previous page"
                disabled={!documentProxy || pageNumber <= 1}
                onClick={() => goToPage(pageNumber - 1)}
              >
                <ChevronLeft className="size-4" />
              </ToolbarButton>
              <span className="min-w-[70px] text-center text-11 text-secondary tabular-nums">
                {pageCount ? `${pageNumber} / ${pageCount}` : "— / —"}
              </span>
              <ToolbarButton
                label="Next page"
                disabled={!documentProxy || pageNumber >= pageCount}
                onClick={() => goToPage(pageNumber + 1)}
              >
                <ChevronRight className="size-4" />
              </ToolbarButton>
            </div>

            <div className="flex flex-1 items-center justify-end gap-0.5">
              <ToolbarButton
                label="Zoom out"
                disabled={!documentProxy || renderedScale <= PDF_MIN_SCALE}
                onClick={() => changeZoom(-1)}
              >
                <Minus className="size-4" />
              </ToolbarButton>
              <button
                type="button"
                title="Fit page width"
                aria-label="Fit page width"
                onClick={() => setZoomMode("fit-width")}
                disabled={!documentProxy}
                className={cn(
                  "h-7 min-w-[52px] rounded-lg px-1.5 text-11 text-secondary tabular-nums transition-colors",
                  "hover:bg-layer-2 hover:text-primary disabled:pointer-events-none disabled:opacity-35",
                  zoomMode === "fit-width" && "bg-accent-primary/10 text-accent-primary"
                )}
              >
                {Math.round(renderedScale * 100)}%
              </button>
              <ToolbarButton
                label="Zoom in"
                disabled={!documentProxy || renderedScale >= PDF_MAX_SCALE}
                onClick={() => changeZoom(1)}
              >
                <Plus className="size-4" />
              </ToolbarButton>
              <span className="mx-1 h-4 w-px bg-[var(--border-color-subtle)]" aria-hidden="true" />
              <ToolbarButton
                label="Rotate clockwise"
                disabled={!documentProxy}
                onClick={() => setRotation((current) => (current + 90) % 360)}
              >
                <RotateCcw className="size-4 -scale-x-100" />
              </ToolbarButton>
              <a
                href={inlineSrc}
                download={pdf?.name}
                aria-label="Download PDF"
                title="Download PDF"
                className="grid size-7 shrink-0 place-items-center rounded-lg text-secondary transition-colors hover:bg-layer-2 hover:text-primary"
              >
                <Download className="size-4" />
              </a>
            </div>
          </div>
        </div>
      )}

      <div
        ref={viewerRef}
        className="relative flex min-h-0 flex-1 overflow-auto bg-layer-1 [scrollbar-gutter:stable_both-edges]"
      >
        {showEmptyState ? (
          <div className="flex min-h-full w-full flex-col items-center justify-center gap-2 px-6 text-center">
            <span className="mb-1 grid size-12 place-items-center rounded-2xl bg-layer-2 text-tertiary">
              <FileText className="size-6" />
            </span>
            <p className="text-13 font-medium text-primary">
              {unavailable ? "PDF file is unavailable." : "PDF couldn’t be displayed."}
            </p>
            <p className="max-w-sm text-12 text-tertiary">
              {unavailable ? "The page exists, but its uploaded asset could not be found." : error}
            </p>
            {error && (
              <button
                type="button"
                onClick={retry}
                className="mt-2 rounded-lg bg-accent-primary px-3 py-1.5 text-12 font-medium text-on-color transition-opacity hover:opacity-90"
              >
                Try again
              </button>
            )}
          </div>
        ) : (
          <div className="relative mx-auto min-h-full p-6 sm:p-8">
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={`Page ${pageNumber} of ${pageCount || 1}`}
              className={cn(
                "block bg-white shadow-raised-200 ring-1 ring-black/5 transition-opacity",
                (isDocumentLoading || isPageRendering) && "opacity-40"
              )}
            />
            {(isDocumentLoading || isPageRendering) && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="flex items-center gap-2 rounded-xl border border-subtle bg-surface-1/95 px-3 py-2 text-12 text-secondary shadow-raised-100 backdrop-blur-sm">
                  <Loader2 className="size-4 animate-spin text-accent-primary" />
                  <span>
                    {isDocumentLoading ? `Opening PDF${loadProgress ? ` · ${loadProgress}%` : ""}` : "Rendering page"}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
