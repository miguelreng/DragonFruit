/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Editor } from "@tiptap/core";
import { fetchWikipediaSummary } from "./wikipedia-client";

/**
 * Citation health check: collects every Wikipedia link in the doc (link marks
 * and wiki mention chips), re-fetches each article summary, and reports the
 * ones that no longer resolve. The host app surfaces the result — the editor
 * dispatches `dragonfruit:citation-check-result` on its DOM.
 */

export type TCitationCheckResult = {
  total: number;
  broken: { title: string; url: string }[];
};

function wikipediaTitleFromUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (!/(^|\.)wikipedia\.org$/.test(url.hostname)) return null;
    const match = url.pathname.match(/^\/wiki\/(.+)$/);
    if (!match) return null;
    return decodeURIComponent(match[1]).replace(/_/g, " ").trim() || null;
  } catch {
    return null;
  }
}

export async function checkWikipediaCitations(editor: Editor): Promise<TCitationCheckResult> {
  const urls = new Map<string, string>(); // url -> title

  editor.state.doc.descendants((node) => {
    // wiki mention chips carry the article URL in entity_identifier
    if (node.type.name === "mention" && node.attrs.entity_name === "wiki" && node.attrs.entity_identifier) {
      const title = wikipediaTitleFromUrl(node.attrs.entity_identifier);
      if (title) urls.set(node.attrs.entity_identifier, title);
    }
    // plain links to wikipedia (inserted by /wiki and /cite)
    node.marks.forEach((mark) => {
      if (mark.type.name !== "link" || !mark.attrs.href) return;
      const title = wikipediaTitleFromUrl(mark.attrs.href);
      if (title) urls.set(mark.attrs.href, title);
    });
    return undefined;
  });

  const checks = await Promise.all(
    [...urls.entries()].map(async ([url, title]) => ((await fetchWikipediaSummary(title)) ? null : { title, url }))
  );
  const broken = checks.filter((entry): entry is { title: string; url: string } => entry !== null);

  const result: TCitationCheckResult = { total: urls.size, broken };
  editor.view.dom.dispatchEvent(
    new CustomEvent("dragonfruit:citation-check-result", { bubbles: true, detail: result })
  );
  return result;
}
