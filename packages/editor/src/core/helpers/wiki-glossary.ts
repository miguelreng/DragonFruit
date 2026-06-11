/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Editor } from "@tiptap/core";
import { CORE_EXTENSIONS } from "@/constants/extension";
import { searchWikipedia } from "./wikipedia-client";

/**
 * Auto-link glossary: finds proper-noun/technical terms in the doc that have
 * an exact-title Wikipedia article and converts them to wiki mention chips.
 * Precision over recall — only exact (case-insensitive) title matches link,
 * and only the first occurrence of each term. One transaction = one undo.
 */

const STOP_TERMS = new Set([
  "The",
  "This",
  "That",
  "These",
  "Those",
  "There",
  "Here",
  "When",
  "Where",
  "What",
  "While",
  "With",
  "From",
  "Then",
  "They",
  "Today",
  "Tomorrow",
  "Yesterday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
]);

export type TGlossaryCandidate = {
  term: string;
  from: number;
  to: number;
};

export function findGlossaryCandidates(editor: Editor, limit = 8): TGlossaryCandidate[] {
  const candidates: TGlossaryCandidate[] = [];
  const seen = new Set<string>();

  editor.state.doc.descendants((node, pos, parent) => {
    if (candidates.length >= limit) return false;
    if (parent?.type.name === CORE_EXTENSIONS.CODE_BLOCK) return false;
    if (!node.isText || !node.text) return undefined;
    // Skip text that is already a link or inside code.
    if (node.marks.some((m) => m.type.name === "link" || m.type.name === "code")) return undefined;

    const text = node.text;
    const regex = /[A-Z][\w'&-]*(?:[ ][A-Z][\w'&-]*){0,3}/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) && candidates.length < limit) {
      const term = match[0];
      const offset = match.index;
      const isMultiWord = term.includes(" ");
      const preceding = text.slice(Math.max(0, offset - 2), offset);
      const lastPrecedingChar = preceding.slice(-1);
      // Reject matches that start mid-token ("iPhone" → "Phone").
      if (offset > 0 && lastPrecedingChar !== "" && !/\s/.test(lastPrecedingChar)) continue;
      // Single capitalized words are too noisy at sentence starts; require
      // mid-sentence position and a minimum length.
      const isSentenceStart = offset === 0 || /[.!?]\s$/.test(preceding);
      if (!isMultiWord && (term.length < 4 || isSentenceStart)) continue;
      if (STOP_TERMS.has(term)) continue;
      const key = term.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ term, from: pos + offset, to: pos + offset + term.length });
    }
    return undefined;
  });

  return candidates;
}

export async function linkGlossaryTerms(editor: Editor): Promise<number> {
  const candidates = findGlossaryCandidates(editor);
  const lookups = await Promise.all(
    candidates.map(async (candidate) => {
      const hits = await searchWikipedia(candidate.term, { limit: 1 });
      const hit = hits[0];
      if (!hit || hit.title.toLowerCase() !== candidate.term.toLowerCase()) return null;
      return {
        candidate,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(hit.key)}`,
      };
    })
  );
  const resolved = lookups.filter((entry): entry is { candidate: TGlossaryCandidate; url: string } => entry !== null);

  if (!resolved.length) return 0;

  // Replace bottom-up so earlier positions stay valid; one chain = one undo.
  resolved.sort((a, b) => b.candidate.from - a.candidate.from);
  let chain = editor.chain().focus();
  for (const { candidate, url } of resolved) {
    chain = chain.insertContentAt(
      { from: candidate.from, to: candidate.to },
      {
        type: CORE_EXTENSIONS.MENTION,
        attrs: {
          id: `wiki-glossary-${candidate.term.toLowerCase().replace(/\s+/g, "-")}`,
          entity_identifier: url,
          entity_name: "wiki",
        },
      }
    );
  }
  chain.run();
  return resolved.length;
}
