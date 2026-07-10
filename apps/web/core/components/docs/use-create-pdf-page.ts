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
// A freshly-created page can briefly 404 on read replicas, which makes the
// follow-up view_props PATCH (it re-fetches the page via a project join) fail.
// Retry until it is queryable before linking the asset.
const PAGE_READY_RETRY_DELAYS_MS = [150, 300, 500, 800, 1200];

const wait = (delay: number) => new Promise((resolve) => setTimeout(resolve, delay));

export const isPdfFile = (file: File) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

const errorMessage = (err: unknown, fallback: string): string => {
  if (typeof err === "string" && err.trim()) return err.trim();
  if (err && typeof err === "object") {
    const data = err as { error?: unknown; detail?: unknown; message?: unknown };
    const detail = data.error ?? data.detail ?? data.message;
    if (typeof detail === "string" && detail.trim()) return detail.trim();
  }
  return fallback;
};

/**
 * Shared flow for turning an uploaded PDF file into a `pdf` page: create the
 * page shell, upload the file as a page asset, then point the page's view_props
 * at the uploaded asset so the PDF viewer can render it. Returns the created
 * page (or null on failure) — callers decide whether to navigate or refresh.
 *
 * If uploading or linking fails, the half-created page is deleted so the docs
 * list is never left with an unopenable "PDF unavailable" page.
 */
export const useCreatePdfPage = (workspaceSlug: string) => {
  const { uploadEditorAsset } = useEditorAsset();
  const [isUploading, setIsUploading] = useState(false);

  const waitForPage = useCallback(
    async (projectId: string, pageId: string, retryDelays = PAGE_READY_RETRY_DELAYS_MS): Promise<void> => {
      try {
        await pageService.fetchById(workspaceSlug, projectId, pageId, false);
      } catch {
        const [delay, ...rest] = retryDelays;
        if (delay === undefined) return;
        await wait(delay);
        await waitForPage(projectId, pageId, rest);
      }
    },
    [workspaceSlug]
  );

  const createPdfPage = useCallback(
    async (projectId: string, file: File, parentPageId?: string): Promise<TPage | null> => {
      if (!isPdfFile(file)) {
        setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: `"${file.name}" is not a PDF file.` });
        return null;
      }
      setIsUploading(true);
      // 1. Create the PDF page shell so the asset has a page to attach to.
      let page: TPage;
      try {
        const name = file.name.replace(/\.pdf$/i, "").trim() || "PDF";
        page = await pageService.create(workspaceSlug, projectId, {
          access: EPageAccess.PUBLIC,
          page_type: "pdf",
          name,
          ...(parentPageId ? { parent: parentPageId } : {}),
        });
        if (!page?.id) throw new Error("Page could not be created.");
      } catch (err: unknown) {
        setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: errorMessage(err, "PDF page could not be created.") });
        setIsUploading(false);
        return null;
      }

      // Roll back the empty page so we never leave a broken "PDF unavailable"
      // entry behind when a later step fails.
      const rollback = async () => {
        try {
          // The API only deletes archived pages, so archive before removing.
          await pageService.archive(workspaceSlug, projectId, page.id as string);
          await pageService.remove(workspaceSlug, projectId, page.id as string);
        } catch {
          // best-effort cleanup
        }
      };

      // 2. Upload the file (presign → S3 → mark uploaded) as a page asset.
      let assetId: string;
      try {
        const res = await uploadEditorAsset({
          blockId: `pdf-${page.id}`,
          data: { entity_identifier: page.id, entity_type: EFileAssetType.PAGE_DESCRIPTION },
          file,
          projectId,
          workspaceSlug,
        });
        assetId = res.asset_id;
      } catch (err: unknown) {
        await rollback();
        // A storage/upload failure points at the asset backend (e.g. bucket CORS
        // or size limits), not at the page.
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Upload failed",
          message: errorMessage(err, `"${file.name}" could not be uploaded to storage.`),
        });
        setIsUploading(false);
        return null;
      }

      // 3. Wait for the new page to be queryable, then point it at the upload.
      try {
        await waitForPage(projectId, page.id as string);
        await pageService.update(workspaceSlug, projectId, page.id as string, {
          view_props: {
            ...(page.view_props ?? {}),
            pdf: {
              asset_id: assetId,
              project_id: projectId,
              name: file.name,
              size: file.size,
              mime_type: "application/pdf",
            },
          },
        });
        return { ...page, page_type: "pdf" };
      } catch (err: unknown) {
        await rollback();
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Error!",
          message: errorMessage(err, "PDF uploaded, but linking it to the page failed."),
        });
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [uploadEditorAsset, waitForPage, workspaceSlug]
  );

  return { createPdfPage, isUploading };
};
