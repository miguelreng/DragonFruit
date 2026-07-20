/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Content thumbnails for the docs gallery preview cards.
 *
 * The workspace pages list endpoint ships a light per-type `content_preview`
 * payload (see WorkspacePageListSerializer): parsed body blocks for docs, a
 * trimmed cell window for sheets and a reduced Excalidraw element list for
 * whiteboards. PDFs need no payload — the first page streams straight from
 * the asset endpoint into a non-interactive iframe, like the full viewer.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  File as FileIcon,
  GridIconShim,
  Image as ImageIcon,
  Whiteboard,
} from "@/components/icons/lucide-shim";
import { DocumentText } from "@solar-icons/react/ssr";
import { Logo } from "@plane/propel/emoji-icon-picker";
import type { TPage, TPageType } from "@plane/types";
import { cn, getEditorAssetInlineSrc, getPageName } from "@plane/utils";
import {
  SHEET_DEFAULT_COL_WIDTH,
  cellId,
  displayValue,
  parseSelected,
  type TCellFormat,
  type TColumnSelect,
  type TSheetGrid,
} from "@/components/pages/sheet/sheet-utils";

// Muted per-type accent hues for tinted glyph tiles. Briefs keep the brand
// accent instead (handled by the cards). doc/whiteboard/sheet/pdf → plum/sage/steel/clay.
export const DOC_CARD_TYPE_TINT: Record<string, string> = {
  doc: "#9d4b7c",
  sheet: "#5f8d6f",
  whiteboard: "#6b73a8",
  pdf: "#b5654a",
};

export const getDocPreviewIcon = (pageType: TPageType) => {
  if (pageType === "pdf") return FileIcon;
  if (pageType === "whiteboard") return Whiteboard;
  if (pageType === "sheet") return GridIconShim;
  return DocumentText;
};

export const DOC_CARD_TYPE_LABEL: Record<string, string> = {
  doc: "Doc",
  sheet: "Spreadsheet",
  whiteboard: "Whiteboard",
  pdf: "PDF",
};

/** Grid card treatment shared by the docs gallery and Home's Recent docs:
 * "paper" = title over an inset content sheet; "tile" = header + thumbnail + footer. */
export type TDocCardStyle = "paper" | "tile";
export const DOC_CARD_STYLE_STORAGE_KEY = "workspace_docs_card_style";

// ---------------------------------------------------------------------------
// content_preview payload types (mirrors WorkspacePageListSerializer)
// ---------------------------------------------------------------------------

export type TDocPreviewBlock = { t: string; x: string };

export type TWhiteboardPreviewElement = {
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  a?: number;
  stroke?: string;
  bg?: string;
  pts?: [number, number][];
  text?: string;
  fs?: number;
};

export type TDocContentPreview =
  | { kind: "doc"; blocks: TDocPreviewBlock[] }
  | {
      kind: "sheet";
      name: string;
      rows: number;
      cols: number;
      cells: Record<string, string>;
      formats?: Record<string, TCellFormat>;
      colWidths?: Record<string, number>;
      selects?: Record<string, TColumnSelect>;
      tabs?: number;
    }
  | { kind: "whiteboard"; bg?: string; els: TWhiteboardPreviewElement[] };

/** The list endpoint's preview payload; absent on other page fetches. */
export const getPageContentPreview = (
  page: TPage,
): TDocContentPreview | undefined =>
  (page as TPage & { content_preview?: TDocContentPreview | null })
    .content_preview ?? undefined;

// ---------------------------------------------------------------------------
// Doc — mini typography over the parsed body blocks
// ---------------------------------------------------------------------------

function DocBlocksMini({ blocks }: { blocks: TDocPreviewBlock[] }) {
  return (
    // Blocks must not flex-shrink: in a short card the clamped blocks would
    // compress to nothing and the visible strip would show the list's tail.
    <div className="flex h-full flex-col gap-[5px] overflow-hidden p-3 [&>*]:shrink-0">
      {blocks.map((block, index) => {
        const key = `${block.t}-${index}`;
        switch (block.t) {
          case "h1":
            return (
              <p
                key={key}
                className="line-clamp-2 text-[11px] leading-[1.35] font-bold text-primary"
              >
                {block.x}
              </p>
            );
          case "h2":
            return (
              <p
                key={key}
                className="line-clamp-2 text-[10px] leading-[1.35] font-semibold text-primary"
              >
                {block.x}
              </p>
            );
          case "h3":
            return (
              <p
                key={key}
                className="line-clamp-2 text-[9.5px] leading-[1.35] font-semibold text-secondary"
              >
                {block.x}
              </p>
            );
          case "li":
            return (
              <p
                key={key}
                className="flex gap-1 text-[9px] leading-[1.5] text-secondary"
              >
                <span className="shrink-0 text-tertiary">•</span>
                <span className="line-clamp-1 min-w-0">{block.x}</span>
              </p>
            );
          case "todo":
          case "done": {
            const isDone = block.t === "done";
            return (
              <p
                key={key}
                className="flex items-start gap-1 text-[9px] leading-[1.5]"
              >
                <span
                  className={cn(
                    "mt-[2.5px] grid size-[8px] shrink-0 place-items-center rounded-[2.5px] border",
                    isDone
                      ? "border-accent-strong bg-accent-primary text-on-color"
                      : "border-strong",
                  )}
                >
                  {isDone && (
                    <svg viewBox="0 0 8 8" className="size-[6px]" aria-hidden>
                      <path
                        d="M1.5 4.2 3.2 5.8 6.5 2.2"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.4"
                      />
                    </svg>
                  )}
                </span>
                <span
                  className={cn(
                    "line-clamp-1 min-w-0",
                    isDone ? "text-tertiary line-through" : "text-secondary",
                  )}
                >
                  {block.x}
                </span>
              </p>
            );
          }
          case "quote":
            return (
              <p
                key={key}
                className="line-clamp-2 border-l-2 border-strong pl-1.5 text-[9px] leading-[1.5] text-tertiary italic"
              >
                {block.x}
              </p>
            );
          case "code":
            return (
              <p
                key={key}
                className="line-clamp-2 rounded-[5px] bg-layer-2 px-1.5 py-1 font-mono text-[8px] leading-[1.5] whitespace-pre-wrap text-secondary"
              >
                {block.x}
              </p>
            );
          case "img":
            return (
              <span
                key={key}
                className="grid h-10 w-full shrink-0 place-items-center rounded-[6px] bg-layer-2"
              >
                <ImageIcon className="size-3.5 text-placeholder" />
              </span>
            );
          default:
            return (
              <p
                key={key}
                className="line-clamp-2 text-[9px] leading-[1.55] text-secondary"
              >
                {block.x}
              </p>
            );
        }
      })}
      {/* Fade the clipped tail into the paper. */}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-surface-1 to-transparent" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sheet — real grid window rendered through the sheet formula/format engine
// ---------------------------------------------------------------------------

const SHEET_MINI_MAX_COLS = 6;
const SHEET_MINI_MAX_ROWS = 14;

const looksNumeric = (value: string): boolean => {
  const stripped = value.replace(/[,$€£%()\s]/g, "");
  return stripped !== "" && !Number.isNaN(Number(stripped));
};

function SheetMiniCell({
  grid,
  row,
  col,
  select,
}: {
  grid: TSheetGrid;
  row: number;
  col: number;
  select?: TColumnSelect;
}) {
  const id = cellId(row, col);
  const raw = grid.cells[id] ?? "";
  const value = displayValue(grid, row, col);
  const format = grid.formats?.[id];
  const align = format?.align ?? (looksNumeric(value) ? "right" : "left");

  let content: ReactNode = value;
  if (select && raw && !raw.startsWith("=")) {
    const selected = parseSelected(raw).slice(0, 2);
    if (selected.length > 0)
      content = (
        <span className="flex items-center gap-[3px] overflow-hidden">
          {selected.map((entry) => {
            const color =
              select.options.find((option) => option.value === entry)?.color ??
              "#8892a0";
            return (
              <span
                key={entry}
                className="truncate rounded-full px-[5px] py-px text-[7.5px] leading-[10px] font-medium"
                style={{
                  color,
                  backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`,
                }}
              >
                {entry}
              </span>
            );
          })}
        </span>
      );
  }

  return (
    <span
      className={cn(
        "truncate border-r border-b border-subtle/70 px-[5px] leading-[17px]",
        {
          "text-right tabular-nums": align === "right",
          "text-center": align === "center",
          "font-semibold": format?.bold,
          italic: format?.italic,
          "line-through": format?.strike,
        },
      )}
      style={{
        color: format?.color,
        backgroundColor: format?.fill,
      }}
    >
      {content}
    </span>
  );
}

function SheetMini({
  data,
}: {
  data: Extract<TDocContentPreview, { kind: "sheet" }>;
}) {
  const cols = Math.min(data.cols, SHEET_MINI_MAX_COLS);
  const rows = Math.min(data.rows, SHEET_MINI_MAX_ROWS);
  const grid = useMemo<TSheetGrid>(
    () => ({
      id: "preview",
      name: data.name,
      rows: data.rows,
      cols: data.cols,
      cells: data.cells ?? {},
      formats: data.formats,
    }),
    [data],
  );
  const widths = useMemo(
    () =>
      Array.from(
        { length: cols },
        (_, index) =>
          data.colWidths?.[String(index)] ?? SHEET_DEFAULT_COL_WIDTH,
      ).map((width) => `${width}fr`),
    [cols, data.colWidths],
  );

  return (
    <div
      className="grid h-full w-full content-start overflow-hidden text-[8.5px] text-secondary"
      style={{ gridTemplateColumns: widths.join(" ") }}
      aria-hidden
    >
      {Array.from({ length: rows }, (_, row) =>
        Array.from({ length: cols }, (_, col) => (
          <SheetMiniCell
            key={`${row}-${col}`}
            grid={grid}
            row={row}
            col={col}
            select={data.selects?.[String(col)]}
          />
        )),
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Whiteboard — tiny SVG rendition of the Excalidraw scene
// ---------------------------------------------------------------------------

const WHITEBOARD_FALLBACK_STROKE = "#1e1e1e";

function whiteboardElementNode(
  element: TWhiteboardPreviewElement,
  index: number,
) {
  const { x, y, w, h } = element;
  const stroke = element.stroke ?? WHITEBOARD_FALLBACK_STROKE;
  const rotation = element.a
    ? `rotate(${(element.a * 180) / Math.PI} ${x + w / 2} ${y + h / 2})`
    : undefined;
  const shapeProps = {
    stroke,
    strokeWidth: 1.2,
    vectorEffect: "non-scaling-stroke" as const,
    fill: element.bg ?? "none",
    fillOpacity: element.bg ? 0.5 : undefined,
    transform: rotation,
  };

  switch (element.type) {
    case "ellipse":
      return (
        <ellipse
          key={index}
          cx={x + w / 2}
          cy={y + h / 2}
          rx={w / 2}
          ry={h / 2}
          {...shapeProps}
        />
      );
    case "diamond":
      return (
        <polygon
          key={index}
          points={`${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`}
          {...shapeProps}
        />
      );
    case "line":
    case "arrow":
    case "freedraw":
    case "draw": {
      const points = element.pts?.length
        ? element.pts
        : [
            [0, 0],
            [w, h],
          ];
      return (
        <polyline
          key={index}
          points={points.map(([px, py]) => `${x + px},${y + py}`).join(" ")}
          stroke={stroke}
          strokeWidth={1.2}
          vectorEffect="non-scaling-stroke"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          transform={rotation}
        />
      );
    }
    case "text": {
      const fontSize = element.fs ?? 20;
      const lines = (element.text ?? "").split("\n").slice(0, 4);
      return (
        <text
          key={index}
          x={x}
          y={y + fontSize * 0.85}
          fontSize={fontSize}
          fill={stroke}
          transform={rotation}
        >
          {lines.map((line, lineIndex) => (
            <tspan
              key={lineIndex}
              x={x}
              dy={lineIndex === 0 ? 0 : fontSize * 1.25}
            >
              {line}
            </tspan>
          ))}
        </text>
      );
    }
    case "image":
      return (
        <rect
          key={index}
          x={x}
          y={y}
          width={w}
          height={h}
          rx={Math.min(8, w / 8)}
          fill="#d4d4d8"
          opacity={0.7}
          transform={rotation}
        />
      );
    default:
      return (
        <rect
          key={index}
          x={x}
          y={y}
          width={w}
          height={h}
          rx={Math.min(12, w * 0.1, h * 0.1)}
          {...shapeProps}
        />
      );
  }
}

function WhiteboardMini({
  data,
}: {
  data: Extract<TDocContentPreview, { kind: "whiteboard" }>;
}) {
  const viewBox = useMemo(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    data.els.forEach((element) => {
      minX = Math.min(minX, element.x);
      minY = Math.min(minY, element.y);
      maxX = Math.max(maxX, element.x + Math.max(element.w, 1));
      maxY = Math.max(maxY, element.y + Math.max(element.h, 1));
      element.pts?.forEach(([px, py]) => {
        minX = Math.min(minX, element.x + px);
        minY = Math.min(minY, element.y + py);
        maxX = Math.max(maxX, element.x + px);
        maxY = Math.max(maxY, element.y + py);
      });
    });
    if (!Number.isFinite(minX)) return "0 0 100 100";
    const pad = Math.max(16, (maxX - minX) * 0.06, (maxY - minY) * 0.06);
    return `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
  }, [data.els]);

  // Whiteboard thumbnails keep the canvas's own (usually light) background in
  // both themes — like a real snapshot — so authored stroke colors stay legible.
  return (
    <div
      className="h-full w-full"
      style={{ backgroundColor: data.bg ?? "#ffffff" }}
      aria-hidden
    >
      <svg
        className="h-full w-full"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
      >
        {data.els.map((element, index) =>
          whiteboardElementNode(element, index),
        )}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PDF — lazy first-page render through the inline asset endpoint
// ---------------------------------------------------------------------------

function PdfMini({
  page,
  workspaceSlug,
}: {
  page: TPage;
  workspaceSlug: string;
}) {
  const pdf = page.view_props?.pdf;
  const src =
    pdf?.asset_id && pdf.project_id
      ? getEditorAssetInlineSrc({
          assetId: pdf.asset_id,
          projectId: pdf.project_id,
          workspaceSlug,
        })
      : undefined;
  const containerRef = useRef<HTMLDivElement>(null);
  // "idle" → near viewport? → HEAD-check the asset → embed or give up.
  const [loadState, setLoadState] = useState<
    "idle" | "checking" | "ready" | "unavailable"
  >("idle");

  // Only touch the network once the card scrolls near the viewport.
  useEffect(() => {
    const node = containerRef.current;
    if (!node || loadState !== "idle" || !src) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting))
          setLoadState("checking");
      },
      { rootMargin: "160px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadState, src]);

  // Confirm the asset resolves before mounting the embedded viewer — a broken
  // asset would otherwise paint the error response as a blank white tile.
  useEffect(() => {
    if (loadState !== "checking" || !src) return;
    let cancelled = false;
    fetch(src, { method: "HEAD", credentials: "include" })
      .then((response) => {
        if (!cancelled) setLoadState(response.ok ? "ready" : "unavailable");
      })
      .catch(() => {
        if (!cancelled) setLoadState("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [loadState, src]);

  if (!src || loadState === "unavailable")
    return <PreviewEmpty pageType="pdf" />;

  return (
    <div
      ref={containerRef}
      // Stay on the neutral card surface while probing; only flip to paper
      // white once the PDF actually mounts (avoids a white flash in dark mode).
      className={cn(
        "relative h-full w-full overflow-hidden",
        loadState === "ready" && "bg-white",
      )}
      aria-hidden
    >
      {loadState === "ready" && (
        <>
          {/* Paper skeleton under the iframe while the viewer boots. */}
          <div className="absolute inset-0 flex flex-col gap-1.5 p-4">
            {["70%", "94%", "88%", "92%", "60%"].map((width, index) => (
              <span
                key={index}
                className="h-[5px] rounded-full bg-neutral-200/80"
                style={{ width }}
              />
            ))}
          </div>
          {/* Render at 2× and scale down for a zoomed-out first page; the pointer
              never reaches the embedded viewer so the card stays a plain link. */}
          <iframe
            src={`${src}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
            title={pdf?.name ?? "PDF preview"}
            tabIndex={-1}
            className="pointer-events-none absolute top-0 left-0 h-[200%] w-[200%] origin-top-left scale-50 border-0"
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared surface
// ---------------------------------------------------------------------------

function PreviewEmpty({ pageType }: { pageType: TPageType }) {
  const Icon = getDocPreviewIcon(pageType);
  return (
    <div className="grid h-full w-full place-items-center">
      <Icon className="size-6 text-placeholder/70" />
    </div>
  );
}

type DocCardPreviewSurfaceProps = {
  page: TPage;
  workspaceSlug: string;
  className?: string;
};

/** Per-type content thumbnail; the parent card owns the frame (border, radius, bg). */
export function DocCardPreviewSurface({
  page,
  workspaceSlug,
  className,
}: DocCardPreviewSurfaceProps) {
  const pageType = page.page_type ?? "doc";
  const preview = getPageContentPreview(page);

  let content: ReactNode;
  if (pageType === "pdf")
    content = <PdfMini page={page} workspaceSlug={workspaceSlug} />;
  else if (preview?.kind === "sheet") content = <SheetMini data={preview} />;
  else if (preview?.kind === "whiteboard")
    content = <WhiteboardMini data={preview} />;
  else if (preview?.kind === "doc" && preview.blocks.length > 0)
    content = <DocBlocksMini blocks={preview.blocks} />;
  else if (page.description_snippet)
    content = (
      <DocBlocksMini blocks={[{ t: "p", x: page.description_snippet }]} />
    );
  else content = <PreviewEmpty pageType={pageType} />;

  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      {content}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Presentational card
// ---------------------------------------------------------------------------

type DocPreviewCardProps = {
  page: TPage;
  workspaceSlug: string;
  style: TDocCardStyle;
  /** Meta line under the title (paper style). Falls back to the type label. */
  meta?: string;
  /** Footer line under the thumbnail (tile style). Falls back to the type label. */
  footer?: string;
};

/** Non-interactive rendition of the docs-gallery preview card — same look,
 * no selection/menu/drag chrome — for surfaces like Home's Recent docs.
 * Wrap it in a Link; keep its layout in sync with DocCard in
 * workspace-docs-root.tsx when tweaking either. */
export function DocPreviewCard({ page, workspaceSlug, style, meta, footer }: DocPreviewCardProps) {
  const pageType = page.page_type ?? "doc";
  const TypeIcon = getDocPreviewIcon(pageType);
  const typeTint = DOC_CARD_TYPE_TINT[pageType] ?? DOC_CARD_TYPE_TINT.doc;
  const typeLabel = DOC_CARD_TYPE_LABEL[pageType] ?? DOC_CARD_TYPE_LABEL.doc;
  const shellClassName =
    "group t-press relative flex h-[176px] flex-col rounded-2xl bg-layer-1 transition-colors hover:bg-layer-3";
  const previewSurface = (className?: string) => (
    <div className={cn("min-h-0 overflow-hidden rounded-[10px] border border-subtle bg-surface-1", className)}>
      <DocCardPreviewSurface page={page} workspaceSlug={workspaceSlug} />
    </div>
  );

  if (style === "paper")
    return (
      <div className={cn(shellClassName, "p-4 pb-3.5")}>
        <div className="flex items-center gap-1.5">
          {page.logo_props?.in_use ? (
            <Logo logo={page.logo_props} size={14} type="lucide" />
          ) : (
            <TypeIcon weight="Bold" className="size-3.5 shrink-0" style={{ color: typeTint }} />
          )}
          <h3 className="min-w-0 truncate text-14 leading-snug font-semibold text-secondary transition-colors group-hover:text-primary">
            {getPageName(page.name)}
          </h3>
        </div>
        <p className="mt-1 truncate text-11 text-placeholder">{meta || typeLabel}</p>
        {previewSurface("mt-3 flex-1")}
      </div>
    );

  return (
    <div className={cn(shellClassName, "gap-2 p-2.5")}>
      <div className="flex items-center gap-2 px-1 pt-0.5">
        <span
          className="grid size-6 shrink-0 place-items-center rounded-[7px]"
          style={{ color: typeTint, backgroundColor: `color-mix(in srgb, ${typeTint} 14%, transparent)` }}
        >
          {page.logo_props?.in_use ? (
            <Logo logo={page.logo_props} size={14} type="lucide" />
          ) : (
            <TypeIcon weight="Bold" className="size-3.5" />
          )}
        </span>
        <h3 className="min-w-0 flex-1 truncate text-13 font-medium text-secondary transition-colors group-hover:text-primary">
          {getPageName(page.name)}
        </h3>
      </div>
      {previewSurface("flex-1")}
      <div className="flex h-5 items-center px-1 text-11 text-placeholder">
        <span className="truncate">{footer || typeLabel}</span>
      </div>
    </div>
  );
}
