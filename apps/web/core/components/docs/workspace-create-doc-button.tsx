/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef, useState, type ChangeEvent as ReactChangeEvent } from "react";
import { observer } from "mobx-react";
import { useNavigate } from "react-router";
import { EPageAccess } from "@plane/constants";
import { Button, getButtonStyling } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TPage, TPageType } from "@plane/types";
import { CustomMenu } from "@plane/ui";
import { ChevronDown, FileText, Folder, UploadCloud } from "@/components/icons/lucide-shim";
import { ProjectPageService } from "@/services/page/project-page.service";
import { DocTemplateGalleryModal } from "./doc-template-gallery-modal";
import { WikiImportModal } from "./import/wiki-import-modal";
import { isMarkdownFile, useCreateMarkdownDocPage } from "./use-create-markdown-doc";
import { isPdfFile, useCreatePdfPage } from "./use-create-pdf-page";

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
  onUploadComplete?: () => Promise<void> | void;
  showUpload?: boolean;
  buttonVariant?: "primary" | "secondary";
};

export const WorkspaceCreateDocButton = observer(function WorkspaceCreateDocButton({
  workspaceSlug,
  defaultType = "doc",
  lockedProjectId,
  parentFolderId,
  onUploadComplete,
  showUpload = true,
  buttonVariant = "primary",
}: Props) {
  const navigate = useNavigate();
  const { createPdfPage, isUploading } = useCreatePdfPage(workspaceSlug);
  const { createMarkdownDocPage, isConverting } = useCreateMarkdownDocPage(workspaceSlug);
  const [submitting, setSubmitting] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [wikiImportFiles, setWikiImportFiles] = useState<File[] | null>(null);
  const uploadFilesInputRef = useRef<HTMLInputElement>(null);
  const uploadFolderInputRef = useRef<HTMLInputElement>(null);

  // Whiteboards create straight away; docs go through the template gallery.
  const isWhiteboard = defaultType === "whiteboard";
  const label = isWhiteboard ? "New whiteboard" : "New doc";
  // Uploads need a project to attach the page to (and PDFs their asset), so
  // they are only offered inside a project-scoped Docs tab (not whiteboards).
  const canUploadFile = showUpload && !isWhiteboard && !!lockedProjectId;
  const isUploadBusy = isUploading || isConverting;
  const busy = submitting || isUploadBusy;
  const directoryInputProps = { webkitdirectory: "", directory: "" };

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

  const uploadFiles = async (projectId: string, files: File[]) => {
    if (submitting || isUploadBusy) return;
    const markdownFiles = files.filter(isMarkdownFile);
    const hasFolderShape = files.some((file) => {
      const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
      return Boolean(relativePath && relativePath !== file.name && relativePath.includes("/"));
    });
    const shouldCreateWiki =
      !parentFolderId && markdownFiles.length > 0 && (hasFolderShape || markdownFiles.length > 1);

    if (shouldCreateWiki) {
      setWikiImportFiles(files);
      return;
    }

    const supportedFiles = files.filter((file) => isMarkdownFile(file) || isPdfFile(file));
    const skippedCount = files.length - supportedFiles.length;
    if (supportedFiles.length === 0) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Upload a PDF or Markdown file." });
      return;
    }

    const createdPages = await supportedFiles.reduce<Promise<TPage[]>>(async (createdPagesPromise, file) => {
      const previousPages = await createdPagesPromise;
      const page = isMarkdownFile(file)
        ? await createMarkdownDocPage(projectId, file, parentFolderId)
        : await createPdfPage(projectId, file, parentFolderId);
      return page ? [...previousPages, page] : previousPages;
    }, Promise.resolve([]));

    if (skippedCount > 0) {
      setToast({
        type: TOAST_TYPE.WARNING,
        title: "Unsupported files skipped",
        message: `${skippedCount} ${skippedCount === 1 ? "file was" : "files were"} not a PDF or Markdown file.`,
      });
    }
    if (createdPages.length === 0) return;

    await onUploadComplete?.();
    if (createdPages.length === 1 && createdPages[0]?.id) {
      await waitForCreatedPage(projectId, createdPages[0].id);
      navigate(`/${workspaceSlug}/projects/${projectId}/pages/${createdPages[0].id}`);
      return;
    }

    setToast({
      type: TOAST_TYPE.SUCCESS,
      title: "Success!",
      message: `${createdPages.length} files uploaded.`,
    });
  };

  const handleClick = () => {
    if (isWhiteboard) {
      if (lockedProjectId) {
        void createWhiteboard(lockedProjectId);
      } else {
        setGalleryOpen(true);
      }
      return;
    }
    setGalleryOpen(true);
  };

  const handleUploadFileChange = (event: ReactChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // Reset so picking the same file again still fires onChange.
    event.target.value = "";
    if (files.length > 0 && lockedProjectId) void uploadFiles(lockedProjectId, files);
  };

  return (
    <>
      {canUploadFile && (
        <CustomMenu
          ariaLabel="Upload files"
          placement="bottom-end"
          closeOnSelect
          disabled={isUploadBusy}
          customButtonClassName={getButtonStyling("secondary", "lg")}
          customButton={
            <>
              <UploadCloud className="size-4" />
              <span>{isUploadBusy ? "Uploading" : "Upload"}</span>
              <ChevronDown className="size-3" />
            </>
          }
        >
          <CustomMenu.MenuItem onClick={() => uploadFilesInputRef.current?.click()}>
            <span className="flex items-center gap-2">
              <FileText className="size-4" />
              Choose files
            </span>
          </CustomMenu.MenuItem>
          <CustomMenu.MenuItem onClick={() => uploadFolderInputRef.current?.click()}>
            <span className="flex items-center gap-2">
              <Folder className="size-4" />
              Choose folder
            </span>
          </CustomMenu.MenuItem>
        </CustomMenu>
      )}
      <Button variant={buttonVariant} size="lg" loading={busy} onClick={handleClick}>
        {busy ? "Adding" : label}
      </Button>
      {canUploadFile && (
        <>
          <input
            ref={uploadFilesInputRef}
            type="file"
            multiple
            accept=".pdf,.md,.markdown,application/pdf,text/markdown,text/x-markdown,application/x-markdown"
            className="hidden"
            onChange={handleUploadFileChange}
          />
          <input
            ref={uploadFolderInputRef}
            type="file"
            multiple
            accept=".md,.markdown,text/markdown,text/x-markdown,application/x-markdown"
            className="hidden"
            onChange={handleUploadFileChange}
            {...directoryInputProps}
          />
        </>
      )}
      {lockedProjectId && wikiImportFiles && (
        <WikiImportModal
          workspaceSlug={workspaceSlug}
          projectId={lockedProjectId}
          isOpen={wikiImportFiles !== null}
          files={wikiImportFiles}
          onClose={() => setWikiImportFiles(null)}
          onImported={async () => {
            await onUploadComplete?.();
          }}
        />
      )}
      {(!isWhiteboard || !lockedProjectId) && (
        <DocTemplateGalleryModal
          workspaceSlug={workspaceSlug}
          isOpen={galleryOpen}
          onClose={() => setGalleryOpen(false)}
          lockedProjectId={lockedProjectId}
          parentPageId={parentFolderId}
          projectPickerOnlyType={isWhiteboard ? "whiteboard" : undefined}
        />
      )}
    </>
  );
});
