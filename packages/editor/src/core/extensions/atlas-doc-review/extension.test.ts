import { Schema } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import {
  acceptAllProposalsTransaction,
  acceptProposalTransaction,
  rejectAllProposalsTransaction,
  type TTrackedProposal,
} from "./extension";

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: {
      attrs: { id: { default: null } },
      content: "text*",
      group: "block",
      toDOM: (node) => ["p", { "data-id": node.attrs.id }, 0],
      parseDOM: [{ tag: "p", getAttrs: (node) => ({ id: (node as HTMLElement).dataset.id }) }],
    },
    text: { group: "inline" },
  },
});

function paragraph(id: string, text: string) {
  return schema.node("paragraph", { id }, text ? schema.text(text) : undefined);
}

function stateWithReviewPairs() {
  return EditorState.create({
    schema,
    doc: schema.node("doc", null, [
      paragraph("original-a", "Original A"),
      paragraph("proposal-a", "Proposal A"),
      paragraph("original-b", "Original B"),
      paragraph("proposal-b", "Proposal B"),
    ]),
  });
}

function nodeRange(state: EditorState, id: string) {
  let range = { from: 0, to: 0 };
  state.doc.descendants((node, pos) => {
    if (node.attrs.id === id) {
      range = { from: pos, to: pos + node.nodeSize };
      return false;
    }
    return true;
  });
  return range;
}

function proposals(state: EditorState): TTrackedProposal[] {
  const first = nodeRange(state, "proposal-a");
  const second = nodeRange(state, "proposal-b");
  return [
    {
      id: "proposal-1",
      operation: "replace",
      status: "pending",
      targetBlockId: "original-a",
      from: first.from,
      to: first.to,
    },
    {
      id: "proposal-2",
      operation: "replace",
      status: "pending",
      targetBlockId: "original-b",
      from: second.from,
      to: second.to,
    },
  ];
}

describe("Atlas review transactions", () => {
  it("accepts all replacements in one transaction based on the supplied state", () => {
    const state = stateWithReviewPairs();
    const transaction = acceptAllProposalsTransaction(state, state.tr, proposals(state));

    expect(transaction).not.toBeNull();
    const next = state.apply(transaction!);
    expect(next.doc.textContent).toBe("Proposal AProposal B");
  });

  it("refuses the complete bulk action when one target is stale", () => {
    const state = stateWithReviewPairs();
    const stale = proposals(state);
    stale[1] = { ...stale[1], targetBlockId: "missing-block" };

    expect(acceptAllProposalsTransaction(state, state.tr, stale)).toBeNull();
    expect(state.doc.textContent).toBe("Original AProposal AOriginal BProposal B");
  });

  it("refuses a replacement when the target text changed after the snapshot", () => {
    const state = stateWithReviewPairs();
    const changed = proposals(state);
    changed[0] = { ...changed[0], targetOriginalText: "Older text" };

    expect(acceptAllProposalsTransaction(state, state.tr, changed)).toBeNull();
  });

  it("deletes a shared target only once when duplicate proposals arrive", () => {
    const state = stateWithReviewPairs();
    const duplicated = proposals(state);
    duplicated[1] = {
      ...duplicated[1],
      targetBlockId: "original-a",
      targetOriginalText: "Original A",
    };
    duplicated[0] = { ...duplicated[0], targetOriginalText: "Original A" };
    const transaction = acceptAllProposalsTransaction(state, state.tr, duplicated);

    expect(() => state.apply(transaction!)).not.toThrow();
  });

  it("rejects all proposed ranges without deleting originals", () => {
    const state = stateWithReviewPairs();
    const transaction = rejectAllProposalsTransaction(state, state.tr, proposals(state));

    expect(transaction).not.toBeNull();
    const next = state.apply(transaction!);
    expect(next.doc.textContent).toBe("Original AOriginal B");
  });

  it("accepts one proposal without resolving its sibling", () => {
    const state = stateWithReviewPairs();
    const transaction = acceptProposalTransaction(state, state.tr, proposals(state), "proposal-1");

    expect(transaction).not.toBeNull();
    const next = state.apply(transaction!);
    expect(next.doc.textContent).toBe("Proposal AOriginal BProposal B");
  });

  it("completes 100 fresh accept/reject cycles without a mismatched transaction", () => {
    for (let index = 0; index < 100; index += 1) {
      const state = stateWithReviewPairs();
      const transaction =
        index % 2 === 0
          ? acceptAllProposalsTransaction(state, state.tr, proposals(state))
          : rejectAllProposalsTransaction(state, state.tr, proposals(state));
      expect(() => state.apply(transaction!)).not.toThrow();
    }
  });
});
