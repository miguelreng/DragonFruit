/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type ParsedCsv = {
  headers: string[];
  rows: string[][];
};

// Minimal RFC-4180-ish CSV parser. Handles quoted fields, embedded commas,
// escaped quotes ("") and \r\n / \n line endings. Good enough for issue-import
// spreadsheets; we don't ship a heavier parser dep just for this surface.
export function parseCsv(input: string): ParsedCsv {
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
    if (c === ",") {
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

export type CsvFieldKey = "name" | "description" | "priority";

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
  };
}

const PRIORITY_VALUES = new Set(["urgent", "high", "medium", "low", "none"]);
export function normalizePriority(value: string | undefined): "urgent" | "high" | "medium" | "low" | "none" {
  if (!value) return "none";
  const v = value.toLowerCase().trim();
  return (PRIORITY_VALUES.has(v) ? v : "none") as "urgent" | "high" | "medium" | "low" | "none";
}
