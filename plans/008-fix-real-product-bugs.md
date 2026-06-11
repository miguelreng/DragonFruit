# Plan 008: Fix the real product bugs surfaced by the test triage (007)

> **Executor instructions**: Work in WAVES (A → B → C). Each bug's fix is gated by
> its now-passing test. After each wave, run the full suite and confirm the failure
> count drops and `atlas_baseline` stays green. These are PRODUCT-behavior changes —
> keep each fix minimal and targeted. If a fix would change a public response shape
> beyond what its test requires, or touch many call sites, STOP and report. Commit
> per wave. SKIP updating plans/README.md — your reviewer maintains the index.
> Before reporting, audit every claim against an actual tool result. Reply with the
> report format at the end.
>
> **Drift check (run first)**: `git diff --stat e4ff02d522..HEAD -- apps/api/plane/api/serializers/cycle.py apps/api/plane/api/views/cycle.py apps/api/plane/app/views/api.py apps/api/plane/app/serializers/ai_connector.py apps/api/plane/bgtasks/copy_s3_object.py`
> If any changed, re-read the "Current state" excerpts before proceeding.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (product behavior; one is a security fix — but each is gated by a test)
- **Depends on**: 007 (DONE — these are its residual failures)
- **Category**: bug
- **Planned at**: commit `e4ff02d522`, 2026-06-10

## Why this matters

The 007 triage cleared the test-suite noise and left 13 failures that are genuine
product bugs, previously invisible. This plan fixes them. Each has a failing test
that becomes its regression gate. One (api-token PATCH) is a security fix.

## Environment (required to run the suite)

A local Postgres + Redis are running (native Homebrew, no Docker). Run pytest from
inside the worktree's `apps/api`, env vars as SEPARATE tokens (do not collapse into
one shell variable):

```
cd <worktree>/apps/api
env POSTGRES_HOST=localhost POSTGRES_PORT=5432 POSTGRES_USER=plane POSTGRES_PASSWORD=plane \
    POSTGRES_DB=plane REDIS_URL=redis://localhost:6379/ \
    /Users/miguelreng/Documents/Code/DragonFruit/apps/api/.venv/bin/python -m pytest <args>
```

ruff: `/Users/miguelreng/Documents/Code/DragonFruit/apps/api/.venv/bin/ruff`.
Baseline before you start: 13 failed / 292 passed.

## Current state (confirmed by reading the code)

**Bug 1 — cycle create ignores URL `project_id`.**
`plane/api/serializers/cycle.py:62` — `CycleCreateSerializer.validate()` reads
`project_id = self.initial_data.get("project_id") or ...`. The view
`plane/api/views/cycle.py:308` builds it as `CycleCreateSerializer(data=request.data,
context={"request": request})` — `project_id` comes from the URL kwarg (a local
`project_id` exists in the view, used at ~line 314) but is never put into the
serializer's data or context. → `validate()` raises "Project ID is required" → 400.
Failing test: `plane/tests/contract/api/test_cycles.py` (3 cases).

**Bug 2 — API-token PATCH can modify service tokens (security).**
`plane/app/views/api.py:57` — `patch()` does
`APIToken.objects.get(user=request.user, pk=pk)` with NO `is_service=False`, while
`delete()` (line 52) and the list (line 43) both filter `is_service=False`. So a
user can PATCH a service token.
Failing test: `test_api_token.py::...test_patch_cannot_modify_service_token`.

**Bug 3 — AI-connector `secret` write field crashes create/update.**
`plane/app/serializers/ai_connector.py:11` — `secret = serializers.CharField(write_only=True)`
has no corresponding model field (`secret_encrypted` is the column, and it's
read-only). `WorkspaceAIConnector.objects.create(**validated_data)` would receive
`secret=...` → `TypeError: unexpected keyword argument 'secret'`. No `create`/`update`
override exists.
Failing test: `test_ai_connectors_app.py` (2 cases).

**Bug 4 — Google-Drive attachment 409 returns `id` as str vs UUID.**
The duplicate/409 path returns `id` as a plain string while the 201 path returns a
UUID object, so the test's `409.id == 201.id` fails on type. Locate via the failing
test `test_google_drive_attachment_app.py` (grep for its endpoint/view). Fix the
inconsistency so both responses serialize `id` the same way (prefer running both
through the same serializer / `str(...)`).

**Bug 5 — copy_s3 task NOT NULL on `description_json`.**
`plane/bgtasks/copy_s3_object.py:148-150` — `entity.description_json =
external_data.get("description_json")` can be `None`, then `entity.save()` (line 150)
violates a NOT NULL constraint. Fix: default to `{}` (or skip the assignment when
absent), matching how the model/other writers handle it.
Failing test: `test_copy_s3_objects.py` (also exercises S3 — mock the storage if the
test currently needs a live bucket).

**Item 6 — tests needing a ProjectMember / 403-vs-404 order (verify intent).**
`test_issue_app.py` (2), `test_page_app.py` (2), `test_project_bookmark_app.py` (1):
they create a `Project` without a `ProjectMember`, so `ProjectEntityPermission`
returns 403 before the view's 404 lookup. For each: decide whether the TEST is wrong
(missing `ProjectMember` setup, or expecting 404 where 403 is correct fail-fast
behavior) — if so, fix the test; if the PERMISSION ORDER is genuinely wrong product
behavior, STOP and report rather than changing product code.

## Commands you will need

| Purpose        | Command (with the env prefix above)                 | Expected                                                                                 |
| -------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Full count     | `pytest plane/tests/ -q --tb=line \| tail -1`       | drops each wave                                                                          |
| A bug's test   | `pytest plane/tests/contract/api/test_cycles.py -q` | passes after fix                                                                         |
| atlas_baseline | `pytest plane/tests/ -k atlas_baseline -q`          | 6 pass (never regress)                                                                   |
| Lint           | `ruff check plane/`                                 | no NEW errors vs baseline (32 pre-existing whole-tree; your changed files must be clean) |

## Scope

**In scope** (product fixes + the gating tests):

- Wave A: `plane/api/views/cycle.py` (pass `project_id` into the serializer data/context); `plane/app/views/api.py` (add `is_service=False` to `patch()`); `plane/app/serializers/ai_connector.py` (override `create`/`update` to encrypt `secret`→`secret_encrypted`).
- Wave B: the Google-Drive attachment view/serializer (id consistency); `plane/bgtasks/copy_s3_object.py` (None-safe `description_json`).
- Wave C: the item-6 test files (test-only fixes) — unless a real permission-order bug is found, then STOP.

**Out of scope**:

- Broad refactors. Each fix is the minimal change to make its test pass without changing unrelated behavior.
- The `atlas_baseline` tests (keep green).
- Pre-existing whole-tree ruff debt (don't mass-fix it here).

## Git workflow

- Branch: `advisor/008-fix-real-product-bugs`
- One commit per wave: `Fix: <bugs> (suite N→M)`.
- Do NOT push or open a PR.

## Steps

### Wave A — bugs 1, 2, 3 (clear-cut; bug 2 is the security fix)

1. **Bug 1**: in `cycle.py` create view, make `project_id` available to the
   serializer — pass it via `context` and have `validate()` read
   `self.context.get("project_id")` as a fallback, OR inject it into the data dict.
   Prefer adding `project_id` to the serializer `context` (the view already has the
   local) and updating `validate()` to read `self.initial_data.get("project_id") or
self.context.get("project_id") or (instance...)`. Minimal, no response-shape change.
2. **Bug 2**: change `patch()`'s lookup to
   `APIToken.objects.get(user=request.user, pk=pk, is_service=False)` (mirror
   `delete()`). A service token PATCH then 404s like delete does.
3. **Bug 3**: add `create`/`update` to `WorkspaceAIConnectorSerializer` that pop
   `secret` from `validated_data`, and if present set `secret_encrypted =
encrypt_data(secret)` (match the encryption helper used elsewhere, e.g.
   `plane.license.utils.encryption.encrypt_data`).

**Verify**: each bug's test passes; full count drops by ~6; `atlas_baseline` 6 pass; changed files lint-clean.

### Wave B — bugs 4, 5

4. **Bug 4**: find the Google-Drive attachment view (grep the test for the URL /
   view name). Make the 409 and 201 responses serialize `id` identically (`str(id)`
   on both, or both through the serializer). Don't change anything else about the responses.
5. **Bug 5**: in `copy_s3_object.py`, guard the `description_json` assignment:
   `entity.description_json = external_data.get("description_json") or {}` (or skip
   when absent), so `.save()` never NULLs a NOT NULL column. If the test needs S3,
   mock the storage boundary.

**Verify**: bug-4 and bug-5 tests pass; full count drops; `atlas_baseline` green.

### Wave C — item 6 tests

For each of the 5 item-6 tests: confirm whether the test setup is incomplete
(missing `ProjectMember` → add it, following an existing test that creates a project
membership) or expects the wrong status (403 vs 404). Fix the TEST when it's a test
gap. If you conclude the product's permission-vs-lookup order is a genuine bug, STOP
and report it as a finding rather than changing product code.

**Verify**: full suite — record the final count. Goal: 0 failures, or a fully
explained residual (e.g. a test you STOPPED on with rationale).

## Test plan

- No NEW tests — the existing failing tests are the regression gates. Each must flip
  red → green as its bug is fixed.
- `atlas_baseline` (6) and the rest of the previously-passing suite must stay green.

## Done criteria

- [ ] Each named test (cycles, api_token service-token, ai_connectors, google_drive, copy_s3) passes
- [ ] Full suite: failure count is 0 OR every residual is explained in the report (real-bug-you-STOPPED-on, with rationale)
- [ ] `atlas_baseline` → 6 pass
- [ ] `ruff check` on every changed file is clean (whole-tree pre-existing debt excepted)
- [ ] Each product change is minimal and matches its test's expectation — no unrelated behavior change (reviewer-checkable in the diff)
- [ ] `plans/README.md` status row updated

## STOP conditions

- A fix would change a public API response shape beyond what its test requires, or ripple into many call sites — report.
- Item-6 turns out to be a real permission-order product bug — report it, don't change product code to chase a test.
- `atlas_baseline` regresses — stop.
- The `secret` encryption helper or its import isn't obvious — report rather than guessing the crypto path.

## Maintenance notes

- After this, the suite should be green and plan 005's "full suite green" gate is met.
- Strong follow-up: add `pnpm test` (with the Postgres+Redis service env) to the API CI workflow so these can't regress silently.
- Bug 2 is a security fix — call it out in the PR for prioritized review.
