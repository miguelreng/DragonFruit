/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef, useState } from "react";
import { observer } from "mobx-react";
import { useNavigate } from "react-router";
import { EPageAccess } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TPageType } from "@plane/types";
import { UploadCloud } from "@/components/icons/lucide-shim";
import { ProjectPageService } from "@/services/page/project-page.service";
import { DocTemplateGalleryModal } from "./doc-template-gallery-modal";
import { useCreatePdfPage } from "./use-create-pdf-page";

const pageService = new ProjectPageService();
const PAGE_READY_RETRY_DELAYS_MS = [150, 300, 500, 800, 1200];

const wait = (delay: number) => new Promise((resolve) => setTimeout(resolve, delay));

type Props = {
  workspaceSlug: string;
  defaultType?: TPageType;
  /** Create directly in this project (skips the gallery's project picker). */
  lockedProjectId?: string;
  /** When the docs list is drilled into a folder, new docs/PDFs are created
   * inside it. Requires `lockedProjectId` (folders are project-scoped). */
  parentFolderId?: string;
};

export const WorkspaceCreateDocButton = observer(function WorkspaceCreateDocButton({
  workspaceSlug,
  defaultType = "doc",
  lockedProjectId,
  parentFolderId,
}: Props) {
  const navigate = useNavigate();
  const { createPdfPage, isUploading } = useCreatePdfPage(workspaceSlug);
  const [submitting, setSubmitting] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // Whiteboards create straight away; docs go through the template gallery.
  const isWhiteboard = defaultType === "whiteboard";
  const label = isWhiteboard ? "New whiteboard" : "New doc";
  // Uploading a PDF needs a project to attach the asset to, so it is only
  // offered inside a project-scoped Docs tab (not the whiteboard tab).
  const canUploadPdf = !isWhiteboard && !!lockedProjectId;
  const busy = submitting || isUploading;

  const waitForCreatedPage = async (projectId: string, pageId: string, retryDelays = PAGE_READY_RETRY_DELAYS_MS) => {
    try {
      await pageService.fetchById(workspaceSlug, projectId, pageId, false);
    } catch {
      const [delay, ...remainingDelays] = retryDelays;
      if (delay === undefined) return;
      await wait(delay);
      await waitForCreatedPage(projectId, pageId, remainingDelays);
    }
  };

  const createWhiteboard = async (projectId: string) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const page = await pageService.create(workspaceSlug, projectId, {
        access: EPageAccess.PUBLIC,
        page_type: "whiteboard",
      });
      if (page?.id) {
        // Avoid opening the editor before the new page is queryable.
        await waitForCreatedPage(projectId, page.id);
        navigate(`/${workspaceSlug}/projects/${projectId}/pages/${page.id}`);
      }
    } catch (err: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: err?.error || "Whiteboard could not be created. Please try again.",
      });
      setSubmitting(false);
    }
  };

  const uploadPdf = async (projectId: string, file: File) => {
    if (submitting || isUploading) return;
    const page = await createPdfPage(projectId, file, parentFolderId);
    if (!page?.id) return;
    // Avoid opening the viewer before the new page is queryable.
    await waitForCreatedPage(projectId, page.id);
    navigate(`/${workspaceSlug}/projects/${projectId}/pages/${page.id}`);
  };

  const handleClick = () => {
    if (isWhiteboard) {
      // Whiteboards only ever render inside a project-scoped tab.
      if (lockedProjectId) void createWhiteboard(lockedProjectId);
      return;
    }
    setGalleryOpen(true);
  };

  const handlePdfFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so picking the same file again still fires onChange.
    event.target.value = "";
    if (file && lockedProjectId) void uploadPdf(lockedProjectId, file);
  };

  return (
    <>
      {canUploadPdf && (
        <Button
          variant="secondary"
          size="lg"
          loading={isUploading}
          prependIcon={<UploadCloud className="size-4" />}
          onClick={() => pdfInputRef.current?.click()}
        >
          {isUploading ? "Uploading" : "Upload PDF"}
        </Button>
      )}
      <Button variant="primary" size="lg" loading={busy} onClick={handleClick}>
        {busy ? "Adding" : label}
      </Button>
      {canUploadPdf && (
        <input
          ref={pdfInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handlePdfFileChange}
        />
      )}
      {!isWhiteboard && (
        <DocTemplateGalleryModal
          workspaceSlug={workspaceSlug}
          isOpen={galleryOpen}
          onClose={() => setGalleryOpen(false)}
          lockedProjectId={lockedProjectId}
          parentPageId={parentFolderId}
        />
      )}
    </>
  );
});
