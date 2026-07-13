/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { sortBy } from "lodash-es";
import { getMarkdownTitleAndBody, isMarkdownFile, MAX_MARKDOWN_SIZE_BYTES, renderMarkdownToHtml } from "./markdown-doc";

export type TWikiImportFileDraft = {
  file: File;
  relativePath: string;
  pageName: string;
  descriptionHtml: string;
};

export type TWikiImportSkippedFile = {
  name: string;
  relativePath: string;
  reason: string;
};

export type TWikiImportDraft = {
  collectionName: string;
  files: TWikiImportFileDraft[];
  skipped: TWikiImportSkippedFile[];
  warnings: string[];
};

type PlannedWikiEntry = {
  draft?: TWikiImportFileDraft;
  skipped?: TWikiImportSkippedFile;
  warning?: string;
};

const getRelativePath = (file: File) =>
  (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;

const fileBaseName = (path: string) => {
  const fileName = path.split("/").pop() || path;
  return fileName.replace(/\.(md|markdown)$/i, "").trim() || "Untitled";
};

const parentFolderName = (path: string) => {
  const parts = path.split("/").filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 2] : undefined;
};

const inferCollectionName = (paths: string[]) => {
  const segmented = paths.map((path) => path.split("/").filter(Boolean));
  const firstWithFolder = segmented.find((parts) => parts.length > 1);
  const candidate = firstWithFolder?.[0]?.trim();
  return candidate || "Imported wiki";
};

const resolveDuplicateNames = (files: TWikiImportFileDraft[]) => {
  const nameCounts = new Map<string, number>();
  const usedNames = new Set<string>();

  return files.map((file) => {
    const baseName = file.pageName || fileBaseName(file.relativePath);
    const previousCount = nameCounts.get(baseName) ?? 0;
    nameCounts.set(baseName, previousCount + 1);

    if (previousCount === 0 && !usedNames.has(baseName)) {
      usedNames.add(baseName);
      return file;
    }

    const folder = parentFolderName(file.relativePath);
    const folderCandidate = folder ? `${baseName} (${folder})` : undefined;
    if (folderCandidate && !usedNames.has(folderCandidate)) {
      usedNames.add(folderCandidate);
      return { ...file, pageName: folderCandidate };
    }

    let suffix = previousCount + 1;
    let candidate = `${baseName} ${suffix}`;
    while (usedNames.has(candidate)) {
      suffix += 1;
      candidate = `${baseName} ${suffix}`;
    }
    usedNames.add(candidate);
    return { ...file, pageName: candidate };
  });
};

export const planWikiImport = async (files: File[]): Promise<TWikiImportDraft> => {
  const fileEntries = sortBy(
    files.map((file) => ({ file, relativePath: getRelativePath(file) })),
    "relativePath"
  );

  const warnings = new Set<string>();
  const skipped: TWikiImportSkippedFile[] = [];
  const importable: TWikiImportFileDraft[] = [];

  const plannedEntries = await Promise.all(
    fileEntries.map(async ({ file, relativePath }): Promise<PlannedWikiEntry> => {
      if (!isMarkdownFile(file)) {
        return {
          skipped: { name: file.name, relativePath, reason: "Not a Markdown file" },
        };
      }
      if (file.size > MAX_MARKDOWN_SIZE_BYTES) {
        return {
          skipped: { name: file.name, relativePath, reason: "Larger than 2 MB" },
        };
      }

      const parts = relativePath.split("/").filter(Boolean);
      const text = await file.text();
      const { name, body } = getMarkdownTitleAndBody(file.name, text);
      return {
        draft: {
          file,
          relativePath,
          pageName: name || fileBaseName(relativePath),
          descriptionHtml: renderMarkdownToHtml(body),
        },
        warning: parts.length > 2 ? "Nested source folders are flattened in this version." : undefined,
      };
    })
  );

  plannedEntries.forEach((entry) => {
    if (entry.skipped) skipped.push(entry.skipped);
    if (entry.draft) importable.push(entry.draft);
    if (entry.warning) warnings.add(entry.warning);
  });

  return {
    collectionName: inferCollectionName(fileEntries.map((entry) => entry.relativePath)),
    files: resolveDuplicateNames(importable),
    skipped,
    warnings: Array.from(warnings),
  };
};
