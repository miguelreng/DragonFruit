/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { EPageAccess } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { FileText, FolderPlus, X } from "@/components/icons/lucide-shim";
import { ProjectPageService } from "@/services/page/project-page.service";
import { getImportErrorMessage } from "./markdown-doc";
import { planWikiImport, type TWikiImportDraft } from "./wiki-import-planner";

const pageService = new ProjectPageService();

type Props = {
  workspaceSlug: string;
  projectId: string;
  isOpen: boolean;
  files: File[];
  parentFolderId?: string;
  onClose: () => void;
  onImported: () => Promise<void> | void;
};

export function WikiImportModal(props: Props) {
  const { workspaceSlug, projectId, isOpen, files, parentFolderId, onClose, onImported } = props;
  const [draft, setDraft] = useState<TWikiImportDraft | null>(null);
  const [collectionName, setCollectionName] = useState("");
  const [isPlanning, setIsPlanning] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let isActive = true;
    setDraft(null);
    setCollectionName("");
    setIsPlanning(true);

    const loadDraft = async () => {
      try {
        const nextDraft = await planWikiImport(files);
        if (!isActive) return;
        setDraft(nextDraft);
        setCollectionName(nextDraft.collectionName);
      } catch {
        if (!isActive) return;
        setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Files could not be read." });
      } finally {
        if (isActive) setIsPlanning(false);
      }
    };

    void loadDraft();
    return () => {
      isActive = false;
    };
  }, [files, isOpen]);

  const importableCount = draft?.files.length ?? 0;
  const skippedCount = draft?.skipped.length ?? 0;
  const canImport = Boolean(draft && importableCount > 0 && collectionName.trim() && !parentFolderId);
  const previewFiles = useMemo(() => draft?.files ?? [], [draft]);

  const handleClose = () => {
    if (isImporting) return;
    onClose();
  };

  const handleImport = async () => {
    if (!draft || !canImport || isImporting) return;
    setIsImporting(true);
    try {
      const folder = await pageService.create(workspaceSlug, projectId, {
        access: EPageAccess.PRIVATE,
        page_type: "folder",
        name: collectionName.trim(),
      });
      if (!folder?.id) throw new Error("Folder could not be created.");
      const folderId = folder.id;

      const { createdCount, failed } = await draft.files.reduce<Promise<{ createdCount: number; failed: string[] }>>(
        async (previousResultPromise, fileDraft) => {
          const previousResult = await previousResultPromise;
          try {
            await pageService.create(workspaceSlug, projectId, {
              access: EPageAccess.PUBLIC,
              page_type: "doc",
              name: fileDraft.pageName,
              description_html: fileDraft.descriptionHtml,
              parent: folderId,
              view_props: {
                import_wiki: {
                  source_path: fileDraft.relativePath,
                },
              },
            });
            return { ...previousResult, createdCount: previousResult.createdCount + 1 };
          } catch {
            return { ...previousResult, failed: [...previousResult.failed, fileDraft.relativePath] };
          }
        },
        Promise.resolve({ createdCount: 0, failed: [] })
      );

      if (failed.length > 0) {
        setToast({
          type: TOAST_TYPE.WARNING,
          title: "Wiki partially created",
          message: `${createdCount} imported, ${failed.length} failed.`,
        });
      } else {
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Wiki created",
          message: `${createdCount} doc${createdCount === 1 ? "" : "s"} imported.`,
        });
      }
      await onImported();
      onClose();
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: getImportErrorMessage(error, "Wiki could not be created. Please try again."),
      });
      setIsImporting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.TOP} width={EModalWidth.XXXXL}>
      <div className="flex h-[620px] max-h-[82vh] flex-col">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-subtle px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-lg bg-layer-1 text-tertiary">
                <FolderPlus className="size-4" />
              </span>
              <h2 className="truncate text-16 font-medium text-primary">Import wiki</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isImporting}
            className="grid size-7 shrink-0 place-items-center rounded-lg text-tertiary hover:bg-layer-1 hover:text-primary disabled:opacity-60"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-5 py-4">
          <label className="block shrink-0">
            <span className="mb-1.5 block text-11 font-medium text-secondary">Collection name</span>
            <input
              value={collectionName}
              onChange={(event) => setCollectionName(event.target.value)}
              disabled={isImporting || isPlanning}
              className="focus:border-accent-primary h-10 w-full rounded-lg border border-subtle bg-surface-1 px-3 text-13 text-primary outline-none placeholder:text-placeholder disabled:opacity-60"
              placeholder="Imported wiki"
            />
          </label>

          <div className="grid shrink-0 grid-cols-3 gap-2">
            <ImportStat label="Pages" value={isPlanning ? "..." : String(importableCount)} />
            <ImportStat label="Skipped" value={isPlanning ? "..." : String(skippedCount)} />
            <ImportStat label="Files" value={String(files.length)} />
          </div>

          {parentFolderId && (
            <p className="border-amber-500/20 bg-amber-500/10 text-amber-600 shrink-0 rounded-lg border px-3 py-2 text-12">
              Wiki imports are created from the project Docs root in this version.
            </p>
          )}

          {draft && draft.warnings.length > 0 && (
            <div className="shrink-0 rounded-lg border border-subtle bg-layer-1 px-3 py-2">
              {draft.warnings.map((warning) => (
                <p key={warning} className="text-12 text-tertiary">
                  {warning}
                </p>
              ))}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-subtle">
            <div className="flex items-center justify-between border-b border-subtle bg-layer-1 px-3 py-2">
              <span className="text-12 font-medium text-secondary">Preview</span>
              {draft && <span className="text-11 text-tertiary">{importableCount} Markdown</span>}
            </div>
            <div className="h-full overflow-y-auto">
              {isPlanning ? (
                <p className="px-3 py-4 text-13 text-tertiary">Reading files...</p>
              ) : previewFiles.length > 0 ? (
                previewFiles.map((file) => (
                  <div
                    key={file.relativePath}
                    className="flex items-center gap-3 border-b border-subtle px-3 py-2.5 last:border-b-0"
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-layer-1 text-tertiary">
                      <FileText className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-13 font-medium text-primary">{file.pageName}</p>
                      <p className="truncate text-11 text-tertiary">{file.relativePath}</p>
                    </div>
                    <span className="shrink-0 rounded-lg border border-subtle px-1.5 py-0.5 text-10 text-tertiary">
                      Markdown
                    </span>
                  </div>
                ))
              ) : (
                <p className="px-3 py-4 text-13 text-tertiary">No Markdown files found.</p>
              )}
            </div>
          </div>

          {draft && draft.skipped.length > 0 && (
            <div className="max-h-24 shrink-0 overflow-y-auto rounded-lg border border-subtle">
              {draft.skipped.map((file) => (
                <div
                  key={file.relativePath}
                  className="flex items-center gap-2 border-b border-subtle px-3 py-2 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 truncate text-12 text-tertiary">{file.relativePath}</span>
                  <span className="shrink-0 text-11 text-placeholder">{file.reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-subtle px-5 py-3">
          <Button variant="secondary" size="lg" onClick={handleClose} disabled={isImporting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="lg"
            loading={isImporting}
            disabled={!canImport || isPlanning}
            onClick={() => void handleImport()}
            className={cn({ "opacity-60": !canImport })}
          >
            Create wiki
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}

function ImportStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-subtle bg-surface-1 px-3 py-2">
      <p className="text-10 font-medium text-tertiary uppercase">{label}</p>
      <p className="mt-0.5 text-16 font-medium text-primary">{value}</p>
    </div>
  );
}
