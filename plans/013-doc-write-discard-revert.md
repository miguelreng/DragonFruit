# Plan 013: "Discard Atlas changes" — revert doc-write to the pre-session snapshot

> **Executor instructions**: Additive feature. The discard path REPLACES document
> content, so correctness matters — it must reconcile _in place_ (no duplication)
> and must be guarded by a confirm. Follow step by step; run every verification.
> Touch only in-scope files. `@plane/editor` is consumed by `web` from dist —
> rebuild after editing. No runtime test harness — verification is typecheck +
> editor build + lint; the reviewer smoke-tests. If a STOP condition occurs, stop
> and report. Commit per the git workflow. SKIP updating plans/README.md. Reply with
> the report format at the end.
>
> **Drift check (run first)**: `git diff --stat 0714cde538..HEAD -- packages/editor/src/core/helpers/editor-ref.ts packages/editor/src/core/types/editor.ts packages/editor/src/core/extensions/atlas-doc-review/extension.ts apps/web/core/components/agent/agent-dispatch-listener.tsx`

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: MED-HIGH (discard replaces document content; a bug = lost work). Hold for a runtime smoke before merge.
- **Depends on**: the existing `replaceProviderDocumentFromHTML` (already in editor-ref) and 012 (same review surface).
- **Category**: direction / feature
- **Planned at**: commit `0714cde538`, 2026-06-10
- **Design decision (advisor default, per 006-findings B2)**: use a **session-start
  snapshot + in-place reconcile**, NOT page-history. Self-contained, reuses the
  proven `replaceProviderDocumentFromHTML` (updateYFragment → no duplicate-on-merge).

## Why this matters

Atlas writes proposals directly into the doc; today the only exits are accept/reject
(per-proposal or all). There's no single "undo the whole Atlas session." The 006
spike recommended a snapshot-revert as the safety net that makes users trust
write-mode. This adds "Discard Atlas changes" → reverts the document to its state at
session start.

## Current state (confirmed)

- `apps/web/core/components/agent/agent-dispatch-listener.tsx`:
  - `startAtlasReviewSession({...})` is called at the START of a doc-write dispatch
    (line ~296 and ~320), BEFORE any `appendAtlasProposal`. So the doc at that moment
    is the pre-Atlas state.
  - `activePageEditorRef.getDocument()` returns `{ binary, html, json }` — use `.html`
    for the snapshot.
  - The chat bar renders Accept all / Reject all (and now Accept/Reject selected) at ~line 1140–1182.
- `packages/editor/src/core/helpers/editor-ref.ts:289` already exposes
  `replaceProviderDocumentFromHTML(html, title?)` — reconciles the provider doc to
  `html` **in place** via `replaceDocumentEditorYDocFromHTML`/`updateYFragment` (the
  collaborative-safe path; do NOT use a fresh-rooted blob).
- The review plugin's `{ type: "clear" }` action resets plugin state WITHOUT touching
  the doc (whereas `acceptAll`/`rejectAll` mutate the doc then clear). There is no
  editor-ref method that dispatches a bare `clear` yet — add one.

## Commands you will need

| Purpose          | Command                                             | Expected      |
| ---------------- | --------------------------------------------------- | ------------- |
| Install          | `pnpm install` (worktree; hardlinks from store)     | ok            |
| Build editor     | `pnpm turbo run build --filter=@plane/editor`       | success       |
| Typecheck editor | `pnpm turbo run check:types --filter=@plane/editor` | exit 0        |
| Typecheck web    | `pnpm turbo run check:types --filter=web`           | exit 0        |
| Lint             | `pnpm check:lint`                                   | no new errors |

## Scope

**In scope**:

- `packages/editor/src/core/extensions/atlas-doc-review/extension.ts` — add a `clearAtlasReview` command that dispatches `{ type: "clear" }` (reset plugin state, no doc mutation).
- `packages/editor/src/core/helpers/editor-ref.ts` — add `clearAtlasReview()`.
- `packages/editor/src/core/types/editor.ts` — add `clearAtlasReview: () => void` to `EditorRefApi`.
- `apps/web/core/components/agent/agent-dispatch-listener.tsx` — capture the snapshot at session start; add a "Discard Atlas changes" button (with confirm) that reverts.

**Out of scope**:

- Accept/reject (per-proposal, all, selected) — unchanged.
- `replaceProviderDocumentFromHTML` internals — reuse as-is.
- Page version history — explicitly not this approach.

## Git workflow

- Branch: `advisor/013-doc-write-discard-revert`
- Commits: editor (clear command + ref), then web (snapshot + discard UI). Each typechecks. Do NOT push/PR.

## Steps

### Step 1: `clearAtlasReview` (editor)

- extension `addCommands()`: add `clearAtlasReview` that does
  `dispatch?.(tr.setMeta(atlasDocReviewPluginKey, { type: "clear" }))` (reset state,
  no doc edit). Mirror the existing command shape.
- `editor-ref.ts`: add `clearAtlasReview: () => editor?.commands.clearAtlasReview()`.
- `types/editor.ts`: add `clearAtlasReview: () => void;` to `CoreEditorRefApi`.

**Verify**: `pnpm turbo run check:types --filter=@plane/editor` exit 0, then build success.

### Step 2: Capture the snapshot at session start (listener)

In `agent-dispatch-listener.tsx`, immediately BEFORE each `startAtlasReviewSession(...)`
call (lines ~296 and ~320), capture `const snapshot = activePageEditorRef.getDocument().html`
and store it in a ref scoped to the active page/session (e.g. `atlasSnapshotRef.current = snapshot`).
Clear the ref when the session ends (no pending proposals / on accept-all / reject-all
/ discard) so a stale snapshot can't be applied later.

### Step 3: "Discard Atlas changes" button (listener)

Next to Accept all / Reject all, when a session is active with pending proposals AND
a snapshot exists, render a "Discard Atlas changes" button. On click:

1. Show a confirm (native `window.confirm` or the app's existing confirm/modal
   pattern — grep for one): "Discard Atlas's changes and revert the document to
   before this session? This also discards any manual edits you made since."
   (The revert reconciles to the session-start snapshot, so manual edits made during
   the session are also reverted — call this out in the confirm copy.)
2. On confirm: `activePageEditorRef.replaceProviderDocumentFromHTML(snapshot)` then
   `activePageEditorRef.clearAtlasReview()`; clear the snapshot ref.

**Verify**: `pnpm turbo run check:types --filter=web` exit 0; `pnpm check:lint` no new errors.

## Test plan

- No runtime harness. If `packages/editor` has Vitest, add a unit test that
  `clearAtlasReview` resets plugin state without changing the doc.
- Reviewer smoke (REQUIRED before merge — this replaces content):
  1. Doc with existing content → start an Atlas doc-write with ≥2 proposals.
  2. "Discard Atlas changes" → confirm → document returns EXACTLY to its pre-Atlas
     content; no proposal highlights remain; no duplicated content.
  3. Make a manual edit during a session, then discard → confirm the copy warned that
     manual edits are reverted, and behavior matches.
  4. Accept all / Reject all / selected still work; discard button hidden when no session.
  5. Collaborative: a second editor sees the revert (in-place reconcile propagates).

## Done criteria

- [ ] `clearAtlasReview` exists in extension commands, editor-ref.ts, and types/editor.ts
- [ ] Snapshot captured at session start; cleared on session end/discard
- [ ] "Discard Atlas changes" reverts via `replaceProviderDocumentFromHTML` + `clearAtlasReview`, behind a confirm whose copy warns about manual edits
- [ ] `pnpm turbo run check:types --filter=@plane/editor` and `--filter=web` exit 0; editor build succeeds; lint no new errors
- [ ] Accept/reject (all/selected/per-proposal) unchanged
- [ ] Only in-scope files modified (`git status`)
- [ ] Report: what verified + that runtime smoke is REQUIRED before merge (content-replacing)

## STOP conditions

- The revert duplicates content instead of replacing it — you used a fresh-rooted blob
  somewhere instead of the in-place `replaceProviderDocumentFromHTML`; fix or report.
- After revert, stale proposal decorations remain (you didn't `clearAtlasReview`, or
  cleared it before the reconcile) — order matters: reconcile, THEN clear.
- The snapshot can't be reliably captured at session start (e.g. `getDocument()` not
  available there) — report.
- Capturing/holding the snapshot would require editor-plugin state changes beyond a
  listener ref — report before expanding scope into the plugin.

## Maintenance notes

- **Known limitation (intended for v1)**: discard reverts to the session-start
  snapshot, so manual edits made during the session are also reverted — hence the
  confirm copy. A future version could diff-preserve manual edits, but that's a much
  larger change.
- This must keep using the in-place reconcile — never swap in an independently-rooted
  Yjs blob (the documented duplicate-on-merge bug; see `yjs-utils.ts`).
- **Do not auto-merge**: content-replacing; requires the runtime smoke above.
