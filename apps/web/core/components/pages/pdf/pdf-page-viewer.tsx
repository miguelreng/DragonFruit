/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
// Vite's `?url` transform provides the default string export at build time.
// oxlint-disable-next-line import/default
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { FileText } from "@/components/icons/lucide-shim";
import { LogoSpinner } from "@/components/common/logo-spinner";
import type { TPageInstance } from "@/store/pages/base-page";
import { cn, getEditorAssetPdfContentSrc } from "@dragonfruit/utils";
import { getPdfFitWidthScale } from "./pdf-viewer-utils";

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

// Cap the rendered page width so wide viewports get a centered reading column
// instead of an edge-to-edge zoomed-in page.
const PDF_MAX_PAGE_WIDTH = 720;

type PdfPageCanvasProps = {
  documentProxy: PDFDocumentProxy;
  pageNumber: number;
  pageCount: number;
  containerWidth: number;
};

function PdfPageCanvas({ documentProxy, pageNumber, pageCount, containerWidth }: PdfPageCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isNearViewport, setIsNearViewport] = useState(pageNumber <= 2);
  const [isRendered, setIsRendered] = useState(false);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsNearViewport(true);
      },
      { rootMargin: "1000px 0px" }
    );
    intersectionObserver.observe(wrapper);
    return () => intersectionObserver.disconnect();
  }, []);

  useEffect(() => {
    let renderTask: RenderTask | undefined;
    let cancelled = false;

    if (!isNearViewport || containerWidth <= 0) return;

    const renderPage = async () => {
      try {
        const pdfPage = await documentProxy.getPage(pageNumber);
        if (cancelled || !canvasRef.current) return;

        const baseViewport = pdfPage.getViewport({ scale: 1 });
        const scale = getPdfFitWidthScale(Math.min(containerWidth, PDF_MAX_PAGE_WIDTH + 48), baseViewport.width);
        const logicalViewport = pdfPage.getViewport({ scale });
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const renderViewport = pdfPage.getViewport({ scale: scale * outputScale });
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
        if (!cancelled) setIsRendered(true);
      } catch (renderError) {
        if (cancelled || (renderError as { name?: string }).name === "RenderingCancelledException") return;
        console.error("Failed to render PDF page", renderError);
      }
    };

    void renderPage();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [containerWidth, documentProxy, isNearViewport, pageNumber]);

  // Approximate an A4-ish aspect ratio until the real page dimensions are known,
  // so the scroller has stable-ish extents for lazy rendering.
  const placeholderWidth = Math.max(0, Math.min(containerWidth, PDF_MAX_PAGE_WIDTH + 48) - 48);
  const placeholderHeight = Math.max(120, Math.floor(placeholderWidth * 1.294));

  return (
    <div ref={wrapperRef} style={!isRendered ? { minHeight: placeholderHeight } : undefined}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Page ${pageNumber} of ${pageCount}`}
        className={cn("block bg-white shadow-raised-200 ring-1 ring-black/5", !isRendered && "hidden")}
      />
      {!isRendered && (
        <div className="bg-white/50 ring-1 ring-black/5" style={{ height: placeholderHeight, width: placeholderWidth }} />
      )}
    </div>
  );
}

export const PdfPageViewer = observer(function PdfPageViewer({ page, projectId, workspaceSlug }: Props) {
  const pdf = readPdfAsset(page.view_props);
  const assetProjectId = pdf?.projectId ?? projectId;
  const contentSrc =
    pdf && assetProjectId
      ? getEditorAssetPdfContentSrc({ assetId: pdf.assetId, projectId: assetProjectId, workspaceSlug })
      : undefined;

  const viewerRef = useRef<HTMLDivElement>(null);
  const [documentProxy, setDocumentProxy] = useState<PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [isDocumentLoading, setIsDocumentLoading] = useState(Boolean(contentSrc));
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
    setError(null);
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

  const retry = () => {
    setError(null);
    setReloadKey((current) => current + 1);
  };

  const unavailable = !contentSrc;
  const showEmptyState = unavailable || error;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-canvas">
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
          <div className="relative mx-auto flex min-h-full flex-col items-center gap-6 px-6 py-6 sm:py-8">
            {documentProxy &&
              Array.from({ length: pageCount }, (_, index) => (
                <PdfPageCanvas
                  key={index + 1}
                  documentProxy={documentProxy}
                  pageNumber={index + 1}
                  pageCount={pageCount}
                  containerWidth={containerWidth}
                />
              ))}
            {isDocumentLoading && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <LogoSpinner />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
