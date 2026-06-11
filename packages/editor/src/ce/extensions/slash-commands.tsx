/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Globe, Sparkles } from "@plane/icons";
// helpers
import { searchWikipedia, fetchWikipediaSummary } from "@/helpers/wikipedia-client";
// extensions
import type { TSlashCommandAdditionalOption } from "@/extensions";
// types
import type { IEditorProps } from "@/types";

type Props = Pick<IEditorProps, "disabledExtensions" | "flaggedExtensions">;

/**
 * DragonFruit: `/agent` slash command.
 *
 * The editor dispatches a `dragonfruit:agent-invoke` CustomEvent with
 * best-effort context about the current paragraph so the floating Ask AI bar
 * can pick it up and prefill its working context.
 */
export const coreEditorAdditionalSlashCommandOptions = (_props: Props): TSlashCommandAdditionalOption[] => [
  {
    commandKey: "agent",
    key: "agent",
    title: "Ask AI",
    description: "Open the writing AI bar with the current block as context.",
    searchTerms: ["ai", "agent", "assistant", "delegate", "draft"],
    icon: <Sparkles className="size-3.5" />,
    section: "general",
    pushAfter: "text",
    command: ({ editor, range }) => {
      // Pull the paragraph the slash was invoked from (best-effort).
      const $from = editor.state.doc.resolve(range.from);
      const blockNode = $from.node($from.depth);
      const paragraphText = blockNode?.textContent ?? "";
      const blockId = blockNode?.attrs?.id ?? null;
      const selectionText = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, " ");

      // Remove the `/agent` trigger so the slash doesn't linger in the doc.
      editor.chain().focus().deleteRange(range).run();

      if (typeof window === "undefined") return;
      window.dispatchEvent(
        new CustomEvent("dragonfruit:agent-invoke", {
          detail: { paragraphText, selectionText, blockId },
        })
      );
    },
  },
  {
    commandKey: "wiki",
    key: "wiki",
    title: "Wikipedia lookup",
    description: "Search Wikipedia and insert a cited summary block.",
    searchTerms: ["wiki", "wikipedia", "lookup", "definition", "reference", "cite", "source"],
    icon: <Globe className="size-3.5" />,
    section: "general",
    pushAfter: "agent",
    command: ({ editor, range }) => {
      // Pull query text from the current paragraph (best-effort) so typing
      // `/wiki photosynthesis` pre-fills the topic automatically.
      const $from = editor.state.doc.resolve(range.from);
      const blockNode = $from.node($from.depth);
      // The node text includes the typed "/wiki " prefix — strip it.
      const rawText = blockNode?.textContent ?? "";
      const query = rawText.replace(/^\/wiki\s*/i, "").trim();

      // Remove the slash-command trigger before inserting the result.
      editor.chain().focus().deleteRange(range).run();

      if (!query) return;

      void (async () => {
        const hits = await searchWikipedia(query, { limit: 3 });
        if (!hits.length) return;
        const summary = await fetchWikipediaSummary(hits[0].title);
        if (!summary) return;

        const extract = summary.extract.slice(0, 1500);
        const sourceHtml = summary.url
          ? `<p>Source: <a href="${summary.url}" target="_blank" rel="noopener noreferrer">${summary.url}</a></p>`
          : "";

        // Insert: H3 heading + extract paragraph + source paragraph
        editor
          .chain()
          .focus()
          .insertContent([
            { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: summary.title }] },
            { type: "paragraph", content: [{ type: "text", text: extract }] },
            ...(sourceHtml
              ? [
                  {
                    type: "paragraph",
                    content: [
                      { type: "text", text: "Source: " },
                      {
                        type: "text",
                        marks: [{ type: "link", attrs: { href: summary.url, target: "_blank" } }],
                        text: summary.url,
                      },
                    ],
                  },
                ]
              : []),
          ])
          .run();
      })();
    },
  },
];
