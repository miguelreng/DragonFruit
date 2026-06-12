/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Sparkles } from "@plane/icons";
// components
import { WikipediaLogo } from "@/components/logos";
// helpers
import { searchWikipedia, fetchWikipediaSummary } from "@/helpers/wikipedia-client";
import { checkWikipediaCitations } from "@/helpers/wiki-citations";
import { linkGlossaryTerms } from "@/helpers/wiki-glossary";
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
    icon: <WikipediaLogo className="size-3.5" />,
    section: "general",
    pushAfter: "agent",
    acceptsArguments: true,
    command: ({ editor, range }) => {
      // The suggestion range covers exactly what the user typed
      // ("/wiki photosynthesis") regardless of what else is in the
      // paragraph — strip the slash trigger (any alias) to get the topic.
      const rawText = editor.state.doc.textBetween(range.from, range.to, " ");
      const query = rawText.replace(/^\/\S*\s*/, "").trim();

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
  {
    // Phase E — "Cite this" inline citation.
    //
    // Takes the selection text as the search query (the primary use-case:
    // select a claim → /cite → best Wikipedia hit inserted as a citation).
    // Falls back to the current paragraph text when there is no selection.
    //
    // Superscript (<sup>) is not registered as a TipTap mark in this
    // schema, so we take the documented fallback: insert a plain inline
    // link "[wiki]" immediately after the cursor.  This keeps the
    // citation grounded to the prose without requiring a new footnote
    // subsystem.
    commandKey: "cite",
    key: "cite",
    title: "Cite this",
    description: "Find the best Wikipedia source for the selected text and insert an inline citation.",
    searchTerms: ["cite", "citation", "source", "reference", "wikipedia", "wiki", "footnote"],
    icon: <WikipediaLogo className="size-3.5" />,
    section: "general",
    pushAfter: "wiki",
    acceptsArguments: true,
    command: ({ editor, range }) => {
      // Prefer an active text selection — the canonical "Cite this" flow:
      // user selects a claim, types /cite, hits Enter.
      const selectionText = editor.state.doc
        .textBetween(editor.state.selection.from, editor.state.selection.to, " ")
        .trim();

      // Fall back to an inline argument ("/cite gravity") from the typed
      // suggestion range, then to the rest of the paragraph.
      const typedText = editor.state.doc.textBetween(range.from, range.to, " ");
      const typedQuery = typedText.replace(/^\/\S*\s*/, "").trim();
      const $from = editor.state.doc.resolve(range.from);
      const blockNode = $from.node($from.depth);
      const rawText = blockNode?.textContent ?? "";
      const paragraphQuery = rawText.replace(/^\/\S*\s*/, "").trim();

      const query = selectionText || typedQuery || paragraphQuery;

      // Remove the slash-command trigger before inserting.
      editor.chain().focus().deleteRange(range).run();

      if (!query) return;

      void (async () => {
        const hits = await searchWikipedia(query, { limit: 1 });
        if (!hits.length) return;

        const hit = hits[0];
        const summary = await fetchWikipediaSummary(hit.title);
        const articleUrl = summary?.url ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(hit.key)}`;

        // Insert a plain inline citation link "[wiki]" after the cursor.
        // The <sup> wrapper is omitted because TipTap's schema in this
        // project does not register a superscript mark — adding one would
        // be a new footnote subsystem, which is out of scope for v1.
        editor
          .chain()
          .focus()
          .insertContent([
            {
              type: "text",
              text: " ",
            },
            {
              type: "text",
              marks: [
                {
                  type: "link",
                  attrs: {
                    href: articleUrl,
                    target: "_blank",
                    rel: "noopener noreferrer",
                  },
                },
              ],
              text: "[wiki]",
            },
          ])
          .run();
      })();
    },
  },
  {
    commandKey: "link-terms",
    key: "link-terms",
    title: "Link terms",
    description: "Find notable terms in this doc and link them to Wikipedia.",
    searchTerms: ["link-terms", "link terms", "glossary", "auto link", "wikipedia", "wiki", "terms"],
    icon: <WikipediaLogo className="size-3.5" />,
    section: "general",
    pushAfter: "cite",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      void linkGlossaryTerms(editor).then((count) => {
        editor.view.dom.dispatchEvent(
          new CustomEvent("dragonfruit:glossary-linked", { bubbles: true, detail: { count } })
        );
        return undefined;
      });
    },
  },
  {
    commandKey: "check-citations",
    key: "check-citations",
    title: "Check citations",
    description: "Verify every Wikipedia citation in this doc still resolves.",
    searchTerms: ["check-citations", "check citations", "citations", "verify", "sources", "wikipedia", "wiki"],
    icon: <WikipediaLogo className="size-3.5" />,
    section: "general",
    pushAfter: "link-terms",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      void checkWikipediaCitations(editor);
    },
  },
];
