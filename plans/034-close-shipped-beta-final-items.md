# Plan 034: Close the shipped Beta-final items with regression evidence

> **Executor instructions**: This is a verification-and-closure plan. Do not
> reimplement features that are already present. Run each gate, add only a
> narrowly missing regression test when a gate is not represented, and record
> the result in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat d2ca9cd196..HEAD -- apps/api/plane/app/views/search apps/api/plane/bgtasks/agent_dispatch_task.py apps/api/plane/db/models/issue.py apps/live packages/editor apps/web/core/components/agent-chat apps/web/core/components/pages/pdf`
> Stop if a later commit intentionally reverted one of the commits listed below.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `d2ca9cd196`, 2026-07-30

## Why this matters

Five screenshot entries are no longer implementation work. Leaving them in the
active backlog would duplicate shipped code and hide the actual release risk:
whether the behavior still works together on the current build. This plan closes
them with commit evidence, automated regression coverage, and a short runtime
smoke.

## Items covered and evidence

| Screenshot item                                  | Shipped evidence                         | Primary regression surface                                     |
| ------------------------------------------------ | ---------------------------------------- | -------------------------------------------------------------- |
| Collaborators online in docs editor              | `a2560e6a07`                             | `apps/live/tests/presence-auth.test.ts`, two-browser Doc smoke |
| Highlights when mentioning docs in Atlas sidebar | `c7e21aed9d7` plus screenshot correction | Mention parser tests and accent-token rendering                |
| Native PDF viewer                                | `b25cccf668` plus screenshot correction  | Custom PDF.js canvas viewer and scale-helper tests             |
| Atlas works without assignment/workflow consent  | `7633091f48`                             | `test_agent_dispatch_consent.py`                               |
| Cross-project document mentions                  | `64e1f00e69`                             | `test_entity_search_app.py`                                    |

Plan 029 and Plan 030 were also implemented by `a2560e6a07`; their index rows
must be marked DONE rather than copied into a new implementation plan.

## Commands you will need

| Purpose             | Command                                                                                         | Expected on success |
| ------------------- | ----------------------------------------------------------------------------------------------- | ------------------- |
| Live presence tests | `pnpm --filter=live test -- presence-auth.test.ts`                                              | all tests pass      |
| Web focused tests   | `pnpm --filter=web test:unit -- --run apps/web/core/components/pages/sheet/sheet-utils.test.ts` | all tests pass      |
| Web types           | `pnpm --filter=web check:types`                                                                 | exit 0              |
| Editor types        | `pnpm --filter=@plane/editor check:types`                                                       | exit 0              |
| API consent tests   | `cd apps/api && python -m pytest plane/tests/unit/bg_tasks/test_agent_dispatch_consent.py -q`   | all tests pass      |
| API search tests    | `cd apps/api && python -m pytest plane/tests/contract/app/test_entity_search_app.py -q`         | all tests pass      |
| API page tests      | `cd apps/api && python -m pytest plane/tests/contract/app/test_page_app.py -q`                  | all tests pass      |

## Scope

**In scope**:

- Running the gates above.
- Adding a pure unit test for `getAtlasPromptHighlightParts` if no existing test
  proves multiple mentions and ordinary text are split correctly.
- Updating shipped statuses and noting the runtime smoke in `plans/README.md`.

**Out of scope**:

- Reworking search or Atlas authorization.
- PDF annotations, text selection, or a full document-search layer.
- Expanding mention highlighting beyond the Atlas composer unless a separate
  acceptance criterion asks for sent-message highlighting.

## Steps

### Step 1: Confirm the shipped commits are ancestors of `HEAD`

Run:

```bash
for sha in a2560e6a07 c7e21aed9d7 b25cccf668 7633091f48 64e1f00e69; do
  git merge-base --is-ancestor "$sha" HEAD || exit 1
done
```

**Verify**: exit 0.

### Step 2: Run the automated gates

Run every command in the command table. If the local API services required by
the contract tests are unavailable, record the environmental blocker; do not
rewrite tests to avoid infrastructure.

**Verify**: each runnable gate exits 0.

### Step 3: Fill only evidenced regression gaps

Use `rg` to confirm whether `getAtlasPromptHighlightParts` has direct
assertions. If absent, add one focused test beside the closest existing tests.
Do not alter production behavior as part of this plan.

**Verify**: the new focused test passes and the corresponding package typecheck
still exits 0.

### Step 4: Runtime smoke the user-visible paths

Use two authenticated browser sessions to open the same Doc and confirm:

1. the current user's named avatar appears when they are alone;
2. configured user profile pictures render, with initials fallback;
3. an actively typing user shows a pulse that becomes static under reduced
   motion and expires after editing stops;
4. both collaborator avatars appear;
5. a remote caret/selection appears and disappears after disconnect;
6. `@` search can insert a Doc from another project;
7. the Atlas composer highlights inserted Doc tokens;
8. a PDF page opens in the custom app viewer and page, zoom, fit, rotate, and
   download controls work without exposing Chrome's PDF surface.

Record pass/fail in the Plan 034 row. A failure becomes a new bug with exact
reproduction steps; it does not reopen all six features.

## Execution evidence — 2026-07-30

- All five listed shipped commits are ancestors of `HEAD`.
- Live presence authorization: `apps/live/tests/presence-auth.test.ts` passed
  (1 test).
- Presence acceptance follow-up: the local participant is seeded before
  awareness connects, profile-picture URLs flow through Doc and Sheet identity,
  remote identity falls back to awareness while member data loads, and recent
  text input drives a four-second edit pulse. Four focused state tests plus
  Editor and Web typechecks pass.
- Atlas mention highlighting now has direct coverage for multiple mentions,
  punctuation boundaries, and email addresses (3 tests), and inserted mentions
  use `text-accent-primary` instead of a hard-coded pink.
- The PDF iframe was replaced with a PDF.js canvas viewer with in-app page,
  zoom/fit, rotate, download, progress, retry, and unavailable states. Its
  scale helpers have 3 focused tests, and the production build emits the PDF
  worker asset successfully.
- Focused Web sheet/PDF URL, API consent/search/page, and native-PDF endpoint
  tests passed. `@plane/editor` typecheck also passed.
- The global Web typecheck passes after correcting six localized compatibility
  issues: optional mention IDs, Solar icon prop types, the Project checklist
  reorder handler, custom-field metadata narrowing, and pre-ES2023 sorting.
- Browser smoke is still open. The Web development server returned HTTP 200,
  but without the local API/auth stack the page remained at the DragonFruit
  loading screen, so the two-session and PDF UI matrix could not be exercised.

## Done criteria

- [x] Every listed commit is an ancestor of `HEAD`.
- [x] Automated gates pass, or an environmental blocker is recorded verbatim.
- [x] Any truly missing narrow regression tests were added and pass.
- [ ] The eight-step runtime smoke is recorded.
- [ ] Plans 029 and 030 and all six screenshot items are marked DONE or linked
      to a newly reproduced bug.

## STOP conditions

- A listed commit is not an ancestor of `HEAD`.
- Current behavior intentionally differs from the item description.
- A runtime failure cannot be reproduced twice with the same steps.
- Fixing a failure would require product work; file a dedicated follow-up
  instead of broadening this closure plan.
