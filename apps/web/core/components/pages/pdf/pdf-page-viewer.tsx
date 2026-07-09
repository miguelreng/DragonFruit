/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import { FileText } from "@/components/icons/lucide-shim";
import { PageEditorHeaderRoot } from "@/components/pages/editor/header";
import { PageEditorTitle } from "@/components/pages/editor/title";
import type { TPageInstance } from "@/store/pages/base-page";
import { getEditorAssetInlineSrc } from "@plane/utils";

type Props = {
  page: TPageInstance;
  projectId?: string;
  workspaceSlug: string;
};

const readPdfAsset = (viewProps: Record<string, unknown> | undefined) => {
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

export const PdfPageViewer = observer(function PdfPageViewer({ page, projectId, workspaceSlug }: Props) {
  const pdf = readPdfAsset(page.view_props);
  const assetProjectId = pdf?.projectId ?? projectId;
  const inlineSrc =
    pdf && assetProjectId
      ? getEditorAssetInlineSrc({ assetId: pdf.assetId, projectId: assetProjectId, workspaceSlug })
      : undefined;

  useEffect(() => {
    page.setSyncingStatus("synced");
  }, [page]);

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
      {inlineSrc ? (
        // The browser's built-in PDF viewer already provides scroll, zoom, print
        // and download — a plain full-height iframe is all we need.
        <iframe title={pdf?.name ?? "PDF"} src={inlineSrc} className="mt-3 h-full w-full flex-1 border-0" />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <FileText className="size-8 text-tertiary" />
          <p className="text-13 font-medium text-primary">PDF file is unavailable.</p>
          <p className="max-w-sm text-12 text-tertiary">The page exists, but its uploaded asset could not be found.</p>
        </div>
      )}
    </div>
  );
});
