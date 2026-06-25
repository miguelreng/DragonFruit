/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssue, TIssueSearchResponse, TPageSearchResponse, TProjectBookmark } from "@plane/types";

const CONTEXT_LIMIT = 12_000;
const CONTEXT_PER_REFERENCE_LIMIT = 2_500;
const MAX_CONTEXT_REFERENCES = 8;
const TRAILING_TOKEN_PUNCTUATION = /[.,;:!?)]$/g;

export type TAtlasReferenceType = "bookmark" | "doc" | "task" | "whiteboard";

export type TAtlasMentionedReference = {
  id: string;
  insertText: string;
  projectId?: string;
  subtitle?: string;
  title: string;
  type: TAtlasReferenceType;
  url?: string;
  workspaceSlug?: string;
};

export type TAtlasMentionMatch = {
  from: number;
  query: string;
  to: number;
};

export type TAtlasReferenceContextSource = TAtlasMentionedReference & {
  content: string;
  details?: string[];
};

export type TAtlasPromptHighlightPart = {
  isMention: boolean;
  key: string;
  text: string;
};

export function extractAtlasMentionTokens(value: string) {
  const tokens = new Set<string>();
  const mentionPattern = /(^|\s)@([^\s@]+)/g;
  let match: RegExpExecArray | null;

  while ((match = mentionPattern.exec(value))) {
    const token = (match[2] ?? "").replace(TRAILING_TOKEN_PUNCTUATION, "");
    if (token) tokens.add(`@${token}`);
  }

  return [...tokens];
}

export function getAtlasPromptHighlightParts(value: string) {
  const parts: TAtlasPromptHighlightPart[] = [];
  const mentionPattern = /(^|\s)(@[^\s@]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mentionPattern.exec(value))) {
    const mention = match[2] ?? "";
    const mentionStart = match.index + (match[1]?.length ?? 0);
    const cleanMention = mention.replace(TRAILING_TOKEN_PUNCTUATION, "");
    const trailingText = mention.slice(cleanMention.length);

    if (mentionStart > lastIndex) {
      parts.push({
        isMention: false,
        key: `text-${lastIndex}-${mentionStart}`,
        text: value.slice(lastIndex, mentionStart),
      });
    }
    if (cleanMention) {
      parts.push({
        isMention: true,
        key: `mention-${mentionStart}-${mentionStart + cleanMention.length}`,
        text: cleanMention,
      });
    }
    if (trailingText) {
      parts.push({
        isMention: false,
        key: `text-${mentionStart + cleanMention.length}-${mentionStart + mention.length}`,
        text: trailingText,
      });
    }

    lastIndex = mentionStart + mention.length;
  }

  if (lastIndex < value.length) {
    parts.push({ isMention: false, key: `text-${lastIndex}-${value.length}`, text: value.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ isMention: false, key: "text-empty", text: value }];
}

export function getAtlasMentionMatch(value: string, cursorPosition: number | null | undefined) {
  const cursor = cursorPosition ?? value.length;
  const beforeCursor = value.slice(0, cursor);
  const match = /(^|\s)@([^\s@]*)$/.exec(beforeCursor);

  if (!match) return null;

  const query = match[2] ?? "";
  return {
    from: cursor - query.length - 1,
    query,
    to: cursor,
  } satisfies TAtlasMentionMatch;
}

export function getAtlasMentionToken(title: string, fallback: TAtlasReferenceType) {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return `@${slug || fallback}`;
}

export function getAtlasReferenceTypeLabel(type: TAtlasReferenceType) {
  switch (type) {
    case "bookmark":
      return "Bookmark";
    case "task":
      return "Task";
    case "whiteboard":
      return "Whiteboard";
    case "doc":
    default:
      return "Doc";
  }
}

export function pageSearchResponseToMentionedReference(page: TPageSearchResponse): TAtlasMentionedReference | null {
  if (!page.id) return null;
  if (page.page_type === "pdf") return null;

  const type: TAtlasReferenceType = page.page_type === "whiteboard" ? "whiteboard" : "doc";
  const title = page.name?.trim() || `Untitled ${getAtlasReferenceTypeLabel(type).toLowerCase()}`;
  const rawProjectId = page.projects__id;
  const projectId = Array.isArray(rawProjectId) ? rawProjectId[0] : rawProjectId;

  return {
    id: page.id,
    insertText: getAtlasMentionToken(title, type),
    projectId,
    subtitle: getAtlasReferenceTypeLabel(type),
    title,
    type,
    workspaceSlug: page.workspace__slug,
  };
}

export function issueSearchResponseToMentionedReference(issue: TIssueSearchResponse): TAtlasMentionedReference | null {
  if (!issue.id) return null;

  const identifier = [issue.project__identifier, issue.sequence_id].filter(Boolean).join("-");
  const title = issue.name?.trim() || identifier || "Untitled task";

  return {
    id: issue.id,
    // Mention by task name (not the PROJ-123 code) so the inserted token reads
    // as the task's name.
    insertText: getAtlasMentionToken(title, "task"),
    projectId: issue.project_id || undefined,
    title,
    type: "task",
  };
}

export function bookmarkToMentionedReference(bookmark: TProjectBookmark): TAtlasMentionedReference | null {
  if (!bookmark.id) return null;

  const title = bookmark.title?.trim() || bookmark.url?.trim() || "Untitled bookmark";

  return {
    id: bookmark.id,
    insertText: getAtlasMentionToken(title, "bookmark"),
    projectId: bookmark.project_id,
    subtitle: bookmark.url ? "Bookmark URL" : "Bookmark",
    title,
    type: "bookmark",
    url: bookmark.url || undefined,
    workspaceSlug: bookmark.workspace_slug,
  };
}

export function htmlToPlainText(html: string | undefined) {
  if (!html) return "";

  if (typeof window !== "undefined" && "DOMParser" in window) {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    return normalizeWhitespace(parsed.body.textContent ?? "");
  }

  return normalizeWhitespace(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
}

export function whiteboardJsonToPlainText(descriptionJson: unknown) {
  if (!isRecord(descriptionJson)) return "";
  const snapshot = descriptionJson.excalidraw_snapshot;
  if (!isRecord(snapshot)) return "";

  const elements = Array.isArray(snapshot.elements) ? snapshot.elements : [];
  const textParts = elements
    .map((element) => {
      if (!isRecord(element)) return "";
      const text = typeof element.text === "string" ? element.text : "";
      const originalText = typeof element.originalText === "string" ? element.originalText : "";
      const type = typeof element.type === "string" ? element.type : "";
      return text || originalText || type;
    })
    .filter(Boolean);

  if (textParts.length > 0) return normalizeWhitespace(textParts.join("\n"));
  return elements.length > 0 ? `${elements.length} whiteboard elements with no text labels.` : "";
}

export function issueToReferenceContextContent(issue: TIssue) {
  return htmlToPlainText(issue.description_html);
}

export function bookmarkToReferenceContextContent(bookmark: TProjectBookmark) {
  const metadata = bookmark.metadata ?? {};
  const capturedText = typeof metadata.captured_text === "string" ? metadata.captured_text : "";
  const siteName = typeof metadata.site_name === "string" ? metadata.site_name : "";
  const metadataDescription = typeof metadata.og_description === "string" ? metadata.og_description : "";

  return normalizeWhitespace(
    [bookmark.description, metadataDescription, capturedText, siteName ? `Source site: ${siteName}` : ""]
      .filter(Boolean)
      .join("\n\n")
  );
}

export function buildAtlasReferencesContext(references: TAtlasReferenceContextSource[]) {
  const uniqueReferences = uniqueByReference(references).slice(0, MAX_CONTEXT_REFERENCES);
  if (uniqueReferences.length === 0) return "";

  const parts = [
    "Referenced entities selected in the Atlas Bar. Resolve @mentions in the user request against these entities.",
  ];

  for (const [index, reference] of uniqueReferences.entries()) {
    const excerpt = reference.content.trim().slice(0, CONTEXT_PER_REFERENCE_LIMIT);
    const details = reference.details?.filter(Boolean) ?? [];
    parts.push(
      [
        `Reference ${index + 1}: ${getAtlasReferenceTypeLabel(reference.type)} - ${reference.title}`,
        `Mention: ${reference.insertText}`,
        `ID: ${reference.id}`,
        reference.projectId ? `Project ID: ${reference.projectId}` : "",
        reference.url ? `URL: ${reference.url}` : "",
        ...details.map((detail) => `Detail: ${detail}`),
        excerpt ? `Content excerpt:\n${excerpt}` : "Content excerpt: No text content was available.",
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  return parts.join("\n\n").slice(0, CONTEXT_LIMIT);
}

export function referenceIdentity(reference: Pick<TAtlasMentionedReference, "id" | "type">) {
  return `${reference.type}:${reference.id}`;
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function uniqueByReference<T extends Pick<TAtlasMentionedReference, "id" | "type">>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = referenceIdentity(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
