/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Extension } from "@tiptap/core";
import { DOMParser as ProseMirrorDOMParser, type Node as ProseMirrorNode, type Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { TAtlasDocReviewProposal, TAtlasDocReviewProposalUpdate, TAtlasDocReviewSession } from "@/types";

// A proposal whose content is written into the real document. `from`/`to`
// track the live range of that content so it can be re-streamed, highlighted,
// accepted (keep), or rejected (delete from the doc).
type TTrackedProposal = TAtlasDocReviewProposal & { from: number; to: number };

type TAtlasDocReviewState = {
  session: TAtlasDocReviewSession | null;
  proposals: TTrackedProposal[];
  // True from session start until the first proposal arrives or the stream ends.
  // Drives the "Atlas is drafting…" placeholder so the editor isn't blank while
  // the model is still composing. Kept separate from `proposals.length === 0`
  // because that's also true after the user rejects every proposal.
  loading: boolean;
  // Cached DecorationSet — rebuilt only when proposals change, mapped through
  // tr.mapping on every other transaction (typing, cursor moves, etc.).
  decorations: DecorationSet;
};

type TFoundNode = { node: ProseMirrorNode; pos: number };

type TAtlasDocReviewAction =
  | { type: "start"; session: TAtlasDocReviewSession }
  | { type: "append"; proposal: TTrackedProposal }
  | { type: "update"; id: string; patch: TAtlasDocReviewProposalUpdate; from: number; to: number }
  | { type: "remove"; id: string }
  | { type: "set-loading"; loading: boolean }
  | { type: "clear" };

export const atlasDocReviewPluginKey = new PluginKey<TAtlasDocReviewState>("atlasDocReview");

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    atlasDocReview: {
      startAtlasReviewSession: (session: TAtlasDocReviewSession) => ReturnType;
      setAtlasReviewLoading: (loading: boolean) => ReturnType;
      appendAtlasProposal: (proposal: TAtlasDocReviewProposal) => ReturnType;
      updateAtlasProposal: (id: string, patch: TAtlasDocReviewProposalUpdate) => ReturnType;
      acceptAtlasProposal: (id: string) => ReturnType;
      rejectAtlasProposal: (id: string) => ReturnType;
      acceptAllAtlasProposals: () => ReturnType;
      rejectAllAtlasProposals: () => ReturnType;
    };
  }
}

const initialState: TAtlasDocReviewState = {
  session: null,
  proposals: [],
  loading: false,
  decorations: DecorationSet.empty,
};

const getReviewState = (state: EditorState) => atlasDocReviewPluginKey.getState(state) ?? initialState;

const clampPos = (state: EditorState, pos: number | undefined) =>
  Math.max(0, Math.min(pos ?? state.selection.from, state.doc.content.size));

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const contentHtml = (proposal: TAtlasDocReviewProposal) => {
  if (typeof proposal.contentHtml === "string") return proposal.contentHtml;
  const text = (proposal.contentText ?? "").trim();
  if (!text) return "";
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph.trim()).replace(/\n/g, "<br />")}</p>`)
    .join("");
};

// A proposal always renders at least an empty paragraph so there's a real
// range to highlight while the first tokens are still streaming in.
const proposalHtml = (proposal: TAtlasDocReviewProposal) => contentHtml(proposal) || "<p></p>";

const parseProposalSlice = (state: EditorState, proposal: TAtlasDocReviewProposal): Slice => {
  const container = document.createElement("div");
  container.innerHTML = proposalHtml(proposal);
  return ProseMirrorDOMParser.fromSchema(state.schema).parseSlice(container);
};

const findNodeById = (state: EditorState, nodeId?: string): TFoundNode | null => {
  if (!nodeId) return null;
  let found: TFoundNode | null = null;
  state.doc.descendants((node, pos) => {
    if (found) return false;
    if (node.attrs?.id === nodeId) {
      found = { node, pos };
      return false;
    }
    return true;
  });
  return found;
};

// Resolve a clean top-level block boundary at/after `pos` so inserted content
// lands between blocks instead of splitting the paragraph the cursor is in.
const blockBoundaryAt = (state: EditorState, pos: number | undefined): number => {
  const resolved = state.doc.resolve(clampPos(state, pos));
  try {
    return resolved.after(1);
  } catch {
    return clampPos(state, pos);
  }
};

// Where a proposal's content should be written. insert_after/replace land just
// after the target block; everything else lands at the session anchor.
const proposalInsertPos = (state: EditorState, proposal: TAtlasDocReviewProposal): number => {
  if (proposal.operation === "insert_after" || proposal.operation === "replace") {
    const target = findNodeById(state, proposal.targetBlockId);
    if (target) return target.pos + target.node.nodeSize;
  }
  return blockBoundaryAt(state, proposal.anchorPos);
};

const dispatchReviewEvent = (view: EditorView, eventName: string, id?: string) => {
  view.dom.dispatchEvent(
    new CustomEvent(eventName, {
      bubbles: true,
      detail: { id },
    })
  );
};

// --------------------------------------------------------------------------
// Accept / reject — operate on the real document via the view.
// --------------------------------------------------------------------------

const acceptProposal = (view: EditorView, id?: string) => {
  const proposal = getReviewState(view.state).proposals.find((item) => item.id === id);
  if (!proposal) return;
  let tr = view.state.tr;
  // For replace/delete the proposed content (if any) is already written in;
  // accepting also removes the original target block it was meant to supersede.
  if (proposal.operation === "replace" || proposal.operation === "delete") {
    const target = findNodeById(view.state, proposal.targetBlockId);
    if (target) tr = tr.delete(target.pos, target.pos + target.node.nodeSize);
  }
  tr = tr.setMeta(atlasDocReviewPluginKey, { type: "remove", id: proposal.id } satisfies TAtlasDocReviewAction);
  view.dispatch(tr);
};

const rejectProposal = (view: EditorView, id?: string) => {
  const proposal = getReviewState(view.state).proposals.find((item) => item.id === id);
  if (!proposal) return;
  let tr = view.state.tr;
  // Delete the written-in content. (A delete proposal never wrote anything, so
  // rejecting it simply keeps the original block.)
  if (proposal.operation !== "delete") {
    tr = tr.delete(clampPos(view.state, proposal.from), clampPos(view.state, proposal.to));
  }
  tr = tr.setMeta(atlasDocReviewPluginKey, { type: "remove", id: proposal.id } satisfies TAtlasDocReviewAction);
  view.dispatch(tr);
};

const acceptAllProposals = (view: EditorView) => {
  const proposals = getReviewState(view.state).proposals;
  let tr = view.state.tr;
  // Delete superseded target blocks high-to-low so earlier positions stay valid.
  const targets = proposals
    .filter((p) => p.operation === "replace" || p.operation === "delete")
    .map((p) => findNodeById(view.state, p.targetBlockId))
    .filter((t): t is TFoundNode => t !== null)
    .toSorted((a, b) => b.pos - a.pos);
  for (const target of targets) tr = tr.delete(target.pos, target.pos + target.node.nodeSize);
  tr = tr.setMeta(atlasDocReviewPluginKey, { type: "clear" } satisfies TAtlasDocReviewAction);
  view.dispatch(tr);
};

const rejectAllProposals = (view: EditorView) => {
  const proposals = getReviewState(view.state).proposals;
  let tr = view.state.tr;
  const ranges = proposals
    .filter((p) => p.operation !== "delete")
    .map((p) => ({ from: clampPos(view.state, p.from), to: clampPos(view.state, p.to) }))
    .toSorted((a, b) => b.from - a.from);
  for (const range of ranges) tr = tr.delete(range.from, range.to);
  tr = tr.setMeta(atlasDocReviewPluginKey, { type: "clear" } satisfies TAtlasDocReviewAction);
  view.dispatch(tr);
};

// --------------------------------------------------------------------------
// Decorations — pink highlight over the real content + floating controls.
// --------------------------------------------------------------------------

const buildProposalControls = (view: EditorView, proposal: TTrackedProposal) => {
  // `controls` is a zero-height anchor at the block boundary; `inner` is
  // pushed into the right margin so the buttons sit next to the paragraph
  // rather than floating over its text.
  const controls = document.createElement("div");
  controls.className = "atlas-doc-review-controls";
  controls.contentEditable = "false";
  controls.setAttribute("data-atlas-proposal-id", proposal.id);

  const inner = document.createElement("div");
  inner.className = "atlas-doc-review-controls-inner";

  const acceptLabel = proposal.operation === "delete" ? "Delete" : "Accept";
  const accept = document.createElement("button");
  accept.type = "button";
  accept.className = "atlas-doc-review-button is-primary";
  accept.textContent = "✓";
  accept.title = acceptLabel;
  accept.setAttribute("aria-label", acceptLabel);
  accept.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    dispatchReviewEvent(view, "atlas-doc-review-accept", proposal.id);
  });
  inner.appendChild(accept);

  const rejectLabel = proposal.operation === "delete" ? "Keep" : "Reject";
  const reject = document.createElement("button");
  reject.type = "button";
  reject.className = "atlas-doc-review-button";
  reject.textContent = "✕";
  reject.title = rejectLabel;
  reject.setAttribute("aria-label", rejectLabel);
  reject.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    dispatchReviewEvent(view, "atlas-doc-review-reject", proposal.id);
  });
  inner.appendChild(reject);

  controls.appendChild(inner);
  return controls;
};

const buildDecorations = (proposals: TTrackedProposal[], state: EditorState): DecorationSet => {
  const visibleProposals = proposals.filter((proposal) => !["accepted", "rejected"].includes(proposal.status));

  // Fast path: no visible proposals → return the singleton empty set immediately.
  if (visibleProposals.length === 0) return DecorationSet.empty;

  // The "Atlas is drafting…" status now lives in the Atlas chat bar, so the
  // document stays clean while the model is composing.

  // Note: bulk Accept all / Reject all lives in the Atlas chat bar (less
  // chrome inside the document), driven by the editor-ref commands.

  const decorations: Decoration[] = [];
  for (const proposal of visibleProposals) {
    const from = clampPos(state, proposal.from);
    const to = clampPos(state, proposal.to);

    // Highlight just the proposal's text — inline so the tint hugs the words
    // (like a selection) instead of filling the whole block width.
    if (to > from) {
      decorations.push(
        Decoration.inline(from, to, {
          class: "atlas-doc-review-pending",
          "data-atlas-proposal-id": proposal.id,
        })
      );
    }

    // Floating Accept/Reject pinned to the top-right of the highlighted range.
    decorations.push(
      Decoration.widget(from, (view) => buildProposalControls(view, proposal), {
        key: `atlas-controls-${proposal.id}-${proposal.status}`,
        side: -1,
      })
    );
  }

  return DecorationSet.create(state.doc, decorations);
};

export const AtlasDocReviewExtension = Extension.create({
  name: "atlasDocReview",

  addCommands() {
    return {
      startAtlasReviewSession:
        (session) =>
        ({ state, tr, dispatch }) => {
          dispatch?.(
            tr.setMeta(atlasDocReviewPluginKey, {
              type: "start",
              session: { ...session, anchorPos: clampPos(state, session.anchorPos) },
            } satisfies TAtlasDocReviewAction)
          );
          return true;
        },
      setAtlasReviewLoading:
        (loading) =>
        ({ tr, dispatch }) => {
          dispatch?.(
            tr.setMeta(atlasDocReviewPluginKey, { type: "set-loading", loading } satisfies TAtlasDocReviewAction)
          );
          return true;
        },
      appendAtlasProposal:
        (proposal) =>
        ({ state, tr, dispatch }) => {
          if (!dispatch) return true;
          let from: number;
          let to: number;

          if (proposal.operation === "delete") {
            // Nothing is written for a delete; highlight the target block itself.
            const target = findNodeById(state, proposal.targetBlockId);
            if (!target) return false;
            from = target.pos;
            to = target.pos + target.node.nodeSize;
          } else {
            const insertPos = proposalInsertPos(state, proposal);
            const before = state.doc.content.size;
            tr.replaceRange(insertPos, insertPos, parseProposalSlice(state, proposal));
            from = insertPos;
            to = insertPos + (tr.doc.content.size - before);
          }

          dispatch(
            tr.setMeta(atlasDocReviewPluginKey, {
              type: "append",
              proposal: { ...proposal, anchorPos: clampPos(state, proposal.anchorPos), from, to },
            } satisfies TAtlasDocReviewAction)
          );
          return true;
        },
      updateAtlasProposal:
        (id, patch) =>
        ({ state, tr, dispatch }) => {
          if (!dispatch) return true;
          const proposal = getReviewState(state).proposals.find((item) => item.id === id);
          if (!proposal) return false;

          let from = proposal.from;
          let to = proposal.to;
          // Re-stream the written-in content (delete proposals carry no body).
          if (proposal.operation !== "delete") {
            const before = state.doc.content.size;
            tr.replaceRange(
              clampPos(state, proposal.from),
              clampPos(state, proposal.to),
              parseProposalSlice(state, { ...proposal, ...patch })
            );
            to = proposal.to + (tr.doc.content.size - before);
          }

          dispatch(
            tr.setMeta(atlasDocReviewPluginKey, { type: "update", id, patch, from, to } satisfies TAtlasDocReviewAction)
          );
          return true;
        },
      acceptAtlasProposal:
        (id) =>
        ({ view }) => {
          if (!view) return false;
          acceptProposal(view, id);
          return true;
        },
      rejectAtlasProposal:
        (id) =>
        ({ view }) => {
          if (!view) return false;
          rejectProposal(view, id);
          return true;
        },
      acceptAllAtlasProposals:
        () =>
        ({ view }) => {
          if (!view) return false;
          acceptAllProposals(view);
          return true;
        },
      rejectAllAtlasProposals:
        () =>
        ({ view }) => {
          if (!view) return false;
          rejectAllProposals(view);
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<TAtlasDocReviewState>({
        key: atlasDocReviewPluginKey,
        state: {
          init: () => initialState,
          apply(transaction, previous, _oldState, newState) {
            const mappedProposals: TTrackedProposal[] = previous.proposals.map((proposal) => ({
              ...proposal,
              from: transaction.mapping.map(proposal.from, 1),
              to: transaction.mapping.map(proposal.to, -1),
              anchorPos: proposal.anchorPos === undefined ? undefined : transaction.mapping.map(proposal.anchorPos, 1),
            }));
            const mapped: TAtlasDocReviewState = {
              session: previous.session
                ? {
                    ...previous.session,
                    anchorPos: transaction.mapping.map(previous.session.anchorPos ?? 0, 1),
                  }
                : null,
              proposals: mappedProposals,
              loading: previous.loading,
              // Map the cached DecorationSet through position changes (typing,
              // deletions). When there is no review action this is the only cost —
              // no full rebuild needed.
              decorations: previous.decorations.map(transaction.mapping, newState.doc),
            };

            const action = transaction.getMeta(atlasDocReviewPluginKey) as TAtlasDocReviewAction | undefined;
            if (!action) return mapped;

            // Any action that changes the visible proposal set requires a full
            // decoration rebuild. Actions that only affect loading/session state
            // do not change decorations.
            if (action.type === "start") {
              return { session: action.session, proposals: [], loading: true, decorations: DecorationSet.empty };
            }
            if (action.type === "set-loading") {
              return { ...mapped, loading: action.loading };
            }
            if (action.type === "append") {
              const newProposals = [...mapped.proposals, action.proposal];
              return {
                ...mapped,
                proposals: newProposals,
                loading: false,
                decorations: buildDecorations(newProposals, newState),
              };
            }
            if (action.type === "update") {
              const newProposals = mapped.proposals.map((proposal) =>
                proposal.id === action.id
                  ? { ...proposal, ...action.patch, from: action.from, to: action.to }
                  : proposal
              );
              return { ...mapped, proposals: newProposals, decorations: buildDecorations(newProposals, newState) };
            }
            if (action.type === "remove") {
              const newProposals = mapped.proposals.filter((proposal) => proposal.id !== action.id);
              return { ...mapped, proposals: newProposals, decorations: buildDecorations(newProposals, newState) };
            }
            // "clear" action
            return { ...initialState };
          },
        },
        props: {
          // Return the cached DecorationSet from plugin state — rebuilt only
          // when proposals change, mapped on every other transaction.
          decorations: (state) => atlasDocReviewPluginKey.getState(state)?.decorations ?? DecorationSet.empty,
          handleDOMEvents: {
            "atlas-doc-review-accept": (view, event) => {
              acceptProposal(view, (event as CustomEvent<{ id?: string }>).detail?.id);
              return true;
            },
            "atlas-doc-review-reject": (view, event) => {
              rejectProposal(view, (event as CustomEvent<{ id?: string }>).detail?.id);
              return true;
            },
            "atlas-doc-review-accept-all": (view) => {
              acceptAllProposals(view);
              return true;
            },
            "atlas-doc-review-reject-all": (view) => {
              rejectAllProposals(view);
              return true;
            },
          },
        },
      }),
    ];
  },
});
