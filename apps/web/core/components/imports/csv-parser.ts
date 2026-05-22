/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import pako from "pako";

export type ParsedCsv = {
  headers: string[];
  rows: string[][];
};

const DELIMITERS = [",", ";", "\t"] as const;

function scoreDelimiter(line: string, delimiter: string) {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (line[i + 1] === '"') i++;
      else inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && c === delimiter) count++;
  }
  return count;
}

export function detectDelimiter(input: string): "," | ";" | "\t" {
  const text = input.replace(/^﻿/, "");
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 20);
  if (lines.length === 0) return ",";
  const scores = DELIMITERS.map((delimiter) => {
    const avg = lines.reduce((sum, line) => sum + scoreDelimiter(line, delimiter), 0) / lines.length;
    return { delimiter, avg };
  }).sort((a, b) => b.avg - a.avg);
  return scores[0]?.delimiter ?? ",";
}

// Minimal RFC-4180-ish CSV parser. Handles quoted fields, embedded commas,
// escaped quotes ("") and \r\n / \n line endings. Good enough for issue-import
// spreadsheets; we don't ship a heavier parser dep just for this surface.
export function parseCsv(input: string, delimiter: "," | ";" | "\t" = detectDelimiter(input)): ParsedCsv {
  const text = input.replace(/^﻿/, "");
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === delimiter) {
      record.push(field);
      field = "";
      continue;
    }
    if (c === "\r") continue;
    if (c === "\n") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
      continue;
    }
    field += c;
  }
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  const nonEmpty = records.filter((r) => r.length > 0 && r.some((cell) => cell !== ""));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };
  const [headers, ...rows] = nonEmpty;
  return { headers: headers.map((h) => h.trim()), rows };
}

const NAME_HINTS = ["name", "title", "issue", "task", "summary", "subject"];
const DESCRIPTION_HINTS = ["description", "body", "details", "notes"];
const PRIORITY_HINTS = ["priority", "urgency", "importance"];
const STATUS_HINTS = ["status", "stage", "column", "state"];
const DUE_DATE_HINTS = ["due date", "due", "deadline", "target date", "target_date"];
const LABELS_HINTS = ["labels", "tags", "tag"];
const ASSIGNEE_HINTS = ["assignee", "assignees", "owner", "assigned to"];

export type CsvFieldKey = "name" | "description" | "priority" | "status" | "due_date" | "labels" | "assignee";

export type CsvMapping = Record<CsvFieldKey, number | null>;

export function detectMapping(headers: string[]): CsvMapping {
  const lower = headers.map((h) => h.toLowerCase().trim());
  const find = (hints: string[]) => {
    const exact = lower.findIndex((h) => hints.includes(h));
    if (exact !== -1) return exact;
    const partial = lower.findIndex((h) => hints.some((hint) => h.includes(hint)));
    return partial === -1 ? null : partial;
  };
  return {
    name: find(NAME_HINTS),
    description: find(DESCRIPTION_HINTS),
    priority: find(PRIORITY_HINTS),
    status: find(STATUS_HINTS),
    due_date: find(DUE_DATE_HINTS),
    labels: find(LABELS_HINTS),
    assignee: find(ASSIGNEE_HINTS),
  };
}

export type TImportSource = "csv" | "notion" | "clickup";

export function detectSource(headers: string[]): TImportSource {
  const lower = headers.map((h) => h.toLowerCase().trim());
  const notionSignals = ["name", "tags", "status"];
  const clickupSignals = ["task name", "date created", "date closed", "assignees", "task id"];
  const notionHits = notionSignals.filter((signal) => lower.some((h) => h.includes(signal))).length;
  const clickupHits = clickupSignals.filter((signal) => lower.some((h) => h.includes(signal))).length;
  if (clickupHits >= 2 && clickupHits >= notionHits) return "clickup";
  if (notionHits >= 2) return "notion";
  return "csv";
}

const PRIORITY_VALUES = new Set(["urgent", "high", "medium", "low", "none"]);
export function normalizePriority(value: string | undefined): "urgent" | "high" | "medium" | "low" | "none" {
  if (!value) return "none";
  const v = value.toLowerCase().trim();
  return (PRIORITY_VALUES.has(v) ? v : "none") as "urgent" | "high" | "medium" | "low" | "none";
}

export function parseLabels(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[;,|]/g)
    .map((v) => v.trim())
    .filter(Boolean);
}

export function normalizeStatus(value: string | undefined): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  return raw.replace(/\s+/g, " ");
}

export function parseDueDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const raw = value.trim();
  if (!raw) return undefined;

  // ISO first
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // MM/DD/YYYY or M/D/YYYY
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const mm = slash[1].padStart(2, "0");
    const dd = slash[2].padStart(2, "0");
    return `${slash[3]}-${mm}-${dd}`;
  }

  // DD-MM-YYYY
  const dash = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dash) {
    const dd = dash[1].padStart(2, "0");
    const mm = dash[2].padStart(2, "0");
    return `${dash[3]}-${mm}-${dd}`;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
}

type TZipCsvEntry = {
  name: string;
  text: string;
};

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const minOffset = Math.max(0, bytes.length - 65557); // 22 + max comment
  for (let i = bytes.length - 22; i >= minOffset; i--) {
    const sig = bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24);
    if (sig === EOCD_SIGNATURE) return i;
  }
  return -1;
}

function decodeUtf8(bytes: Uint8Array) {
  return new TextDecoder("utf-8").decode(bytes);
}

function inflateZipData(compressed: Uint8Array, method: number): Uint8Array {
  if (method === 0) return compressed;
  if (method === 8) return pako.inflateRaw(compressed);
  throw new Error(`Unsupported ZIP compression method: ${method}`);
}

export async function extractCsvEntriesFromZip(file: File): Promise<TZipCsvEntry[]> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const eocdOffset = findEndOfCentralDirectory(bytes);
  if (eocdOffset === -1) throw new Error("Invalid ZIP file");

  const centralDirSize = view.getUint32(eocdOffset + 12, true);
  const centralDirOffset = view.getUint32(eocdOffset + 16, true);
  const entries: TZipCsvEntry[] = [];
  let ptr = centralDirOffset;
  const end = centralDirOffset + centralDirSize;

  while (ptr < end) {
    if (view.getUint32(ptr, true) !== CENTRAL_SIGNATURE) break;
    const compressionMethod = view.getUint16(ptr + 10, true);
    const compressedSize = view.getUint32(ptr + 20, true);
    const fileNameLength = view.getUint16(ptr + 28, true);
    const extraLength = view.getUint16(ptr + 30, true);
    const commentLength = view.getUint16(ptr + 32, true);
    const localHeaderOffset = view.getUint32(ptr + 42, true);

    const fileNameStart = ptr + 46;
    const fileNameEnd = fileNameStart + fileNameLength;
    const fileName = decodeUtf8(bytes.slice(fileNameStart, fileNameEnd));

    ptr = fileNameEnd + extraLength + commentLength;

    if (!fileName.toLowerCase().endsWith(".csv")) continue;
    if (view.getUint32(localHeaderOffset, true) !== LOCAL_SIGNATURE) continue;

    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    const compressed = bytes.slice(dataStart, dataEnd);
    const inflated = inflateZipData(compressed, compressionMethod);
    const text = decodeUtf8(inflated);
    entries.push({ name: fileName, text });
  }

  return entries;
}

export function pickBestCsvEntry(entries: TZipCsvEntry[]): TZipCsvEntry | null {
  if (entries.length === 0) return null;
  return [...entries].sort((a, b) => parseCsv(b.text).rows.length - parseCsv(a.text).rows.length)[0] ?? null;
}
