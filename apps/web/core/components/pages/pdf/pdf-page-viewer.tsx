/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, type ReactNode } from "react";
import { observer } from "mobx-react";
import { Download, ExternalLink, FileText } from "@/components/icons/lucide-shim";
import { PageEditorHeaderRoot } from "@/components/pages/editor/header";
import { PageEditorTitle } from "@/components/pages/editor/title";
import type { TPageInstance } from "@/store/pages/base-page";
import { cn, convertBytesToSize, getEditorAssetDownloadSrc, getEditorAssetInlineSrc } from "@plane/utils";

type TPdfMeta = {
  assetId: string;
  projectId?: string;
  name: string;
  size?: number;
};

type Props = {
  page: TPageInstance;
  projectId?: string;
  workspaceSlug: string;
};

const readPdfMeta = (viewProps: Record<string, unknown> | undefined): TPdfMeta | undefined => {
  const rawPdf = viewProps?.pdf;
  if (!rawPdf || typeof rawPdf !== "object") return undefined;

  const pdf = rawPdf as Record<string, unknown>;
  if (typeof pdf.asset_id !== "string" || !pdf.asset_id) return undefined;

  return {
    assetId: pdf.asset_id,
    projectId: typeof pdf.project_id === "string" ? pdf.project_id : undefined,
    name: typeof pdf.name === "string" && pdf.name.trim() ? pdf.name : "PDF file",
    size: typeof pdf.size === "number" ? pdf.size : undefined,
  };
};

export const PdfPageViewer = observer(function PdfPageViewer({ page, projectId, workspaceSlug }: Props) {
  const pdfMeta = readPdfMeta(page.view_props);
  const assetProjectId = pdfMeta?.projectId ?? projectId;
  const inlineSrc =
    pdfMeta && assetProjectId
      ? getEditorAssetInlineSrc({ assetId: pdfMeta.assetId, projectId: assetProjectId, workspaceSlug })
      : undefined;
  const downloadSrc =
    pdfMeta && assetProjectId
      ? getEditorAssetDownloadSrc({ assetId: pdfMeta.assetId, projectId: assetProjectId, workspaceSlug })
      : undefined;

  useEffect(() => {
    page.setSyncingStatus("synced");
  }, [page]);

  return (
    <div className="vertical-scrollbar h-full w-full overflow-y-auto bg-canvas">
      <div className="mx-auto flex min-h-full w-full max-w-[1120px] flex-col px-page-x py-6">
        <div className="page-header-container group/page-header">
          <PageEditorHeaderRoot page={page} projectId={projectId} />
          <PageEditorTitle
            editorRef={null}
            readOnly={!page.isContentEditable}
            title={page.name}
            updateTitle={page.updateTitle}
          />
        </div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-subtle bg-surface-1 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid size-8 flex-shrink-0 place-items-center rounded-lg bg-layer-1 text-tertiary">
              <FileText className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-13 font-medium text-primary">{pdfMeta?.name ?? "PDF file"}</p>
              {pdfMeta?.size !== undefined && (
                <p className="text-11 text-tertiary">{convertBytesToSize(pdfMeta.size)}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <PdfAction href={inlineSrc} label="Open" icon={<ExternalLink className="size-3.5" />} />
            <PdfAction href={downloadSrc} label="Download" icon={<Download className="size-3.5" />} />
          </div>
        </div>
        <div className="flex min-h-[640px] flex-1 overflow-hidden rounded-lg border border-subtle bg-surface-1">
          {inlineSrc ? (
            <iframe
              title="PDF preview"
              src={inlineSrc}
              sandbox="allow-downloads allow-same-origin"
              className="h-full min-h-[70vh] w-full"
            />
          ) : (
            <div className="flex min-h-[70vh] w-full flex-col items-center justify-center gap-2 text-center">
              <FileText className="size-8 text-tertiary" />
              <p className="text-13 font-medium text-primary">PDF file is unavailable.</p>
              <p className="max-w-sm text-12 text-tertiary">
                The page exists, but its uploaded asset could not be found.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

type PdfActionProps = {
  href?: string;
  icon: ReactNode;
  label: string;
};

function PdfAction({ href, icon, label }: PdfActionProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-disabled={!href}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg border border-subtle px-2.5 text-12 font-medium text-secondary transition-colors hover:bg-layer-1 hover:text-primary",
        { "pointer-events-none opacity-50": !href }
      )}
    >
      {icon}
      {label}
    </a>
  );
}
