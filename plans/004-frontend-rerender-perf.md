# Plan 004: Cut re-render and decoration churn in chat, bookmarks, and doc-review

> **Executor instructions**: Follow step by step; run every verification command
> and confirm before moving on. STOP conditions are real — obey them. Update
> `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 866fb1777f..HEAD -- apps/web/core/components/agent-chat/agent-chat-drawer.tsx apps/web/core/components/bookmarks/bookmark-board.tsx packages/editor/src/core/extensions/atlas-doc-review/extension.ts`
> On any change, compare "Current state" excerpts to live code; mismatch = STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `866fb1777f`, 2026-06-10

## Why this matters

Three custom surfaces re-render or recompute more than they need to:

1. The agent chat message list re-renders every row on each keystroke in the
   composer, because `MessageRow` isn't memoized and the list isn't keyed for
   stability under a changing draft.
2. The bookmark board renders every card with no virtualization, so a project
   with hundreds of bookmarks rebuilds the whole grid on each search keystroke or
   selection change.
3. The Atlas doc-review ProseMirror plugin rebuilds its full `DecorationSet` on
   every editor state change, even when the proposal set hasn't changed.

None of these is a correctness bug; they're responsiveness costs that show up as
typing jank and slow scrolling at realistic data sizes. Fix the cheap, low-risk
ones first (memoization, decoration caching) and treat virtualization as the
larger, riskier change.

## Current state

- `apps/web/core/components/agent-chat/agent-chat-drawer.tsx:844-848` — the list maps
  messages to `MessageRow` directly:

  ```tsx
  <ul className="flex flex-col gap-4">
    {messages.map((m) => (
      <MessageRow key={m.id} message={m} agent={agent} />
    ))}
  ```

  The composer's `setDraft` (in the same component) updates state on each keystroke,
  re-rendering the parent and thus every `MessageRow`. Confirm whether `MessageRow`
  is wrapped in `observer`/`React.memo` before changing anything.

- `apps/web/core/components/bookmarks/bookmark-board.tsx` — `filteredBookmarks` is a
  `useMemo` (~line 880) rendered into a grid/list (~lines 1338, 1359) with **no
  virtualization** (`grep -c "react-window\|virtual\|Virtuoso"` returns 0).

- `packages/editor/src/core/extensions/atlas-doc-review/extension.ts:238` —
  `buildDecorations(state)` filters proposals and constructs `Decoration`s on each
  call:

  ```ts
  const buildDecorations = (state: EditorState) => {
    const reviewState = getReviewState(state);
    const visibleProposals = reviewState.proposals.filter(
      (proposal) => !["accepted", "rejected"].includes(proposal.status)
    );
    const decorations: Decoration[] = [];
    ...
  ```

- Conventions: the repo uses MobX `observer` components and HugeIcons; shared motion
  lives in tailwind config (`t-*` classes). For React idioms, a
  `vercel:react-best-practices` skill may be available — use it for the memoization.

## Commands you will need

| Purpose          | Command                                             | Expected                                |
| ---------------- | --------------------------------------------------- | --------------------------------------- |
| Typecheck web    | `pnpm turbo run check:types --filter=web`           | exit 0                                  |
| Build editor     | `pnpm turbo run build --filter=@plane/editor`       | success (web consumes editor from dist) |
| Typecheck editor | `pnpm turbo run check:types --filter=@plane/editor` | exit 0                                  |
| Lint             | `pnpm check:lint`                                   | exit 0                                  |

NOTE: `@plane/editor` is consumed by `web` from its prebuilt `dist`. After editing
editor source you MUST rebuild it or web won't see the change.

## Scope

**In scope**:

- `apps/web/core/components/agent-chat/agent-chat-drawer.tsx` — memoize `MessageRow`.
- `packages/editor/src/core/extensions/atlas-doc-review/extension.ts` — cache the `DecorationSet`.
- `apps/web/core/components/bookmarks/bookmark-board.tsx` — virtualize the list (only if Step 3's preconditions hold).

**Out of scope**:

- Changing message/bookmark data models, services, or store shapes.
- Restructuring the chat drawer or bookmark board beyond the targeted changes.
- Any visual/layout change — these are behavior-preserving perf changes.

## Git workflow

- Branch: `advisor/004-frontend-rerender-perf`
- Commit per surface (3 commits): chat memo, doc-review cache, bookmark virtualization.
- Do each step independently; each must typecheck before the next.

## Steps

### Step 1: Memoize `MessageRow` (low risk)

Find the `MessageRow` definition in `agent-chat-drawer.tsx`. If it is a plain
function component, wrap its export in `React.memo` (and keep `observer` if it
reads MobX — order: `observer(memo(...))` or `memo(observer(...))` per the repo's
existing pattern; search the codebase for an existing `memo(observer` usage and
match it). Ensure props are stable: `agent` should be referentially stable across
keystrokes (it is, unless re-created in render — verify and, if needed, hoist it).
Do not change `MessageRow`'s internals.

**Verify**: `pnpm turbo run check:types --filter=web` → exit 0. Manually reason: a
keystroke in the composer now re-renders only the composer subtree, not each row
(rows are memoized on `message`/`agent`).

### Step 2: Cache the doc-review `DecorationSet` (low risk)

In `extension.ts`, avoid rebuilding decorations when the visible-proposal set is
unchanged. The ProseMirror-idiomatic way: in the plugin's `state.apply(tr, old)`,
map the previous `DecorationSet` through `tr.mapping` and only call
`buildDecorations` when the proposals actually changed (e.g. when a transaction
carries the review-state meta, or when the filtered proposal ids/length/status
differ from the cached signature). Keep a cached `{ signature, decorations }` and
short-circuit when the signature matches. Add a fast path: if `visibleProposals` is
empty, return `DecorationSet.empty`.

**Verify**: `pnpm turbo run check:types --filter=@plane/editor` → exit 0, then
`pnpm turbo run build --filter=@plane/editor` → success. Confirm decorations still
appear/disappear when a proposal is added/accepted (reason through the apply path;
if a dev server is available, verify visually).

### Step 3: Virtualize the bookmark list (medium risk — preconditions apply)

ONLY do this step if BOTH hold; otherwise STOP and report:

- a virtualization library is already a dependency (check `apps/web/package.json`
  for `react-window`, `@tanstack/react-virtual`, `virtua`, etc.), AND
- the bookmark selection / multi-select logic does not depend on all cards being
  mounted at once.

If a virtual library exists, wrap the grid/list render so only visible cards mount,
preserving: the existing card markup, hover-checkbox multi-select, and keyboard
behavior. If no library is present, do NOT add a new dependency in this plan —
report that virtualization needs a dependency decision and leave Steps 1–2 as the
delivered work.

**Verify**: `pnpm turbo run check:types --filter=web` → exit 0; scrolling a large
board mounts only visible rows (verify in dev if available).

## Test plan

- These are perf/UX changes with no unit-test harness on the web side yet (see plan
  002's deferred follow-up). Verification is typecheck + build + manual reasoning,
  plus visual check in a dev server if the executor has one.
- If `packages/editor` has any Vitest setup, add a small test that `buildDecorations`
  returns `DecorationSet.empty` for zero visible proposals and a stable reference
  when the signature is unchanged.

## Done criteria

ALL must hold:

- [ ] `pnpm turbo run check:types --filter=web` exits 0
- [ ] `pnpm turbo run check:types --filter=@plane/editor` exits 0 and `--filter=@plane/editor` build succeeds
- [ ] `pnpm check:lint` exits 0
- [ ] `MessageRow` is memoized (`grep -n "memo(" apps/web/core/components/agent-chat/agent-chat-drawer.tsx`)
- [ ] doc-review extension has an empty-proposals fast path and a cached DecorationSet (`grep -n "DecorationSet.empty\|signature" packages/editor/src/core/extensions/atlas-doc-review/extension.ts`)
- [ ] Step 3 either done (virtual lib already present) or explicitly reported as blocked on a dependency decision
- [ ] No files outside scope modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- Memoizing `MessageRow` would drop live updates (it reads a mutable MobX field not via `observer`) — report; the correct fix may be an `observer` wrap, not `memo`.
- The doc-review apply path is more complex than "rebuild on every change" and caching risks stale decorations after accept/reject — report the apply flow rather than guessing.
- Step 3 preconditions aren't met (no virtual lib, or selection needs all cards mounted).
- Any change alters visible layout or behavior.

## Maintenance notes

- If chat history grows large enough that even memoized rows lag, virtualize the message list too (same dependency decision as bookmarks).
- The decoration cache signature must include every field that affects rendering (id, status, range) — if proposals gain a new visible attribute later, update the signature.
- Reviewer should scrutinize the doc-review `state.apply` change most — that's where a caching bug would show as stale or missing highlights.
