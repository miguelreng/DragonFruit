/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssuePriorities } from "@plane/types";

// --- Inline natural-language parsing (Todoist/Things-style) -----------------
// `#label` → labels, `@date` → due date, `!priority` → priority, `/project` → project.
// Shared by the quick-add composer and the inline task editor.

export const LABEL_COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6"];
export const randomLabelColor = () => LABEL_COLORS[Math.floor(Math.random() * LABEL_COLORS.length)];

export const PRIORITY_TOKENS: Record<string, TIssuePriorities> = {
  urgent: "urgent",
  u: "urgent",
  p1: "urgent",
  high: "high",
  h: "high",
  p2: "high",
  medium: "medium",
  med: "medium",
  m: "medium",
  p3: "medium",
  low: "low",
  l: "low",
  p4: "low",
};

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

/** Resolve an `@date` token (today/tomorrow/eod/eow/weekday/`3d`/`2w`/ISO/`M/D`) to a Date. */
export function parseDueToken(token: string): Date | undefined {
  const t = token.toLowerCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const addDays = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d;
  };
  if (t === "today" || t === "tod" || t === "eod") return today;
  if (t === "tomorrow" || t === "tom" || t === "tmr") return addDays(1);
  // End of week → this week's upcoming Friday (or today if it's Friday).
  if (t === "eow") return addDays((5 - today.getDay() + 7) % 7);
  if (t in WEEKDAYS) return addDays((WEEKDAYS[t] - today.getDay() + 7) % 7 || 7);
  const rel = /^(\d+)([dw])$/.exec(t);
  if (rel) return addDays(rel[2] === "w" ? parseInt(rel[1], 10) * 7 : parseInt(rel[1], 10));
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  const md = /^(\d{1,2})\/(\d{1,2})$/.exec(t);
  if (md) {
    const month = Number(md[1]) - 1;
    const day = Number(md[2]);
    let d = new Date(today.getFullYear(), month, day);
    if (Number.isNaN(d.getTime())) return undefined;
    if (d < today) d = new Date(today.getFullYear() + 1, month, day);
    return d;
  }
  return undefined;
}

export type ParsedQuickInput = {
  name: string;
  labelNames: string[];
  projectName?: string;
  priority?: TIssuePriorities;
  dueDate?: Date;
};

export const normalizeProjectToken = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Strip recognized `#`/`@`/`!`/`/` tokens out of the title and return the rest. */
export function parseQuickInput(raw: string): ParsedQuickInput {
  const labelNames: string[] = [];
  let projectName: string | undefined;
  let priority: TIssuePriorities | undefined;
  let dueDate: Date | undefined;
  const kept: string[] = [];
  const parts = raw.split(/\s+/);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (/^#[A-Za-z][\w-]*$/.test(part)) {
      labelNames.push(part.slice(1));
      continue;
    }
    if (part.length > 1 && part.startsWith("@")) {
      const head = part.slice(1).toLowerCase();
      // Multi-word: "@next monday" / "@this fri" consumes the following token.
      if ((head === "next" || head === "this") && i + 1 < parts.length) {
        const parsed = parseDueToken(parts[i + 1]);
        if (parsed) {
          dueDate = parsed;
          i += 1;
          continue;
        }
      }
      const parsed = parseDueToken(head);
      if (parsed) {
        dueDate = parsed;
        continue;
      }
    }
    if (part.startsWith("!")) {
      // Bare bangs: "!" → high, "!!"+ → urgent. Or "!high" / "!p2" keywords.
      if (/^!+$/.test(part)) {
        priority = part.length >= 2 ? "urgent" : "high";
        continue;
      }
      const parsed = PRIORITY_TOKENS[part.slice(1).toLowerCase()];
      if (parsed) {
        priority = parsed;
        continue;
      }
    }
    if (/^\/[A-Za-z][\w-]*$/.test(part)) {
      projectName = part.slice(1);
      continue;
    }
    kept.push(part);
  }
  return { name: kept.join(" ").replace(/\s+/g, " ").trim(), labelNames, projectName, priority, dueDate };
}

/** Per-priority text color, shared by the input highlighter and the saved-task chips. */
export const PRIORITY_TEXT_CLASS: Record<TIssuePriorities, string> = {
  urgent: "text-red-600",
  high: "text-orange-600",
  medium: "text-amber-600",
  low: "text-blue-500",
  none: "text-primary",
};

export type HighlightSegment = {
  text: string;
  kind: "text" | "project" | "label" | "date" | "priority";
  priority?: TIssuePriorities;
};

/**
 * Split raw quick-add text into segments so the composer can color the recognized tokens
 * (`/project`, `#label`, `@date`, `!priority`) inline while keeping the original spacing.
 */
export function highlightTaskTokens(value: string): HighlightSegment[] {
  if (!value) return [];
  const segments: HighlightSegment[] = [];
  for (const part of value.split(/(\s+)/)) {
    if (part === "") continue;
    if (/^\s+$/.test(part)) {
      segments.push({ text: part, kind: "text" });
      continue;
    }
    if (/^#[A-Za-z][\w-]*$/.test(part)) {
      segments.push({ text: part, kind: "label" });
      continue;
    }
    if (part.length > 1 && part.startsWith("@")) {
      const head = part.slice(1).toLowerCase();
      if (head === "next" || head === "this" || parseDueToken(head)) {
        segments.push({ text: part, kind: "date" });
        continue;
      }
    }
    if (part.startsWith("!")) {
      if (/^!+$/.test(part)) {
        segments.push({ text: part, kind: "priority", priority: part.length >= 2 ? "urgent" : "high" });
        continue;
      }
      const parsed = PRIORITY_TOKENS[part.slice(1).toLowerCase()];
      if (parsed) {
        segments.push({ text: part, kind: "priority", priority: parsed });
        continue;
      }
    }
    if (/^\/[A-Za-z][\w-]*$/.test(part)) {
      segments.push({ text: part, kind: "project" });
      continue;
    }
    segments.push({ text: part, kind: "text" });
  }
  return segments;
}

export type TokenSigil = "/" | "#" | "!";

export type ActiveToken = {
  sigil: TokenSigil;
  query: string;
  /** Index in the raw value where the token (including sigil) starts. */
  start: number;
  /** Index where the token ends (exclusive). */
  end: number;
};

/**
 * Find the `/`, `#`, or `!` token the caret currently sits in, so the composer can offer
 * suggestions for it. Returns null when the caret isn't inside such a token.
 */
export function getActiveToken(value: string, caret: number): ActiveToken | null {
  let start = caret;
  while (start > 0 && !/\s/.test(value[start - 1])) start--;
  let end = caret;
  while (end < value.length && !/\s/.test(value[end])) end++;
  const word = value.slice(start, end);
  const sigil = word[0];
  if (sigil === "/" || sigil === "#" || sigil === "!") {
    return { sigil, query: word.slice(1), start, end };
  }
  return null;
}
