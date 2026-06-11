# 006 — Doc-write safety net: investigation findings & recommendation

Spike output (advisor investigation, no source changes). Audited against commit
`982d3e92c5` (2026-06-10). Goal: decide whether/how to add undo, multi-select, and
draft mode to Atlas's doc-write proposals.

## 1. How doc-write actually works today (data-flow map)

The key fact that shapes everything: **proposed content is written into the live
document immediately**, with a pink decoration drawn over it. Proposals are not a
separate staging layer — they are real edits with tracking metadata.

- **State** (`packages/editor/src/core/extensions/atlas-doc-review/extension.ts`):
  the plugin tracks `proposals[]`, each with `from`/`to` (range of the written-in
  proposed content), `targetBlockId` (the original block it supersedes, for
  replace/delete), `operation` (`insert_after` | `replace` | `delete`), and `status`.
- **Append** (`appendAtlasProposal` → editor-ref `:306`): the model's content is
  inserted into the doc and a proposal is recorded; a pink decoration highlights
  `from..to` (`buildDecorations`, now cached per plan 004).
- **Accept** (`acceptProposal`, `extension.ts:141`): for replace/delete, deletes the
  original `targetBlockId` block; the written-in content stays; the proposal is
  removed (`{type:"remove"}`) which clears the highlight. For insert, just removes
  the proposal (content stays). It's a plain `view.dispatch(tr)`.
- **Reject** (`extension.ts:155`): deletes the written-in content (`from..to`);
  delete-ops keep the original; removes the proposal.
- **Bulk** (`acceptAllProposals`/`rejectAllProposals`, `:168`/`:182`): same, batched
  high-to-low so positions stay valid; `{type:"clear"}`.
- **Editor-ref API** (`editor-ref.ts`): already exposes per-id
  `acceptAtlasProposal(id)` / `rejectAtlasProposal(id)` plus `acceptAll`/`rejectAll`.
- **UI** (`apps/web/core/components/agent/agent-dispatch-listener.tsx` ~1140): renders
  "Accept all" / "Reject all" only.

**Two consequences:**

1. Accept/reject are ordinary PM transactions (no `addToHistory:false` seen), so they
   propagate through Yjs like any edit — no special collaborative handling, and the
   editor's native undo stack covers the _text_ change.
2. Because content is already in the doc, "draft mode" (stage without touching the
   doc) is a structural change, not a tweak.

## 2. The three options, evaluated against the code

### Option A — Multi-select + "Accept selected" · effort S–M · risk LOW

Purely additive UI over the existing per-id editor-ref commands. The per-proposal
controls already exist as decoration widgets (`buildProposalControls`); add a
selection state in the listener and an "Accept selected (n)" / "Reject selected"
action that loops `acceptAtlasProposal(id)` over the chosen ids (high-to-low to keep
positions valid, mirroring `acceptAllProposals`). No transaction-model or Yjs change.
**This is the highest value-to-risk and should ship first.**

### Option B — Undo / "Revert Atlas changes" · effort M · risk MED

Two sub-approaches:

- **B1 — lean on native undo.** Accept/reject are already in the history stack, so
  Cmd/Ctrl-Z restores the _text_. BUT undo does not restore plugin state (the
  proposal/highlight), so the visual review state desyncs from the doc after undo —
  partial and janky. Not sufficient alone.
- **B2 — session snapshot + reconcile (recommended).** `startAtlasReviewSession`
  already establishes a session (with `anchorPos`). Capture the doc's HTML/state at
  session start, and add a "Discard Atlas changes" that reconciles the doc back to
  that snapshot using the **existing in-place reconcile** in
  `packages/editor/src/core/helpers/yjs-utils.ts`
  (`replaceDocumentEditorYDocContent` / `updateYFragment`). This reuses proven
  machinery and is collaborative-safe. **Critical:** must use the in-place reconcile,
  NOT a fresh-rooted Yjs blob — a fresh root unions with the IndexedDB cache and
  stacks a duplicate copy (the documented meeting-notes duplication bug). See the
  `yjs-utils` header comments.

### Option C — Draft / staged mode · effort L · risk HIGH

Today proposals mutate the live doc on append. True draft mode = render proposals as
widgets/decorations **without** writing them in, then apply on commit. That inverts
the append/accept flow (accept would have to _insert_ the content, not just clear a
highlight) and raises an unresolved collaborative question: should staged content be
visible to other editors before commit, or local-only? High cost, unclear semantics.
**Defer until there's a product decision on the collaborative behavior.**

## 3. Recommendation

1. **Ship Option A (multi-select) first** — cheap, additive, removes the biggest
   day-to-day friction (accept 8 of 10 without clicking each). Make it a normal plan.
2. **Then Option B2 (snapshot + reconcile revert)** — gives the safety net that makes
   users trust write-mode on real docs, reusing the existing reconcile helper.
3. **Defer Option C (draft mode)** until the collaborative-visibility question is
   answered; it's a rework, not an increment.

## 4. Open questions for the maintainer

- **Collaborative visibility of staged content** (gates Option C): should proposals
  ever be local-only-until-commit, or is "written in immediately, reviewable by all"
  the desired model? Current behavior is the latter.
- **Revert mechanism** (Option B2): is a session-start snapshot acceptable, or should
  this hook into page version history instead?
- **Undo semantics** (Option B1): do we want accept/reject to be cleanly undoable
  including the highlight state? If yes, the proposal state needs to ride the history
  (e.g. re-derive plugin state on undo) — a small but real change to the plugin.

## 5. Suggested follow-up plans

- **Plan 012 (proposed)**: Option A — proposal multi-select + accept/reject-selected.
  Scope: `agent-dispatch-listener.tsx` (+ possibly the decoration controls). Additive,
  flag not required. S–M.
- **Plan 013 (proposed)**: Option B2 — session snapshot + "Discard Atlas changes" via
  the in-place Yjs reconcile. Depends on a maintainer answer to the revert-mechanism
  question. M.

No source code was changed by this spike. The optional flag-gated prototype from the
plan was intentionally skipped — the investigation is conclusive enough to scope
plans 012/013 directly, and a throwaway prototype would add churn without changing
the recommendation.
