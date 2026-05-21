/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { CORE_EXTENSIONS } from "@plane/editor";
import type { TTranscriptToDocResponse } from "@/services/ai.service";

type PMNode = { type: string; attrs?: Record<string, unknown>; content?: PMNode[]; text?: string };

const text = (value: string): PMNode => ({ type: "text", text: value });

const paragraph = (value: string): PMNode => {
  if (!value) return { type: "paragraph" };
  return { type: "paragraph", content: [text(value)] };
};

const bulletListFromLines = (lines: string[]): PMNode | null => {
  const items = lines.map((line) => line.replace(/^[-*]\s+/, "").trim()).filter((line) => line.length > 0);
  if (items.length === 0) return null;
  return {
    type: "bulletList",
    content: items.map((item) => ({
      type: "listItem",
      content: [paragraph(item)],
    })),
  };
};

const sectionToBodyNodes = (bodyMarkdown: string): PMNode[] => {
  const trimmed = bodyMarkdown.trim();
  if (!trimmed) return [];

  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const looksLikeList = lines.every((l) => /^[-*]\s+/.test(l));

  if (looksLikeList) {
    const list = bulletListFromLines(lines);
    return list ? [list] : [];
  }

  return lines.map(paragraph);
};

export function transcriptResponseToProseMirror(
  response: TTranscriptToDocResponse,
  options: { workspaceSlug: string; projectId: string }
): PMNode {
  const { workspaceSlug, projectId } = options;
  const content: PMNode[] = [];

  for (const section of response.sections) {
    if (!section.heading) continue;
    content.push({
      type: "heading",
      attrs: { level: 2 },
      content: [text(section.heading)],
    });
    content.push(...sectionToBodyNodes(section.body_markdown));
  }

  if (response.action_items.length > 0) {
    content.push({
      type: "heading",
      attrs: { level: 2 },
      content: [text("Action items")],
    });
    for (const item of response.action_items) {
      content.push({
        type: CORE_EXTENSIONS.WORK_ITEM_EMBED,
        attrs: {
          draft: true,
          draft_title: item.title,
          draft_description: item.description,
          project_identifier: projectId,
          workspace_identifier: workspaceSlug,
          entity_name: "work_item",
        },
      });
    }
  }

  return { type: "doc", content };
}
