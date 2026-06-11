# Plan 012: Doc-write proposal multi-select (in-document) + Accept/Reject selected

> **Executor instructions**: Additive feature. Follow step by step; run every
> verification command. Touch only in-scope files. `@plane/editor` is consumed by
> `web` from dist — rebuild it after editing. There is no web/editor runtime test
> harness, so verification is typecheck + editor build + lint; the reviewer will
> smoke-test the UI. If a STOP condition occurs, stop and report. Commit per the git
> workflow. SKIP updating plans/README.md. Audit claims against real tool output.
> Reply with the report format at the end.
>
> **Drift check (run first)**: `git diff --stat f8dedc799e..HEAD -- packages/editor/src/core/extensions/atlas-doc-review/extension.ts packages/editor/src/core/helpers/editor-ref.ts packages/editor/src/core/types/editor.ts apps/web/core/components/agent/agent-dispatch-listener.tsx`

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: MED (UI feature, no runtime test in worktree — reviewer smoke-tests)
- **Depends on**: 004 (DONE — decoration caching; this plan must keep it correct)
- **Category**: direction / feature
- **Planned at**: commit `f8dedc799e`, 2026-06-10
- **UX decision (confirmed by maintainer)**: selection lives **in the document** (a toggle on each proposal's existing control widget); the chat bar gains "Accept selected (n)" / "Reject selected (n)" when ≥1 is selected.

## Why this matters

Atlas writes doc-review proposals into the document with per-proposal Accept/Reject
controls; the chat bar offers only "Accept all" / "Reject all." Users who want 8 of
10 must click each individually. Adding per-proposal selection + "Accept/Reject
selected" removes that friction (the #1 recommendation from the 006 spike).

## Current state (confirmed)

`packages/editor/src/core/extensions/atlas-doc-review/extension.ts`:

- `TAtlasDocReviewState` (line ~20) = `{ session, proposals, loading, decorations }`.
- `TAtlasDocReviewAction` (line 33) union: `start | append | update | remove | set-loading | clear`.
- `buildProposalControls(view, proposal)` (line ~196) builds the per-proposal control
  `<div class="atlas-doc-review-controls">` with `✓`/`✕` buttons that call
  `dispatchReviewEvent(view, "atlas-doc-review-accept"|"-reject", proposal.id)`.
- `buildDecorations(proposals, state)` (post-004) is called on proposal-set changes;
  the cached `DecorationSet` lives in plugin state and is mapped on other transactions.
- `addCommands()` (line ~285) exposes `acceptAtlasProposal`/`rejectAtlasProposal`/
  `acceptAllAtlasProposals`/`rejectAllAtlasProposals` etc.
- `props.handleDOMEvents` (line ~460): `atlas-doc-review-accept`/`-reject`/`-accept-all`/`-reject-all`.
- `acceptAllProposals` (line ~168) deletes targets high-to-low so positions stay valid — mirror this for "accept selected".

`packages/editor/src/core/helpers/editor-ref.ts` (line ~283+) and
`packages/editor/src/core/types/editor.ts` (line ~150+) define the `EditorRefApi`
atlas methods (`acceptAtlasProposal`, `getActiveAtlasProposalCount`, etc.).

`apps/web/core/components/agent/agent-dispatch-listener.tsx`:

- `getActiveAtlasProposalCount()` is polled into `pendingProposals` state (~line 489).
- "Accept all"/"Reject all" buttons render at ~line 1140 via `activePageEditorRef`.

## Commands you will need

| Purpose          | Command                                                                         | Expected                             |
| ---------------- | ------------------------------------------------------------------------------- | ------------------------------------ |
| Install          | `pnpm install` (worktree has no node_modules; hardlinks from the store — cheap) | ok                                   |
| Build editor     | `pnpm turbo run build --filter=@plane/editor`                                   | success (web reads editor from dist) |
| Typecheck editor | `pnpm turbo run check:types --filter=@plane/editor`                             | exit 0                               |
| Typecheck web    | `pnpm turbo run check:types --filter=web`                                       | exit 0                               |
| Lint             | `pnpm check:lint`                                                               | no new errors                        |

## Scope

**In scope**:

- `packages/editor/src/core/extensions/atlas-doc-review/extension.ts` — selection state + toggle action + accept/reject-selected commands + a select toggle in the control widget.
- `packages/editor/src/core/helpers/editor-ref.ts` — new ref methods.
- `packages/editor/src/core/types/editor.ts` — new method signatures on `EditorRefApi`.
- `apps/web/core/components/agent/agent-dispatch-listener.tsx` — "Accept/Reject selected (n)" UI.
- `packages/editor/src/styles/dragonfruit.css` (or wherever `.atlas-doc-review-controls` is styled) — minimal style for the select toggle + selected state. (Grep for `atlas-doc-review` to find the file.)

**Out of scope**:

- The accept/reject _mechanics_ (`acceptProposal`/`rejectProposal`) — reuse them per-id; don't change how a single accept works.
- Draft mode / undo / revert (that's the deferred 013).
- Any change to streaming/append or the doc-write backend.

## Git workflow

- Branch: `advisor/012-doc-write-multiselect`
- Commits: editor change, then web change (each typechecks). Do NOT push/PR.

## Steps

### Step 1: Selection state + toggle action (extension.ts)

- Add `selectedIds: string[]` to `TAtlasDocReviewState`; init `[]` in `initialState`.
- Add `{ type: "toggle-select"; id: string }` to `TAtlasDocReviewAction`.
- In `apply()`:
  - Carry `selectedIds` through `mapped`, **pruned to ids still present in
    `mappedProposals`** (so accept/reject/clear drop stale selections).
  - Handle `toggle-select`: toggle `action.id` in `selectedIds`. **Because the 004
    decoration cache only rebuilds on proposal-set changes, `toggle-select` MUST also
    rebuild decorations** so the widget reflects the new selected state — return
    `{ ...mapped, selectedIds: <toggled>, decorations: buildDecorations(mapped.proposals, <toggled>, newState) }`.
  - On `remove`/`clear`/`start`: ensure `selectedIds` is cleared of the affected ids (clear/start → `[]`).
- Change `buildDecorations(proposals, state)` → `buildDecorations(proposals, selectedIds, state)`
  and pass `selectedIds` to `buildProposalControls` so it can render selected state.
  Update the prop `decorations` reader and every `buildDecorations(...)` call site
  (append/update/remove) to pass the current `selectedIds`.

### Step 2: Select toggle in the control widget (extension.ts)

In `buildProposalControls(view, proposal, isSelected)`, prepend a toggle button
(e.g. a checkbox-style `<button class="atlas-doc-review-select" aria-pressed=...>`)
that, on click, calls `dispatchReviewEvent(view, "atlas-doc-review-toggle-select", proposal.id)`.
Reflect `isSelected` via a class / `aria-pressed`. Add the
`"atlas-doc-review-toggle-select"` handler to `props.handleDOMEvents` that dispatches
the `toggle-select` action. Style `.atlas-doc-review-select` and its selected state
minimally in the existing atlas-doc-review CSS (match the existing control look).

### Step 3: Commands + editor-ref + types

- extension `addCommands()`: add `toggleAtlasProposalSelection(id)`,
  `acceptSelectedAtlasProposals()`, `rejectSelectedAtlasProposals()`. The
  accept/reject-selected commands operate ONLY on `selectedIds`, deleting
  targets/ranges **high-to-low** (mirror `acceptAllProposals`/`rejectAllProposals`),
  then `clear` the selection for those ids.
- `editor-ref.ts`: expose `toggleAtlasProposalSelection(id)`,
  `getSelectedAtlasProposalCount()` (read `getReviewState(state).selectedIds.length`),
  `acceptSelectedAtlasProposals()`, `rejectSelectedAtlasProposals()`.
- `types/editor.ts`: add the four signatures to `EditorRefApi`.

**Verify**: `pnpm turbo run check:types --filter=@plane/editor` exit 0, then
`pnpm turbo run build --filter=@plane/editor` success.

### Step 4: Chat-bar "Accept/Reject selected (n)" (agent-dispatch-listener.tsx)

Mirror the existing `pendingProposals` sync to also track
`selectedProposals = activePageEditorRef.getSelectedAtlasProposalCount()`. When
`selectedProposals > 0`, render "Accept selected (n)" / "Reject selected (n)" buttons
next to the existing Accept all / Reject all (reuse their styling), wired to
`acceptSelectedAtlasProposals()` / `rejectSelectedAtlasProposals()`. Keep Accept
all / Reject all unchanged.

**Verify**: `pnpm turbo run check:types --filter=web` exit 0; `pnpm check:lint` no new errors.

## Test plan

- No runtime test harness on web/editor here. If `packages/editor` has Vitest, add a
  unit test that `toggle-select` toggles `selectedIds` and that
  `acceptSelectedAtlasProposals` only touches selected ids. Otherwise verification is
  typecheck + build + lint, and the reviewer smoke-tests:
  1. Trigger ≥2 Atlas proposals in a doc.
  2. Toggle-select a subset → chat bar shows "Accept selected (n)".
  3. "Accept selected" applies only the selected ones; the rest remain pending.
  4. "Reject selected" removes only the selected written-in content.
  5. Accept all / Reject all still work; selection clears appropriately.

## Done criteria

- [ ] `pnpm turbo run check:types --filter=@plane/editor` and `--filter=web` exit 0
- [ ] `pnpm turbo run build --filter=@plane/editor` succeeds
- [ ] `pnpm check:lint` — no new errors
- [ ] `grep -n "toggle-select\|selectedIds\|acceptSelectedAtlasProposals" packages/editor/src/core/extensions/atlas-doc-review/extension.ts` shows the new wiring
- [ ] `getSelectedAtlasProposalCount`/`acceptSelectedAtlasProposals`/`rejectSelectedAtlasProposals`/`toggleAtlasProposalSelection` exist in editor-ref.ts AND types/editor.ts
- [ ] Accept all / Reject all behavior unchanged
- [ ] Only in-scope files modified (`git status`)
- [ ] Report what was verified + that runtime smoke is pending the reviewer

## STOP conditions

- Toggling selection does NOT visually update the checkbox because decorations aren't
  rebuilt — you must include `toggle-select` in the decoration-rebuild path (Step 1);
  if that proves infeasible with the 004 cache, STOP and report.
- "Accept selected" applied to a subset corrupts positions (didn't go high-to-low) —
  fix to mirror `acceptAllProposals`; if still wrong, report.
- The change would alter Accept all / Reject all behavior — back out, report.
- `editor-ref`/`types` shape makes adding methods non-trivial (e.g. generated types) — report.

## Maintenance notes

- Selection is keyed by stable proposal id, so it survives position remapping; the
  prune-on-proposal-change keeps it from referencing removed proposals.
- This sets up plan 013 (snapshot-revert) — both live in the same review surface.
- Reviewer should scrutinize the `toggle-select` → decoration-rebuild interaction
  (the 004 cache) and the high-to-low deletion in accept/reject-selected.
