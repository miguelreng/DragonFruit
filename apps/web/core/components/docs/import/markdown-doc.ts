/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import MarkdownIt from "markdown-it";

// Guards against accidentally importing something huge (a 2 MB markdown file
// is ~500k words); description_html is a plain text column but the editor has
// to hold the whole document in memory.
export const MAX_MARKDOWN_SIZE_BYTES = 2 * 1024 * 1024;

// html:false (the default) escapes any raw HTML embedded in the markdown, so
// the produced description_html is safe to seed straight into the editor.
const markdownRenderer = new MarkdownIt({ linkify: true });

export const isMarkdownFile = (file: File) =>
  ["text/markdown", "text/x-markdown", "application/x-markdown"].includes(file.type) ||
  /\.(md|markdown)$/i.test(file.name);

export const getMarkdownTitleAndBody = (fileName: string, text: string) => {
  // A document that opens with a single top-level heading reads as its title;
  // promote it to the page name rather than repeating it in the body.
  let name = fileName.replace(/\.(md|markdown)$/i, "").trim() || "Untitled";
  let body = text;
  const lines = text.split(/\r?\n/);
  const firstContentIndex = lines.findIndex((line) => line.trim().length > 0);
  const headingMatch = firstContentIndex >= 0 ? lines[firstContentIndex].trim().match(/^#\s+(.+?)\s*#*\s*$/) : null;
  if (headingMatch) {
    name = headingMatch[1].trim();
    body = lines.slice(firstContentIndex + 1).join("\n");
  }
  return { name, body };
};

export const renderMarkdownToHtml = (markdown: string) => markdownRenderer.render(markdown).trim() || "<p></p>";

export const getImportErrorMessage = (err: unknown, fallback: string): string => {
  if (typeof err === "string" && err.trim()) return err.trim();
  if (err && typeof err === "object") {
    const data = err as { error?: unknown; detail?: unknown; message?: unknown };
    const detail = data.error ?? data.detail ?? data.message;
    if (typeof detail === "string" && detail.trim()) return detail.trim();
  }
  return fallback;
};
