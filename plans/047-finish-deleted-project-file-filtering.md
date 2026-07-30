# Plan 047: Finish filtering Files linked only to deleted Projects

> **Executor instructions**: The API fix and regression test are already dirty
> in the working tree. Preserve them, verify relationship semantics, and finish
> the narrow change; do not substitute the older Issue-manager fix.
>
> **Dirty-state check (run first)**:
> `git diff -- apps/api/plane/app/views/page/base.py apps/api/plane/tests/contract/app/test_page_app.py`

## Status

- **Priority**: P1
- **Effort**: S remaining
- **Risk**: MED — workspace-wide File visibility and join semantics
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `d2ca9cd196`, 2026-07-30; fix already IN PROGRESS in the working tree

## Why this matters

The workspace Files/Docs list can retain a Page whose only Project link points
to a soft-deleted Project, leaving an orphan card that cannot be opened. A Page
linked to both active and deleted Projects must remain visible but expose only
the active Project IDs.

## Current state

- `WorkspacePagesListEndpoint` in
  `apps/api/plane/app/views/page/base.py:855-892` builds the workspace list and
  annotates `project_ids`.
- The dirty implementation switches from the convenience `projects` relation to
  `project_pages` and filters active links, non-deleted/non-archived Projects,
  active membership, and non-deleted membership in both the queryset and
  `ArrayAgg`.
- A dirty contract test,
  `test_pages_linked_only_to_deleted_projects_are_not_listed`, covers:
  an active-only Page, a deleted-only Page, and a Page linked to both.
- Commit `cb27d468f8` solved the analogous My Tasks/Issue-manager bug, not this
  Files endpoint; it is not sufficient evidence for this item.

## Scope

**In scope**:

- `apps/api/plane/app/views/page/base.py`
- `apps/api/plane/tests/contract/app/test_page_app.py`

**Out of scope**:

- Hard-deleting Pages when a Project is deleted.
- Changing Project deletion jobs.
- Removing a Page that still has one accessible active Project.
- Issue/My Tasks filtering, already handled separately.

## Steps

### Step 1: Reconcile the dirty join change

Confirm `ProjectPage` is the authoritative through model and that all filters
apply to the same join path. Ensure `.distinct()` prevents duplicate Pages and
the aggregation returns serialized IDs in the existing response type.

**Verify**: the existing workspace list test and new deleted-Project test both
pass.

### Step 2: Complete edge-case coverage

Add cases only if not already represented:

1. Page linked to active + deleted Projects remains with only active ID;
2. Page linked only to deleted Project is absent;
3. soft-deleted `ProjectPage` link is ignored;
4. inactive/deleted membership does not expose the Page;
5. archived Project follows the existing hidden behavior.

**Verify**:

```bash
cd apps/api &&
python -m pytest \
  plane/tests/contract/app/test_page_app.py::TestWorkspacePagesListAPI -q
```

→ all tests pass.

### Step 3: Check query shape

Inspect the endpoint query count using the existing API test tooling. The join
change must remain one bounded list query plus expected authentication/setup
queries and must not add per-Page lookups.

**Verify**: query count does not grow with the number of returned Pages.

### Step 4: Runtime smoke the Files surface

Create active-only, deleted-only, and mixed-link Docs; soft-delete one Project;
reload workspace Files and a Project-scoped Docs page. Confirm no orphan card
and no active Project ID loss.

## Execution evidence — 2026-07-30

- The workspace Files query now filters the authoritative `ProjectPage` path
  for active links, non-deleted/non-archived Projects, and active non-deleted
  memberships in both visibility and `project_ids` aggregation.
- Focused `TestWorkspacePagesListAPI` tests pass, including the new
  deleted-only exclusion and mixed active/deleted Project ID case.
- The File card menu now always shows `Delete` for non-brief files. Owners,
  workspace admins, and project admins can use it; other users see the disabled
  action with `Owner or admin only` instead of having the action disappear.
- Four focused Web permission tests prove owner, workspace-admin, project-admin,
  protected-file, and protected-brief behavior. Web types and production build
  pass.
- The remaining work is explicit query-count coverage plus signed-in Files UI
  smoke; the local Web UI is blocked at loading without the API/auth stack.

## Done criteria

- [x] Deleted-only Files are absent from the workspace list.
- [x] Mixed-link Files remain with only accessible active Project IDs.
- [x] Deleted links and inactive/deleted memberships are ignored by the query.
- [x] The File card menu exposes Delete and correctly enables authorized users.
- [ ] No N+1 query regression is introduced.
- [ ] Focused API tests and runtime smoke pass.

## STOP conditions

- `ProjectPage` is not the authoritative relationship for this endpoint.
- Filtering the through model changes visibility of owned private Pages in an
  undocumented way.
- The existing dirty changes belong to another in-progress permission rewrite.
- Correctness requires changing Project deletion semantics.
