# Plan 009: Align the two permission tests with the intended uniform-403 posture

> **Executor instructions**: TEST-ONLY. The product behavior is intentional and
> stays as-is. Update the two tests to expect 403, rename the misleadingly-named
> one, and add a one-line comment explaining the posture. Do NOT change any product
> code. Commit, then verify the full suite is GREEN. SKIP updating plans/README.md.
> Reply with the report format at the end.
>
> **Drift check (run first)**: `git diff --stat bd128075ac..HEAD -- apps/api/plane/tests/contract/app/test_issue_app.py apps/api/plane/tests/contract/app/test_project_bookmark_app.py`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (test-only)
- **Depends on**: 010 (DONE — suite is deterministic; these are the only 2 residual failures)
- **Category**: tests
- **Planned at**: commit `bd128075ac`, 2026-06-10

## Why this matters

`allow_permission` (`plane/app/permissions/base.py`) returns **403** for a
project-level request whenever the user is not a `ProjectMember` — whether the
project doesn't exist, is in another workspace, or exists but the user lacks the
role. This is the **intended** posture: a uniform 403 does not leak which projects
exist (better against enumeration). Two tests were written expecting 404 for the
"project doesn't exist / outside workspace" case; that expectation is the bug, not
the code. The product owner confirmed: keep 403, fix the tests. This clears the last
2 failures so the suite is fully green.

## Current state

- `plane/tests/contract/app/test_issue_app.py` — `test_create_issue_returns_404_for_project_outside_workspace`
  posts to a project in another workspace and asserts `status.HTTP_404_NOT_FOUND`.
- `plane/tests/contract/app/test_project_bookmark_app.py` — `test_project_bookmark_create_handles_missing_project`
  posts to a non-existent project UUID and asserts `status.HTTP_404_NOT_FOUND`.
- Product behavior (do NOT change): `allow_permission` returns 403 in both cases.

## Commands you will need

(env prefix = `POSTGRES_HOST=localhost POSTGRES_PORT=5432 POSTGRES_USER=plane POSTGRES_PASSWORD=plane POSTGRES_DB=plane REDIS_URL=redis://localhost:6379/`, as SEPARATE tokens; python = the MAIN checkout's `.venv/bin/python`.)

| Purpose        | Command                                                                                                      | Expected     |
| -------------- | ------------------------------------------------------------------------------------------------------------ | ------------ |
| The two tests  | `pytest plane/tests/contract/app/test_issue_app.py plane/tests/contract/app/test_project_bookmark_app.py -q` | pass         |
| Full suite     | `pytest plane/tests/ -p no:cacheprovider -q --tb=no \| tail -1`                                              | **0 failed** |
| atlas_baseline | `pytest plane/tests/ -k atlas_baseline -q`                                                                   | 6 pass       |

## Scope

**In scope** (test-only):

- `apps/api/plane/tests/contract/app/test_issue_app.py`
- `apps/api/plane/tests/contract/app/test_project_bookmark_app.py`

**Out of scope**:

- `plane/app/permissions/base.py` and ALL product code — the 403 behavior is intended; do not touch it.
- Any other test.

## Git workflow

- Branch: `advisor/009-permission-403-not-404`
- Commit: `Tests: expect 403 (not 404) for inaccessible projects — uniform no-leak posture`.
- Do NOT push or open a PR.

## Steps

### Step 1: Update test_issue_app.py

In `test_create_issue_returns_404_for_project_outside_workspace`:

- Change `assert response.status_code == status.HTTP_404_NOT_FOUND` to
  `assert response.status_code == status.HTTP_403_FORBIDDEN`.
- Rename the method to `test_create_issue_returns_403_for_project_outside_workspace`
  (so the name matches the asserted behavior).
- Add a one-line comment: `# Inaccessible projects return a uniform 403 (no resource-existence leak), not 404.`

**Verify**: `pytest plane/tests/contract/app/test_issue_app.py -q` → pass.

### Step 2: Update test_project_bookmark_app.py

In `test_project_bookmark_create_handles_missing_project`:

- Change the `assert ... HTTP_404_NOT_FOUND` to `HTTP_403_FORBIDDEN`.
- Add the same one-line comment. (Name is fine — it doesn't claim a status code.)

**Verify**: `pytest plane/tests/contract/app/test_project_bookmark_app.py -q` → pass.

### Step 3: Full suite green

**Verify**: full suite → **0 failed**; `atlas_baseline` 6 pass. Run it twice
(reuse-db) to confirm it stays 0 (determinism from plan 010 holds).

## Test plan

- No new tests; two assertions flipped 404→403 to match intended behavior.
- The win is the full suite reaching 0 failures, deterministically.

## Done criteria

- [ ] Both tests pass
- [ ] Full suite: **0 failed** on two consecutive runs
- [ ] `atlas_baseline` 6 pass
- [ ] Only the two test files changed; no product code (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The full suite is NOT 0 after the change (some other non-determinism remains) — report the residual; do not mask it.
- Making a test pass appears to require a product change — STOP (it would contradict the confirmed 403 decision).

## Maintenance notes

- The 403-not-404 posture is deliberate (no resource-existence leak). If a future
  change makes inaccessible projects return 404, these tests must be revisited and
  the security trade-off reconsidered.
- With this + 010, the suite is green and deterministic — now wire `pytest` (with the
  Postgres+Redis env) into the API CI workflow so it can't regress (currently CI runs only `ruff`).
