/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TProjectBookmarkCreatePayload } from "@plane/types";

/**
 * Parse CSV text into rows of string cells. Handles quoted fields, escaped
 * quotes (""), and commas / newlines inside quotes. Fully-empty rows are dropped.
 */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

const HEADER_ALIASES: Record<keyof MappedColumns, string[]> = {
  url: ["url", "link", "href", "uri", "address", "location"],
  title: ["title", "name"],
  description: ["description", "note", "notes", "excerpt", "comment", "comments"],
  tags: ["tags", "tag", "labels", "label", "keywords"],
  folder: ["folder", "folders", "collection", "category", "path"],
};

type MappedColumns = {
  url: number;
  title: number;
  description: number;
  tags: number;
  folder: number;
};

export type CsvImportResult = {
  payloads: TProjectBookmarkCreatePayload[];
  /** number of data rows considered (excluding the header row) */
  total: number;
  /** rows that produced a bookmark */
  imported: number;
  /** rows dropped because they had no URL */
  skipped: number;
};

const URL_LIKE = /^(https?:\/\/|www\.)|\.[a-z]{2,}(\/|$)/i;

const domainFromUrl = (url: string) => {
  if (!url) return "";
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0];
  }
};

const splitTags = (value: string) =>
  value
    .split(/[,|;]/)
    .map((tag) => tag.trim())
    .filter(Boolean);

const cellAt = (cells: string[], index: number) => (index >= 0 ? (cells[index] ?? "").trim() : "");

const detectColumns = (header: string[]): MappedColumns | null => {
  const normalized = header.map((cell) => cell.trim().toLowerCase());
  const find = (aliases: string[]) => normalized.findIndex((cell) => aliases.includes(cell));
  const columns: MappedColumns = {
    url: find(HEADER_ALIASES.url),
    title: find(HEADER_ALIASES.title),
    description: find(HEADER_ALIASES.description),
    tags: find(HEADER_ALIASES.tags),
    folder: find(HEADER_ALIASES.folder),
  };
  // a usable header must at least identify the URL or the title column
  return columns.url >= 0 || columns.title >= 0 ? columns : null;
};

/** Infer columns by content when the file has no recognizable header row. */
const inferColumns = (firstRow: string[]): MappedColumns | null => {
  const urlIndex = firstRow.findIndex((cell) => URL_LIKE.test(cell.trim()));
  if (urlIndex < 0) return null;
  const titleIndex = firstRow.findIndex((cell, index) => index !== urlIndex && cell.trim() !== "");
  return { url: urlIndex, title: titleIndex, description: -1, tags: -1, folder: -1 };
};

/**
 * Map parsed CSV rows to bookmark create payloads. Recognizes common bookmark
 * exports (Raindrop, Pocket, browser-converted CSVs) by header, and falls back
 * to inferring columns by content when no header is present.
 */
export function mapCsvToBookmarks(rows: string[][]): CsvImportResult {
  const empty: CsvImportResult = { payloads: [], total: 0, imported: 0, skipped: 0 };
  if (rows.length === 0) return empty;

  let columns = detectColumns(rows[0]);
  let dataRows: string[][];
  if (columns) {
    dataRows = rows.slice(1);
  } else {
    columns = inferColumns(rows[0]);
    if (!columns) return empty;
    dataRows = rows;
  }

  const payloads: TProjectBookmarkCreatePayload[] = [];
  let skipped = 0;

  for (const cells of dataRows) {
    const url = cellAt(cells, columns.url);
    if (!url) {
      skipped++;
      continue;
    }
    const tags = columns.tags >= 0 ? splitTags(cellAt(cells, columns.tags)) : [];
    const folder = cellAt(cells, columns.folder);
    if (folder && !tags.includes(folder)) tags.push(folder);
    const rawTitle = cellAt(cells, columns.title);
    payloads.push({
      title: rawTitle || domainFromUrl(url) || url,
      url,
      description: cellAt(cells, columns.description),
      tags,
      metadata: { source_app: "csv_import" },
    });
  }

  return { payloads, total: dataRows.length, imported: payloads.length, skipped };
}
