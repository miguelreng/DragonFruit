# Plan 007: Triage and clear the pre-existing API test-suite failures

> **Executor instructions**: Work in WAVES. After each wave, re-run the full
> suite and record the new failure count before moving on. Most failures share a
> few root causes — fix the root cause, not individual tests. If a "failure"
> turns out to be a real product bug (not a test/config issue), STOP and report —
> do NOT change product behavior just to make a test green. Update
> `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat bbcba7b35a..HEAD -- apps/api/plane/settings/test.py apps/api/plane/tests/`
> If these changed, re-derive the failure breakdown below by running the suite
> before trusting the counts here.

## Status

- **Priority**: P1 (prerequisite for 005; unblocks a trustworthy `pnpm test`)
- **Effort**: M
- **Risk**: MED (touches test settings + a real query bug; per-wave re-runs contain it)
- **Depends on**: 002 (DONE — the `pnpm test` entry point + atlas_baseline tests)
- **Category**: tests / bug
- **Planned at**: commit `bbcba7b35a`, 2026-06-10

## Why this matters

The API test suite is red on `main`. With a local Postgres **and Redis** running,
`pnpm test` reports **64 failures / 241 passed** (the larger "87" seen initially
was inflated by ~23 failures that were purely Redis being down). These failures
hide real regressions in the noise and block plan 005 (the god-file split assumes
a green baseline). The good news: the 64 cluster into a few root causes, and the
dominant one is a **test-settings config gap**, not product rot — one fix likely
clears the majority.

## Current state (failure breakdown — env: Postgres + Redis up)

Run to reproduce (note the env prefix; the suite needs Postgres + Redis):

```
cd apps/api
POSTGRES_HOST=localhost POSTGRES_PORT=5432 POSTGRES_USER=plane POSTGRES_PASSWORD=plane \
POSTGRES_DB=plane REDIS_URL=redis://localhost:6379/ \
  .venv/bin/python -m pytest plane/tests/ -p no:cacheprovider -q --tb=line
```

Failing modules (count): `test_authentication.py` (17), `test_page_model.py` (8),
`test_essay_illustration_task.py` (6), `test_cycles.py` (6), `test_calendar_app.py`
(4), `test_url.py` (3), `test_project_app.py` (3), and ~17 more spread thin.

Root-cause clusters:

1. **DOMINANT — `'NoneType' object has no attribute 'rstrip'` (config).** `base_host()`
   at `plane/authentication/views/common.py:59` does
   `base_host(request=request, is_app=True).rstrip("/")`, but in test settings the
   underlying URL is `None`: `WEB_URL = os.environ.get("WEB_URL")` (common.py:449)
   and `APP_BASE_URL` (common.py:435) are unset, and **`plane/settings/test.py`
   does not set them**. Result: `/auth/sign-in/` 500s, which cascades into all 17
   `test_authentication.py` failures plus the directly-attributed ~10 and several
   downstream `test_cycles.py` / `test_project_app.py` failures (which need a
   signed-in session). This is a **test-config** problem — the fix is in
   `plane/settings/test.py`, not product code.

2. **REAL BUG — `Field Page.owned_by cannot be both deferred and traversed using
select_related` (6).** A `Page` queryset combines `.defer(...)` and
   `.select_related("owned_by"...)` on the same field, which Django rejects. Hits
   `test_page_model.py` and page endpoints. This is a genuine source bug to fix in
   the query (find the offending `.defer()`/`.select_related()` pair).

3. **STALE TESTS (test expectations drifted from current behavior).** Confirmed:
   - `test_agent_app.py::...test_delete_agent_soft_deletes_and_deactivates_bot` — uses
     `Agent.objects.get(...)`, which excludes soft-deleted rows; should use the
     all-objects manager.
   - `test_agent_app.py::...test_chat_document_subject_cleanup_handles_spanish_phrasing`
     — expects the article "los" kept; `_normalise_document_subject` strips it.
   - `test_url.py` (3) — URL length-limit expectations that no longer match.
     For each: confirm current behavior is correct/intended, then update the test;
     if the _code_ looks wrong, STOP and report instead of editing the test.

4. **ENV — broker-dependent bg-task tests.** `kombu.exceptions.OperationalError`
   and `Expected 'delay' to have been called once` in `test_essay_illustration_task.py`
   and similar — these need a Celery broker or proper task mocking. Likely the test
   should mock `.delay()` rather than require a live broker; investigate per test.

## Commands you will need

(Env prefix `ENV=` below = `POSTGRES_HOST=localhost POSTGRES_PORT=5432 POSTGRES_USER=plane POSTGRES_PASSWORD=plane POSTGRES_DB=plane REDIS_URL=redis://localhost:6379/`)

| Purpose                          | Command                                                                                              | Expected                      |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------- |
| Full suite count                 | `cd apps/api && <ENV> .venv/bin/python -m pytest plane/tests/ -q --tb=line \| tail -1`               | failure count drops each wave |
| One module                       | `cd apps/api && <ENV> .venv/bin/python -m pytest plane/tests/contract/app/test_authentication.py -q` | pass                          |
| atlas_baseline (must stay green) | `cd apps/api && <ENV> .venv/bin/python -m pytest plane/tests/ -k atlas_baseline -q`                  | 6 pass                        |
| Lint                             | `cd apps/api && .venv/bin/ruff check plane/`                                                         | exit 0                        |

## Scope

**In scope**:

- `apps/api/plane/settings/test.py` — set the missing URL settings (Wave 1).
- The single source file containing the bad `Page` `.defer()`/`.select_related()` query (Wave 2) — identify by the FieldError traceback; likely a page view/serializer queryset.
- Stale test files: `test_agent_app.py`, `test_url.py`, and any other test whose _expectation_ (not the code) is wrong (Wave 3).
- Broker-dependent test files (Wave 4) — add `.delay` mocking, not source changes.

**Out of scope**:

- Do NOT change product behavior to make a test pass. If the code is wrong, STOP and report (it becomes its own bug plan).
- Do NOT touch the `atlas_baseline` tests from plan 002 (they pass; keep them green).
- Do NOT wire CI in this plan (separate follow-up).

## Git workflow

- Branch: `advisor/007-triage-test-failures`
- One commit per wave: `Tests: <wave summary> (was N fail, now M)`.
- Do NOT push or open a PR.

## Steps

### Wave 1 — fix the test-settings URL gap (biggest win)

In `apps/api/plane/settings/test.py`, set the URL settings that `base_host()` needs
so `/auth/sign-in/` stops 500ing. Add (after the `from .common import *`):

```python
WEB_URL = "http://localhost:3000"
APP_BASE_URL = "http://localhost:3000"
SPACE_BASE_URL = "http://localhost:3000"
ADMIN_BASE_URL = "http://localhost:3000"
```

(Confirm the exact names `base_host()` / the auth views read — grep
`plane/authentication/` for `WEB_URL`, `APP_BASE_URL`, `SPACE_BASE_URL`,
`ADMIN_BASE_URL`, and set whichever are referenced.)

**Verify**: re-run the full suite; the `'NoneType'...rstrip` failures and the
`test_authentication.py` cluster should be gone. Record the new count (expect a
large drop from 64). `atlas_baseline` still 6 pass.

### Wave 2 — fix the `Page.owned_by` defer+select_related query bug

Find the queryset that triggers
`FieldError: Field Page.owned_by cannot be both deferred and traversed using
select_related` (grep the page views/serializers for `.defer(` combined with
`.select_related(` touching `owned_by`). Fix the query so `owned_by` isn't both
deferred and select_related — usually by removing `owned_by` from the `.defer()`
list or from `.only()`/`.select_related()` as appropriate. This is a real source
fix; keep it minimal and behavior-preserving.

**Verify**: `test_page_model.py` and page-endpoint failures clear; full count drops
by ~6. `atlas_baseline` still green.

### Wave 3 — update stale test expectations

For each stale test (the two in `test_agent_app.py`, the three in `test_url.py`,
and any newly-surfaced ones), confirm the **current behavior is intended**, then
update the test assertion to match. If the current behavior looks like a bug (not
the test), STOP and report that test as a product-bug candidate instead of editing it.

**Verify**: those tests pass; full count drops. `atlas_baseline` still green.

### Wave 4 — broker-dependent bg-task tests

For `test_essay_illustration_task.py` and similar `kombu`/`.delay` failures, mock
the Celery task dispatch (`monkeypatch` the `.delay` / `.apply_async`) so the test
doesn't need a live broker — matching how other bg-task tests in the suite handle
it (find one that already mocks `.delay` and follow it). If a test genuinely
requires a broker by design, mark it `@pytest.mark.slow` and document the
requirement rather than forcing it.

**Verify**: re-run full suite; record the final count. Anything still failing that
isn't cleanly a config/stale/mock issue → list it in NOTES as a real-bug candidate;
do NOT paper over it.

## Test plan

- No NEW tests — this plan fixes the existing suite. The proof is the dropping
  failure count after each wave and `atlas_baseline` staying green.
- Final state target: the only acceptable residual failures are ones documented in
  NOTES as real-bug candidates (each with the test name + why it's a product issue,
  not a test issue).

## Done criteria

- [ ] Full-suite failure count is substantially reduced and the residual is fully
      explained (each remaining failure categorized: real-bug-candidate, or
      requires-external-service-by-design with a `slow` marker)
- [ ] `cd apps/api && <ENV> pytest plane/tests/ -k atlas_baseline -q` → 6 pass (no regression of plan 002)
- [ ] `test_authentication.py` passes (Wave 1 success signal)
- [ ] `cd apps/api && ruff check plane/` exits 0
- [ ] No product behavior changed except the minimal `Page` query fix in Wave 2 (reviewer-checkable in the diff)
- [ ] `plans/README.md` status row updated, and the "Discovered during execution" note updated with the final count
- [ ] Any remaining red is listed as a real-bug candidate in the PR description, not silently left

## STOP conditions

Stop and report (do not improvise) if:

- A failing test reflects a real product bug — report it as a new finding; don't change product code (beyond Wave 2's query fix) to make it green.
- Wave 1 does NOT clear the auth cluster — the root cause differs from this plan's diagnosis; report what you find.
- The `Page` query fix would change a public response shape or require touching many call sites — report; it may need its own plan.
- `atlas_baseline` tests start failing — you've regressed plan 002's work; stop.

## Maintenance notes

- After this lands, plan 005 (god-file split) can use "full suite green" as its gate.
- Strong follow-up: add `pnpm test` (with the Postgres+Redis service env) to the API
  CI workflow (`.github/workflows/pull-request-build-lint-api.yml` currently runs
  only `ruff`) so the suite never silently rots again.
- The local test stack is native Homebrew `postgresql@15` + `redis` (no Docker).
