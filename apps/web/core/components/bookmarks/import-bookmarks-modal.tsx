/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef, useState } from "react";
import { CancelCircle, Csv, UploadCloud } from "@/components/icons/lucide-shim";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TProjectBookmarkBulkImportResult, TProjectBookmarkCreatePayload } from "@plane/types";
import { EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { type CsvImportResult, mapCsvToBookmarks, parseCsv } from "./csv";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  projectOptions: { id: string; name: string }[];
  defaultProjectId: string;
  showProjectSelect: boolean;
  onImport: (projectId: string, payloads: TProjectBookmarkCreatePayload[]) => Promise<TProjectBookmarkBulkImportResult>;
};

const PREVIEW_COUNT = 5;

const domainOf = (url: string) => {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

export function ImportBookmarksModal(props: Props) {
  const { isOpen, onClose, projectOptions, defaultProjectId, showProjectSelect, onImport } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedProjectId, setSelectedProjectId] = useState(defaultProjectId);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const reset = () => {
    setFileName("");
    setResult(null);
    setParseError(null);
    setIsDragging(false);
    setIsImporting(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setParseError(null);
    setResult(null);
    try {
      const text = await file.text();
      const mapped = mapCsvToBookmarks(parseCsv(text));
      if (mapped.imported === 0) {
        setParseError("Couldn't find any bookmarks. Make sure the file has a header row with a “url” column.");
        return;
      }
      setResult(mapped);
    } catch {
      setParseError("That file couldn't be read. Please upload a valid .csv file.");
    }
  };

  const handleImport = async () => {
    if (!result || result.imported === 0) return;
    const targetProjectId = showProjectSelect ? selectedProjectId : defaultProjectId;
    if (!targetProjectId) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Select a project to import into" });
      return;
    }
    setIsImporting(true);
    try {
      const summary = await onImport(targetProjectId, result.payloads);
      const skipped = (summary.skipped_count ?? 0) + result.skipped;
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: `Imported ${summary.created_count} bookmark${summary.created_count === 1 ? "" : "s"}`,
        message: skipped > 0 ? `${skipped} row${skipped === 1 ? "" : "s"} skipped` : undefined,
      });
      handleClose();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Bookmarks could not be imported" });
      setIsImporting(false);
    }
  };

  const preview = result?.payloads.slice(0, PREVIEW_COUNT) ?? [];
  const remaining = (result?.imported ?? 0) - preview.length;

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} width={EModalWidth.XXXL}>
      <div className="flex flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-subtle px-5 py-4">
          <div>
            <h2 className="text-16 font-semibold text-primary">Import bookmarks</h2>
            <p className="mt-1 text-12 text-tertiary">
              Upload a CSV with a <code className="text-[10px]">url</code> column. Title, description, and tags are
              imported when present.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="grid size-7 shrink-0 place-items-center rounded-lg text-icon-tertiary hover:bg-layer-transparent-hover hover:text-primary"
            aria-label="Close import modal"
          >
            <CancelCircle className="size-4" color="currentColor" size="1em" />
          </button>
        </div>
        <div className="flex flex-col gap-3 px-5 py-4">
          {showProjectSelect && (
            <label className="block">
              <span className="mb-1.5 block text-11 font-medium text-secondary">Project</span>
              <select
                className="focus:border-accent-primary h-10 w-full rounded-lg border border-subtle bg-surface-1 px-3 text-13 text-primary outline-none"
                value={selectedProjectId}
                onChange={(event) => setSelectedProjectId(event.target.value)}
              >
                {projectOptions.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              void handleFile(event.dataTransfer.files?.[0]);
            }}
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-subtle bg-surface-1 px-4 py-8 text-center transition-colors hover:border-strong",
              { "border-accent-primary bg-accent-primary/5": isDragging }
            )}
          >
            <span className="grid size-9 place-items-center rounded-lg bg-layer-1 text-tertiary">
              {fileName ? (
                <Csv className="size-4" color="currentColor" size="1em" />
              ) : (
                <UploadCloud className="size-4" color="currentColor" size="1em" />
              )}
            </span>
            <span className="text-13 font-medium text-primary">{fileName || "Choose a CSV file or drag it here"}</span>
            <span className="text-11 text-tertiary">
              {fileName ? "Click to choose a different file" : "Supports Raindrop, Pocket, and generic CSV exports"}
            </span>
          </button>

          {parseError && <p className="text-red-500 text-12">{parseError}</p>}

          {result && (
            <div className="rounded-xl border border-subtle bg-surface-1 p-3">
              <div className="flex items-center justify-between gap-2 text-12">
                <span className="font-medium text-primary">
                  {result.imported} bookmark{result.imported === 1 ? "" : "s"} ready to import
                </span>
                {result.skipped > 0 && (
                  <span className="text-tertiary">
                    {result.skipped} row{result.skipped === 1 ? "" : "s"} without a URL skipped
                  </span>
                )}
              </div>
              <ul className="mt-2 flex flex-col gap-1">
                {preview.map((payload) => (
                  <li key={payload.url ?? payload.title} className="flex items-center gap-2 truncate text-12">
                    <span className="truncate font-medium text-secondary">{payload.title}</span>
                    <span className="shrink-0 text-tertiary">{domainOf(payload.url ?? "")}</span>
                  </li>
                ))}
                {remaining > 0 && <li className="text-11 text-tertiary">+{remaining} more</li>}
              </ul>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-subtle px-5 py-4">
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex h-8 items-center gap-1 rounded-lg px-3 text-13 font-medium text-secondary hover:bg-layer-transparent-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleImport()}
            disabled={!result || result.imported === 0 || isImporting}
            className="inline-flex h-8 items-center gap-1 rounded-lg bg-accent-primary px-3 text-13 font-medium text-on-color hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <UploadCloud className="size-3.5" color="currentColor" size="1em" />
            {isImporting
              ? "Importing…"
              : result
                ? `Import ${result.imported} bookmark${result.imported === 1 ? "" : "s"}`
                : "Import"}
          </button>
        </div>
      </div>
    </ModalCore>
  );
}
