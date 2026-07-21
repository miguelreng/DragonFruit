# Plan 030: Make version history reliable in Docs, Briefs, and Sheets

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer says they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 14428ae90e..HEAD -- apps/api/plane/bgtasks/page_version_task.py apps/api/plane/app/views/page apps/api/plane/app/serializers/page.py apps/api/plane/db/models/page.py apps/api/plane/db/migrations apps/api/plane/tests apps/web/core/components/pages apps/web/core/components/project/brief apps/web/core/services/page packages/types/src/page`
> If an in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. Stop on a
> material mismatch.

## Status

- **Priority**: P1
- **Effort**: M–L (roughly 4–7 engineering days including migration, tests, and three-surface QA)
- **Risk**: MED–HIGH — version capture and restore touch user content, asynchronous saves, and multiple page body formats
- **Depends on**: none; may ship before or after Plan 029
- **Category**: correctness + direction
- **Planned at**: commit `14428ae90e`, 2026-07-20

## Why this matters

DragonFruit already exposes a Version history option for Docs and has a
`PageVersion` model, but the current pipeline is not a reliable cross-surface
history. Capture is gated only by HTML changes, the task reads a non-existent or
incorrect `page.description` value instead of `description_json`, the UI always
previews versions as rich text, and Briefs/Sheets have no reachable history
control. Users should be able to inspect who saved a version, preview it in its
native surface, and restore it without destroying the current state.

The target is a bounded content history for Docs, project Briefs, and Sheets.
Restoring an older version must itself create a new current revision, leaving
the pre-restore state recoverable.

## Current state

- `apps/api/plane/db/models/page.py:464-488` defines `PageVersion` with
  `description_binary`, `description_html`, `description_json`, `owned_by`, and
  `last_saved_at`. It has enough body fields for Docs and Sheets but does not
  record which `page_type` the snapshot represents.
- `apps/api/plane/bgtasks/page_version_task.py:32-74` creates a version only when
  `description_html` changes, coalesces saves by the same user for ten minutes,
  and caps history at 20 entries. It currently assigns both update and create
  JSON from `page.description`:

  ```py
  if current_instance.get("description_html") != page.description_html:
      # ...
      page_version.description_json = page.description
      # ...
      PageVersion.objects.create(
          description_json=page.description,
          # ...
      )
  ```

  `Page` actually defines `description_json` at
  `apps/api/plane/db/models/page.py:78`; the task catches all exceptions at
  `:79-80`, so this failure can silently produce no history.

- `apps/api/plane/app/views/page/base.py:640-665` captures only the old HTML,
  saves the PATCH, and dispatches `track_page_version`. Sheet saves send only
  `description_json`, so their unchanged HTML cannot trigger a version.
- `apps/api/plane/app/views/page/version.py:16-31` supports listing and fetching
  versions with `ProjectPagePermission`. There is no restore action in the API
  URL table, even though
  `apps/web/core/services/page/project-page-version.service.ts:40-48` declares a
  POST to `/versions/<id>/restore/`.
- `apps/web/core/components/pages/version/history-modal.tsx:78-210` lists version
  author/time and displays an avatar, but always renders
  `PagesVersionEditor`. Its restore callback writes HTML through the current Doc
  editor ref.
- `apps/web/core/components/pages/version/editor.tsx:88-106` always interprets a
  version as Tiptap content and renders `DocumentEditor`. A Sheet snapshot cannot
  be previewed correctly there.
- `apps/web/core/components/pages/version/main-content.tsx:58-75` reduces restore
  to `handleRestore(versionDetails.description_html)`, discarding structured
  JSON and binary data from the callback contract.
- `apps/web/core/components/pages/editor/toolbar/options-dropdown.tsx:168-173`
  exposes Version history for normal Docs.
- `apps/web/core/components/project/brief/brief-root.tsx:135-180` owns the
  chromeless Brief actions and has only publish/lock controls; it does not expose
  history even though a Brief is a `page_type: "doc"` page.
- `apps/web/core/components/pages/sheet/sheet-editor.tsx:181-264` owns the live
  Sheet snapshot and persistence. A safe Sheet restore must update this local
  state through the same `commit`/persist path; changing the database behind the
  mounted editor would be overwritten by its next save.
- `packages/types/src/page/core.ts:117-131` already includes all three body
  formats in `TPageVersion`, but has no version `page_type`.
- No focused API or web tests currently cover `PageVersion`, version capture,
  preview dispatch, or restoration.

### Applicable repository conventions

- Work directly on `main`; do not create a branch or worktree.
- Keep strict TypeScript and typed Django/DRF boundaries.
- Use `Avatar` and existing date/time helpers in the history list.
- Use the current page service and permission classes; do not add a parallel
  version API stack.
- Unit/contract tests belong under `apps/api/plane/tests/`; pure web logic uses
  Vitest next to the page version components.
- Preserve current bounded retention unless product requirements change: at
  most 20 versions per page and one coalesced entry per actor within the defined
  ten-minute window.

## Commands you will need

| Purpose           | Command                                                                                                                                   | Expected on success |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Focused API tests | `cd apps/api && python -m pytest plane/tests/unit/bgtasks/test_page_version_task.py plane/tests/contract/app/test_page_version_app.py -q` | all pass            |
| Full API tests    | `pnpm test:api`                                                                                                                           | all pass            |
| Web unit tests    | `pnpm --filter=web test:unit`                                                                                                             | all pass            |
| Web types         | `pnpm --filter=web check:types`                                                                                                           | exit 0              |
| Focused lint      | `pnpm exec oxlint --deny-warnings <changed .ts/.tsx files>`                                                                               | exit 0              |
| Final checks      | `pnpm check`                                                                                                                              | exit 0              |

## Scope

**In scope**:

- `apps/api/plane/bgtasks/page_version_task.py`
- `apps/api/plane/app/views/page/base.py`
- `apps/api/plane/app/views/page/version.py`
- `apps/api/plane/app/urls/page.py`
- `apps/api/plane/app/serializers/page.py`
- `apps/api/plane/db/models/page.py`
- one new numbered migration under `apps/api/plane/db/migrations/`
- focused tests under `apps/api/plane/tests/unit/bgtasks/` and
  `apps/api/plane/tests/contract/app/`
- `packages/types/src/page/core.ts`
- `apps/web/core/services/page/project-page-version.service.ts`
- `apps/web/core/components/pages/version/`
- `apps/web/core/components/pages/sheet/sheet-editor.tsx`
- `apps/web/core/components/pages/sheet/sheet-version-preview.tsx` (create)
- `apps/web/core/components/pages/sheet/sheet-version.ts` and test (create)
- `apps/web/core/components/project/brief/brief-root.tsx`
- `apps/web/core/components/pages/editor/toolbar/options-dropdown.tsx` only as
  needed to pass the page-type-aware modal contract
- `plans/README.md` status row only

**Out of scope**:

- Presence, mouse pointers, avatar online rings, or awareness payloads (Plan 029).
- Character-by-character replay, named/manual snapshots, comments on versions,
  diffs, branches, merge UI, infinite history, export, or audit-log semantics.
- Whiteboard/PDF/folder version history in V1.
- Versioning page permissions, cover, icon, title, parent, labels, sharing, or
  other page metadata. V1 versions body content only.
- Converting Sheet persistence to Yjs/CRDT or altering its snapshot schema.
- Restoring by directly overwriting a mounted collaborative Doc from an API
  worker. Doc restore must flow through the active Yjs editor transaction.
- Deleting versions manually or changing the 20-version retention policy.

## Git workflow

- Stay on `main` and preserve all pre-existing changes.
- This plan was authored while unrelated Sticky/editor and dependency files were
  modified. Do not revert, overwrite, stage, or format those files.
- Before any commit, run `git status --short --branch` and confirm `## main`.
- Do not commit or push unless the operator explicitly asks. Pushing `main`
  deploys the services.

## Product behavior

- Show the same history list in Docs, Briefs, and Sheets: newest first, author
  avatar/name, date, time, and a clear `View only` state.
- Keep the existing coalescing policy visible in copy: versions are save points,
  not every keystroke. Do not imply a complete audit log.
- A version records `page_type` so preview dispatch is stable even if the live
  page type changes later. Backfill old rows from an unmistakable structured
  payload (`sheet_snapshot`/`excalidraw_snapshot`); otherwise default them to
  `doc`, because the legacy capture/UI path was rich-text-only.
- Docs and Briefs preview with the read-only Document editor; Sheets preview with
  a read-only native sheet grid using `description_json.sheet_snapshot`.
- Restore is available only to users who can edit content and when the page is
  not locked/archived.
- Restoring is non-destructive: the current body is retained as a version before
  the selected body becomes current. The restored state then appears as the
  newest version attributed to the restoring user.
- Version list/detail/restore must all enforce the same project page permission
  and page/version relationship; a version ID from another page must return the
  normal not-found/forbidden response.

## Steps

### Step 1: Characterize and repair page-version capture

Add focused tests before changing the task. Cover:

- first Doc save creates one version with binary/HTML/JSON and actor;
- repeated same-actor Doc saves inside ten minutes update/coalesce one row;
- a different actor creates a separate row;
- the 21st version removes only the oldest row;
- a Sheet JSON-only change creates a Sheet version;
- an identical canonical body creates no duplicate;
- exceptions are logged and observable in tests rather than silently accepted.

Replace the HTML-only comparison with a page-type-aware canonical body check:

- Doc/Brief: compare the current binary when available, otherwise normalized
  HTML/JSON fallback;
- Sheet: compare canonical `description_json.sheet_snapshot`;
- unsupported types: do not create a version.

Fix all `page.description` reads to `page.description_json`. Pass enough previous
state from `PagesDescriptionViewSet.partial_update` to distinguish a real body
change, but keep version creation based on the successfully saved current page.
Dispatch tracking for JSON-only Sheet saves as well as Doc saves. Use a shared
helper/constant for the ten-minute coalescing window and 20-row limit.

Do not allow concurrent Celery tasks to create duplicate adjacent versions.
Lock the page/latest-version rows in a transaction or use another database-safe
serialization strategy already accepted in the repo.

**Verify**:
`cd apps/api && python -m pytest plane/tests/unit/bgtasks/test_page_version_task.py -q`
→ all capture, dedupe, coalescing, attribution, and retention cases pass.

### Step 2: Record and expose the version page type

Add `page_type` to `PageVersion` using the same choices as `Page.page_type`, and
create a data migration for existing rows. Include it in list/detail serializers
and `TPageVersion`. Record it on every new/coalesced snapshot. The data migration
should recognize `description_json.sheet_snapshot` and
`description_json.excalidraw_snapshot`; treat remaining legacy rows as `doc`
rather than copying a possibly changed current page type.

The migration must be reversible and bounded: use a set-based update where
possible or an iterator/batched update rather than loading all versions in
memory.

**Verify**:
`cd apps/api && python manage.py makemigrations --check --dry-run` → reports no
uncommitted model changes after the new migration, and the focused version tests
pass.

### Step 3: Make the history UI page-type aware

Refactor `PageVersionHistoryModal` and `PageVersionsMainContent` so the selected
`TPageVersion`, not only `description_html`, reaches preview and restore
callbacks. Dispatch by `version.page_type`:

- `doc` → existing `PagesVersionEditor`;
- `sheet` → new `SheetVersionPreview` using the same parsing, sizing, formatting,
  formulas, tabs, and theme tokens as the live Sheet where practical, but with no
  editing, menus, persistence, awareness, or Atlas side effects;
- unsupported/invalid payload → explicit "This version cannot be previewed"
  state, never a blank rich-text editor.

Extract the minimum reusable read-only Sheet grid instead of mounting the full
2,000-line `SheetEditor` with disabled handlers. Keep large chart dependencies
lazy as in the live editor. Add pure tests for renderer dispatch, invalid JSON,
empty snapshot fallback, active-tab selection, and page-type mismatch.

**Verify**:
`pnpm --filter=web test:unit && pnpm --filter=web check:types` → all tests pass
and typecheck exits 0.

### Step 4: Expose history in Briefs and Sheets

- Keep the existing Doc Version history menu item.
- Add Version history to the Brief's existing three-dot menu next to Lock and
  mount the shared modal with the Brief page ID/project/workspace context.
- Add a compact History action to the Sheet title/toolbar area using the Solar
  history icon already re-exported by the web icon shims. It must remain
  available in read-only mode for users who may view versions; only Restore is
  permission-gated.

Do not create separate history implementations. All three entry points mount the
same modal and services with page-type-specific preview/restore callbacks.

**Verify**:
`pnpm --filter=web check:types` → exit 0; manual navigation confirms each surface
opens the same history list for the correct page ID.

### Step 5: Restore Docs/Briefs and Sheets without losing the current state

Before restore, create/confirm a version of the current body attributed to the
restoring user. Then:

- Doc/Brief restore calls the collaborative editor's existing
  `replaceProviderDocumentFromHTML` API (not `clearEditor` + `setEditorValue`) so
  the replacement is one Yjs successor transaction and connected collaborators
  receive it. Preserve title and metadata.
- Sheet restore uses a new strict version-payload validator based on the current
  Sheet schema; it must not let `getInitialSnapshot` silently coerce malformed
  version data into a fresh empty sheet. After validation, replace the mounted
  Sheet's local snapshot through a dedicated callback that uses the existing
  `commit`/persist path. Reset focused/editing cells, menus, selections, formula
  state, undo/redo boundaries, and active tab safely.
- After success, revalidate the version list and show the existing success toast.
  On failure, leave the modal open and the current body unchanged.

Remove the dead `ProjectPageVersionService.restoreVersion` method unless a real
server restore endpoint remains necessary after the client-safe design. Do not
add a misleading endpoint that can be overwritten by an open Yjs/Sheet client.

Test the safety snapshot, permission/lock/archive gating, cross-page version
rejection, Doc callback payload, Sheet state reset, failure rollback, and newest
version list revalidation.

**Verify**:
focused API contract tests and web unit tests all pass. In a two-browser Doc
smoke, restore updates both browsers without duplicated content; in a Sheet
smoke, restore survives reload and the pre-restore state remains selectable.

### Step 6: Run full regression and retention QA

Manually verify:

1. Edit a Doc as one user for several saves: one coalesced version appears with
   the correct actor. Edit as a second user: a separate version appears.
2. Open the same Doc in two browsers and restore: both converge to the restored
   body; the state from immediately before restore remains recoverable.
3. Repeat on a project Brief through its chromeless menu.
4. Change Sheet values, formulas, formatting, charts, tabs, row/column structure,
   and active tab. Preview and restore a version; reload and confirm the exact
   snapshot persists.
5. Attempt restore while locked, archived, read-only, and with a version ID from
   another page; no content changes.
6. Create more than 20 versions and confirm newest-first ordering and oldest-only
   pruning.

**Verify**:
`pnpm test:api && pnpm --filter=web test:unit && pnpm --filter=web check:types && pnpm check && git diff --check`
→ all commands exit 0.

## Test plan

- `apps/api/plane/tests/unit/bgtasks/test_page_version_task.py`: canonical
  comparison, Doc/Sheet capture, coalescing, concurrency, actor attribution,
  retention, and failure logging.
- `apps/api/plane/tests/contract/app/test_page_version_app.py`: list/detail
  permissions, page/version scoping, serialized page type, lock/archive/read-only
  restore gating if any server restore support is retained.
- Web pure tests under `apps/web/core/components/pages/version/`: type dispatch,
  invalid payload, restore callback selection, list revalidation.
- `apps/web/core/components/pages/sheet/sheet-version.test.ts`: parse preview,
  restore snapshot validation, state reset contract, no persistence in preview.
- Mandatory two-browser smoke for collaborative Doc/Brief restore and reload
  smoke for Sheet restore.

## Done criteria

- [ ] Docs, Briefs, and Sheets expose the same version-history modal.
- [ ] Version capture uses `description_json`, captures JSON-only Sheet changes,
      and no longer depends exclusively on HTML changes.
- [ ] Every version records and serializes its page type and actor.
- [ ] Same-user saves coalesce according to the documented ten-minute policy;
      different users do not coalesce; retention remains capped at 20.
- [ ] Docs/Briefs preview as rich text and Sheets preview as a read-only native
      grid; invalid/legacy payloads show an explicit fallback.
- [ ] Restore is permission-, lock-, archive-, page-, and version-scoped.
- [ ] Restore preserves the pre-restore current body as a recoverable version.
- [ ] Doc/Brief restore uses one Yjs successor transaction and does not duplicate
      content for connected collaborators.
- [ ] Sheet restore uses the mounted editor's commit/persist path, survives
      reload, and cannot be overwritten by stale local state.
- [ ] Focused API/web tests, full API tests, web types, lint, `pnpm check`, and
      `git diff --check` pass.
- [ ] Manual Doc, Brief, Sheet, two-user, retention, and access-control results
      are recorded in the status row or implementation notes.
- [ ] `git status --short --branch` shows `main`; only approved files plus the
      plan status row changed.

## STOP conditions

Stop and report instead of improvising if:

- Existing version rows contain a substantial ambiguous non-Doc population that
  cannot be classified from their stored structured payload.
- The current `PageVersion` capture pipeline is intentionally disabled or
  replaced by another deployed service not present in this repository.
- A safe Doc restore cannot use `replaceProviderDocumentFromHTML` without
  replacing title/metadata or recreating the editor.
- A Sheet restore requires changing `description_json.sheet_snapshot` or moving
  Sheet persistence to Yjs.
- Correct capture requires storing secrets, awareness/presence payloads, or
  unbounded history.
- A restore can succeed in storage while an open client can immediately overwrite
  it with stale state and no safe client-coordinated path exists.
- Migration or verification fails twice after one reasonable correction.
- The implementation needs files outside Scope; report the exact file/reason and
  request a plan amendment.

## Maintenance notes

- This is bounded recovery history, not a legal audit trail. Coalescing and the
  20-version cap must be clear in product copy and tests.
- If retention becomes workspace-configurable later, centralize it server-side;
  do not let clients choose deletion policy.
- Future Whiteboard version support should add a native preview/restore adapter
  using `description_json.excalidraw_snapshot`, not route through DocumentEditor.
- Plan 029 collaborator colors may be reused for the **online** avatar ring, but
  historical authors are not necessarily online; history should show their
  normal avatar/name without implying presence.
