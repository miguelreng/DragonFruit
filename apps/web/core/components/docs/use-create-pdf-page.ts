/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useState } from "react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EPageAccess } from "@plane/constants";
import { EFileAssetType, type TPage } from "@plane/types";
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { ProjectPageService } from "@/services/page/project-page.service";

const pageService = new ProjectPageService();

export const isPdfFile = (file: File) =>
  file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

/**
 * Shared flow for turning an uploaded PDF file into a `pdf` page: create the
 * page shell, upload the file as a page asset, then point the page's view_props
 * at the uploaded asset so the PDF viewer can render it. Returns the created
 * page (or null on failure) — callers decide whether to navigate or refresh.
 */
export const useCreatePdfPage = (workspaceSlug: string) => {
  const { uploadEditorAsset } = useEditorAsset();
  const [isUploading, setIsUploading] = useState(false);

  const createPdfPage = useCallback(
    async (projectId: string, file: File): Promise<TPage | null> => {
      if (!isPdfFile(file)) {
        setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: `"${file.name}" is not a PDF file.` });
        return null;
      }
      setIsUploading(true);
      try {
        const name = file.name.replace(/\.pdf$/i, "").trim() || "PDF";
        // 1. Create the PDF page shell so the asset has a page to attach to.
        const page = await pageService.create(workspaceSlug, projectId, {
          access: EPageAccess.PUBLIC,
          page_type: "pdf",
          name,
        });
        if (!page?.id) throw new Error("Page could not be created.");
        // 2. Upload the file (presign → S3 → mark uploaded) as a page asset.
        const { asset_id } = await uploadEditorAsset({
          blockId: `pdf-${page.id}`,
          data: { entity_identifier: page.id, entity_type: EFileAssetType.PAGE_DESCRIPTION },
          file,
          projectId,
          workspaceSlug,
        });
        // 3. Point the page at its uploaded PDF so the viewer can render it.
        await pageService.update(workspaceSlug, projectId, page.id, {
          view_props: {
            ...(page.view_props ?? {}),
            pdf: {
              asset_id,
              project_id: projectId,
              name: file.name,
              size: file.size,
              mime_type: "application/pdf",
            },
          },
        });
        return { ...page, page_type: "pdf" };
      } catch (err: any) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Error!",
          message: err?.error || `"${file.name}" could not be uploaded. Please try again.`,
        });
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [uploadEditorAsset, workspaceSlug]
  );

  return { createPdfPage, isUploading };
};
