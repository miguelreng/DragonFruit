/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Extension } from "@tiptap/core";
import { DOMParser as ProseMirrorDOMParser, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { TAtlasDocReviewProposal, TAtlasDocReviewProposalUpdate, TAtlasDocReviewSession } from "@/types";

type TAtlasDocReviewState = {
  session: TAtlasDocReviewSession | null;
  proposals: TAtlasDocReviewProposal[];
  // True from session start until the first proposal arrives or the stream ends.
  // Drives the "Atlas is drafting…" placeholder so the editor isn't blank while
  // the model is still composing. Kept separate from `proposals.length === 0`
  // because that's also true after the user rejects every proposal.
  loading: boolean;
};

type TFoundNode = { node: ProseMirrorNode; pos: number };

type TAtlasDocReviewAction =
  | { type: "start"; session: TAtlasDocReviewSession }
  | { type: "append"; proposal: TAtlasDocReviewProposal }
  | { type: "update"; id: string; patch: TAtlasDocReviewProposalUpdate }
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
};

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

const parseContent = (view: EditorView, proposal: TAtlasDocReviewProposal) => {
  const html = contentHtml(proposal);
  if (!html) return null;
  const container = document.createElement("div");
  container.innerHTML = html;
  return ProseMirrorDOMParser.fromSchema(view.state.schema).parseSlice(container);
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
  return found as TFoundNode | null;
};

const isStale = (state: EditorState, proposal: TAtlasDocReviewProposal) => {
  if (!proposal.targetBlockId || !proposal.targetOriginalText) return false;
  const target = findNodeById(state, proposal.targetBlockId);
  if (!target) return true;
  return target.node.textContent.trim() !== proposal.targetOriginalText.trim();
};

const applyAcceptedProposal = (view: EditorView, proposal: TAtlasDocReviewProposal) => {
  const stale = isStale(view.state, proposal);
  const parsed = parseContent(view, proposal);
  const target = findNodeById(view.state, proposal.targetBlockId);
  let tr = view.state.tr;

  if (proposal.operation === "delete" && !stale && target) {
    tr = tr.delete(target.pos, target.pos + target.node.nodeSize);
  } else if (proposal.operation === "replace" && !stale && target && parsed) {
    tr = tr.replaceRange(target.pos, target.pos + target.node.nodeSize, parsed);
  } else if (parsed) {
    const insertPos = target ? target.pos + target.node.nodeSize : clampPos(view.state, proposal.anchorPos);
    tr = tr.replaceRange(insertPos, insertPos, parsed);
  }

  tr = tr.setMeta(atlasDocReviewPluginKey, { type: "remove", id: proposal.id } satisfies TAtlasDocReviewAction);
  view.dispatch(tr);
};

const dispatchReviewEvent = (view: EditorView, eventName: string, id?: string) => {
  view.dom.dispatchEvent(
    new CustomEvent(eventName, {
      bubbles: true,
      detail: { id },
    })
  );
};

const buildProposalCard = (view: EditorView, proposal: TAtlasDocReviewProposal, stale: boolean) => {
  const card = document.createElement("div");
  card.className = `atlas-doc-review-card${stale ? " is-stale" : ""}`;
  card.setAttribute("data-atlas-proposal-id", proposal.id);
  card.contentEditable = "false";

  // Float the controls to the top-right so the proposed text wraps to their
  // left — the suggestion reads as inline highlighted prose, not a boxed card.
  const actions = document.createElement("div");
  actions.className = "atlas-doc-review-actions";

  const accept = document.createElement("button");
  accept.type = "button";
  accept.className = "atlas-doc-review-button is-primary";
  accept.textContent = `✓ ${stale && proposal.operation !== "delete" ? "Insert as new" : "Accept"}`;
  accept.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    dispatchReviewEvent(view, "atlas-doc-review-accept", proposal.id);
  });
  actions.appendChild(accept);

  const reject = document.createElement("button");
  reject.type = "button";
  reject.className = "atlas-doc-review-button";
  reject.textContent = "✕ Reject";
  reject.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    dispatchReviewEvent(view, "atlas-doc-review-reject", proposal.id);
  });
  actions.appendChild(reject);

  card.appendChild(actions);

  if (proposal.targetOriginalText && proposal.operation !== "insert_after") {
    const oldText = document.createElement("div");
    oldText.className = "atlas-doc-review-old";
    oldText.textContent = proposal.targetOriginalText;
    card.appendChild(oldText);
  }

  if (proposal.operation !== "delete") {
    const body = document.createElement("div");
    body.className = "atlas-doc-review-body";
    const html = contentHtml(proposal);
    body.innerHTML = html || "<p>Atlas is writing...</p>";
    card.appendChild(body);
  }

  if (stale) {
    const note = document.createElement("div");
    note.className = "atlas-doc-review-note";
    note.textContent = "The original paragraph changed while Atlas was writing.";
    card.appendChild(note);
  }

  return card;
};

const buildToolbar = (view: EditorView, state: TAtlasDocReviewState) => {
  const toolbar = document.createElement("div");
  toolbar.className = "atlas-doc-review-toolbar";
  toolbar.contentEditable = "false";

  const title = document.createElement("div");
  title.className = "atlas-doc-review-toolbar-title";
  title.textContent = state.session?.mode === "update" ? "Atlas proposed edits" : "Atlas draft";
  toolbar.appendChild(title);

  const actions = document.createElement("div");
  actions.className = "atlas-doc-review-actions";

  const acceptAll = document.createElement("button");
  acceptAll.type = "button";
  acceptAll.className = "atlas-doc-review-button is-primary";
  acceptAll.textContent = "Accept all";
  acceptAll.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    dispatchReviewEvent(view, "atlas-doc-review-accept-all");
  });
  actions.appendChild(acceptAll);

  const rejectAll = document.createElement("button");
  rejectAll.type = "button";
  rejectAll.className = "atlas-doc-review-button";
  rejectAll.textContent = "Reject all";
  rejectAll.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    dispatchReviewEvent(view, "atlas-doc-review-reject-all");
  });
  actions.appendChild(rejectAll);

  toolbar.appendChild(actions);
  return toolbar;
};

const buildDraftingIndicator = (mode: TAtlasDocReviewSession["mode"] | undefined) => {
  const indicator = document.createElement("div");
  indicator.className = "atlas-doc-review-toolbar atlas-doc-review-drafting";
  indicator.contentEditable = "false";

  const title = document.createElement("div");
  title.className = "atlas-doc-review-toolbar-title";
  title.textContent = mode === "update" ? "Atlas is reviewing the page" : "Atlas is drafting";
  indicator.appendChild(title);

  const dots = document.createElement("div");
  dots.className = "atlas-doc-review-dots";
  for (let i = 0; i < 3; i += 1) {
    const dot = document.createElement("span");
    dot.className = "atlas-doc-review-dot";
    dots.appendChild(dot);
  }
  indicator.appendChild(dots);

  return indicator;
};

const buildDecorations = (state: EditorState) => {
  const reviewState = atlasDocReviewPluginKey.getState(state) ?? initialState;
  const visibleProposals = reviewState.proposals.filter(
    (proposal) => !["accepted", "rejected"].includes(proposal.status)
  );
  const decorations: Decoration[] = [];

  // No proposals yet but the stream is open — show a live placeholder so the
  // editor reflects that Atlas is working instead of looking inert.
  if (reviewState.loading && visibleProposals.length === 0) {
    decorations.push(
      Decoration.widget(
        clampPos(state, reviewState.session?.anchorPos),
        () => buildDraftingIndicator(reviewState.session?.mode),
        {
          key: `atlas-drafting-${reviewState.session?.id ?? "active"}`,
          side: -1,
        }
      )
    );
    return DecorationSet.create(state.doc, decorations);
  }

  if (visibleProposals.length > 0) {
    decorations.push(
      Decoration.widget(clampPos(state, reviewState.session?.anchorPos), (view) => buildToolbar(view, reviewState), {
        key: `atlas-toolbar-${reviewState.session?.id ?? "active"}`,
        side: -1,
      })
    );
  }

  for (const proposal of visibleProposals) {
    const target = findNodeById(state, proposal.targetBlockId);
    const stale = isStale(state, proposal);
    const widgetPos =
      proposal.operation === "insert_after" && target
        ? target.pos + target.node.nodeSize
        : target
          ? target.pos
          : clampPos(state, proposal.anchorPos ?? reviewState.session?.anchorPos);

    if (target && proposal.operation !== "insert_after") {
      decorations.push(
        Decoration.node(target.pos, target.pos + target.node.nodeSize, {
          class: stale ? "atlas-doc-review-target is-stale" : "atlas-doc-review-target",
        })
      );
    }

    decorations.push(
      Decoration.widget(widgetPos, (view) => buildProposalCard(view, proposal, stale), {
        key: `atlas-proposal-${proposal.id}-${proposal.status}-${proposal.contentText ?? ""}`,
        side: proposal.operation === "insert_after" ? 1 : -1,
      })
    );
  }

  return DecorationSet.create(state.doc, decorations);
};

const mapProposal = (transaction: Transaction, proposal: TAtlasDocReviewProposal): TAtlasDocReviewProposal => ({
  ...proposal,
  anchorPos: proposal.anchorPos === undefined ? undefined : transaction.mapping.map(proposal.anchorPos, 1),
});

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
          dispatch?.(
            tr.setMeta(atlasDocReviewPluginKey, {
              type: "append",
              proposal: {
                ...proposal,
                anchorPos: clampPos(state, proposal.anchorPos),
              },
            } satisfies TAtlasDocReviewAction)
          );
          return true;
        },
      updateAtlasProposal:
        (id, patch) =>
        ({ tr, dispatch }) => {
          dispatch?.(
            tr.setMeta(atlasDocReviewPluginKey, { type: "update", id, patch } satisfies TAtlasDocReviewAction)
          );
          return true;
        },
      acceptAtlasProposal:
        (id) =>
        ({ view }) => {
          if (!view) return false;
          const proposal = atlasDocReviewPluginKey.getState(view.state)?.proposals.find((item) => item.id === id);
          if (!proposal) return false;
          applyAcceptedProposal(view, proposal);
          return true;
        },
      rejectAtlasProposal:
        (id) =>
        ({ tr, dispatch }) => {
          dispatch?.(tr.setMeta(atlasDocReviewPluginKey, { type: "remove", id } satisfies TAtlasDocReviewAction));
          return true;
        },
      acceptAllAtlasProposals:
        () =>
        ({ view }) => {
          if (!view) return false;
          const proposalIds = (atlasDocReviewPluginKey.getState(view.state)?.proposals ?? []).map(
            (proposal) => proposal.id
          );
          for (const proposalId of proposalIds) {
            const proposal = atlasDocReviewPluginKey
              .getState(view.state)
              ?.proposals.find((item) => item.id === proposalId);
            if (proposal) applyAcceptedProposal(view, proposal);
          }
          return true;
        },
      rejectAllAtlasProposals:
        () =>
        ({ tr, dispatch }) => {
          dispatch?.(tr.setMeta(atlasDocReviewPluginKey, { type: "clear" } satisfies TAtlasDocReviewAction));
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
          apply(transaction, previous) {
            const mapped: TAtlasDocReviewState = {
              session: previous.session
                ? {
                    ...previous.session,
                    anchorPos: transaction.mapping.map(previous.session.anchorPos ?? 0, 1),
                  }
                : null,
              proposals: previous.proposals.map((proposal) => mapProposal(transaction, proposal)),
              loading: previous.loading,
            };
            const action = transaction.getMeta(atlasDocReviewPluginKey) as TAtlasDocReviewAction | undefined;
            if (!action) return mapped;

            if (action.type === "start") {
              return { session: action.session, proposals: [], loading: true };
            }
            if (action.type === "set-loading") {
              return { ...mapped, loading: action.loading };
            }
            if (action.type === "append") {
              return { ...mapped, proposals: [...mapped.proposals, action.proposal], loading: false };
            }
            if (action.type === "update") {
              return {
                ...mapped,
                proposals: mapped.proposals.map((proposal) =>
                  proposal.id === action.id ? { ...proposal, ...action.patch } : proposal
                ),
              };
            }
            if (action.type === "remove") {
              return { ...mapped, proposals: mapped.proposals.filter((proposal) => proposal.id !== action.id) };
            }
            return initialState;
          },
        },
        props: {
          decorations: buildDecorations,
          handleDOMEvents: {
            "atlas-doc-review-accept": (view, event) => {
              const id = (event as CustomEvent<{ id?: string }>).detail?.id;
              const proposal = atlasDocReviewPluginKey.getState(view.state)?.proposals.find((item) => item.id === id);
              if (proposal) applyAcceptedProposal(view, proposal);
              return true;
            },
            "atlas-doc-review-reject": (view, event) => {
              const id = (event as CustomEvent<{ id?: string }>).detail?.id;
              if (id) view.dispatch(view.state.tr.setMeta(atlasDocReviewPluginKey, { type: "remove", id }));
              return true;
            },
            "atlas-doc-review-accept-all": (view) => {
              const proposalIds = (atlasDocReviewPluginKey.getState(view.state)?.proposals ?? []).map(
                (proposal) => proposal.id
              );
              for (const proposalId of proposalIds) {
                const proposal = atlasDocReviewPluginKey
                  .getState(view.state)
                  ?.proposals.find((item) => item.id === proposalId);
                if (proposal) applyAcceptedProposal(view, proposal);
              }
              return true;
            },
            "atlas-doc-review-reject-all": (view) => {
              view.dispatch(view.state.tr.setMeta(atlasDocReviewPluginKey, { type: "clear" }));
              return true;
            },
          },
        },
      }),
    ];
  },
});
