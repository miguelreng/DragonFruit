# Plan 006 (design/spike): A safety net for Atlas doc-write — undo, multi-select, draft mode

> **Executor instructions**: This is a DESIGN/SPIKE plan, not a build-everything
> plan. Your deliverable is an investigation write-up + a small, optional
> prototype behind a flag — NOT a shipped feature. Do not implement the full
> feature. Update `plans/README.md` when done. Obey STOP conditions.
>
> **Drift check (run first)**: `git diff --stat 866fb1777f..HEAD -- apps/web/core/components/agent/agent-dispatch-listener.tsx packages/editor/src/core/extensions/atlas-doc-review/`
> Re-read the live code; the line numbers below are leads, not facts.

## Status

- **Priority**: P2 (direction — maintainer's call on whether to build)
- **Effort**: M (spike); the full feature is L
- **Risk**: MED
- **Depends on**: none (benefits from 002's test net if built later)
- **Category**: direction
- **Planned at**: commit `866fb1777f`, 2026-06-10

## Why this matters

Atlas can propose edits directly into a document, and the user accepts or rejects
them. Today the controls are **"Accept all" / "Reject all"** only
(`agent-dispatch-listener.tsx` ~line 1140), and once accepted, a proposal is baked
into the live Yjs document with no "undo last accept" and no "revert to the
pre-Atlas version." There's also no way to accept a subset (8 of 10) without
clicking through them individually, and no "draft mode" where proposals are staged
without touching the live doc until the user commits. The grounded signal: the
write-mode controls are asymmetric (bulk accept/reject exists, granular + reversible
control doesn't), and this is exactly the friction that makes users prefer the safer
"answer in chat" mode over the more powerful "write into the doc" mode. This spike
decides whether and how to close that gap.

## Current state (leads to confirm, not facts)

- `apps/web/core/components/agent/agent-dispatch-listener.tsx` (~1140) — renders the
  "Accept all" / "Reject all" affordance for pending proposals.
- `packages/editor/src/core/extensions/atlas-doc-review/extension.ts` — the
  ProseMirror plugin that tracks proposals (`getReviewState`, proposal `status` of
  `accepted`/`rejected`/pending) and renders accept/reject controls; the editor-ref
  exposes `acceptAtlasProposal` / `rejectAtlasProposal` / `acceptAllAtlasProposals`
  / `rejectAllAtlasProposals` (see `packages/editor/src/core/types/editor.ts`).
- Acceptance mutates the live collaborative doc; page history is the only existing
  "undo" and it isn't surfaced as an Atlas-aware revert.

## Commands you will need

| Purpose      | Command                                                          | Expected |
| ------------ | ---------------------------------------------------------------- | -------- |
| Typecheck    | `pnpm turbo run check:types --filter=web --filter=@plane/editor` | exit 0   |
| Build editor | `pnpm turbo run build --filter=@plane/editor`                    | success  |

## Scope

**In scope** (deliverables of the spike):

- `plans/006-findings.md` (create) — the investigation write-up (see Steps).
- OPTIONAL, only if low-risk and flag-gated: a prototype of **multi-select +
  "Accept selected"** in the editor extension + listener, behind an off-by-default
  flag, with no change to default behavior.

**Out of scope**:

- Shipping draft mode, version snapshots, or revert as default behavior.
- Any backend/schema change (page version history design is a write-up item, not an implementation).
- Changing the existing Accept all / Reject all default behavior.

## Git workflow

- Branch: `advisor/006-doc-write-safety-net-spike`
- Commit the write-up first; any prototype goes in a separate, clearly-labeled commit.

## Steps

### Step 1: Map the current accept/reject data flow

Read the listener + extension + editor-ref and write, in `plans/006-findings.md`:

- Where proposals originate, how `status` transitions, and exactly what mutates the
  Yjs doc on accept (is it reversible via the existing reconcile helpers?).
- Whether page version history already snapshots enough to implement "revert to
  pre-Atlas" without new storage.

**Verify**: write-up section exists and cites real `file:line`.

### Step 2: Evaluate three options against the code

For each of **undo-last-accept**, **multi-select + accept-selected**, and
**draft/staged mode**, document: implementation sketch, blast radius (files), Yjs
correctness risk (does it interact with the duplicate-on-merge reconcile behavior
documented in `packages/editor/src/core/helpers/yjs-utils.ts`?), and a coarse
effort estimate. Recommend an ordering (likely: multi-select first — additive and
low-risk; revert second; full draft mode last).

**Verify**: write-up has a comparison table + a recommendation with rationale.

### Step 3 (optional prototype): multi-select, flag-gated

ONLY if Step 2 confirms it's additive and low-risk: prototype proposal multi-select

- "Accept selected" behind an off-by-default flag, reusing the existing
  `acceptAtlasProposal` editor-ref command per selected id. Default behavior (Accept
  all / Reject all) must be untouched.

**Verify**: `pnpm turbo run check:types --filter=web --filter=@plane/editor` → exit 0; `pnpm turbo run build --filter=@plane/editor` → success. With the flag off, the UI is identical to today.

### Step 4: List open questions for the maintainer

End the write-up with explicit decisions the maintainer must make (e.g. "should
draft mode isolate proposals from collaborators until commit?", "is page-history
revert acceptable or do we need an Atlas-specific snapshot?").

## Test plan

- Spike: no automated tests required for the write-up. If the optional prototype is
  built, add (if `packages/editor` has Vitest) a test that with the flag off, the
  exposed commands and rendered controls match current behavior.

## Done criteria

- [ ] `plans/006-findings.md` exists with: data-flow map (Step 1), three-option comparison + recommendation (Step 2), open questions (Step 4), all citing real `file:line`
- [ ] If a prototype was built: it is flag-gated off by default, `--filter=web --filter=@plane/editor` typecheck passes, editor build succeeds, and default behavior is unchanged
- [ ] No default-path behavior changed; no backend/schema change
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- Accept mutates the Yjs doc in a way that can't be cleanly reverted with existing helpers (revert becomes a much larger effort) — document and stop, don't invent a snapshot system here.
- The optional prototype can't be flag-gated without touching default behavior.
- The investigation reveals a simpler win than the three options (e.g. accept is already reversible via an existing command) — report it instead of building.

## Maintenance notes

- This plan deliberately produces a decision artifact, not a feature. The maintainer chooses what (if anything) to build next from the recommendation.
- Any real implementation must respect the documented Yjs reconcile behavior (duplicate-on-merge) — see `packages/editor/src/core/helpers/yjs-utils.ts` and the prior meeting-notes duplication fix.
