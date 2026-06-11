# Plan 010: Make the API test suite deterministic (fix state-isolation in transactional tests)

> **Executor instructions**: This is a TEST-ONLY plan — do not change product code.
> The goal is a deterministic full-suite result. Prove determinism by running the
> full suite multiple times (and with `--create-db`) and getting the SAME failure
> set every time. If you find the only way to make a test pass is to change product
> behavior, STOP and report. Commit per logical group. SKIP updating
> plans/README.md — your reviewer maintains it. Audit every claim against real tool
> output before reporting. Reply with the report format at the end.
>
> **Drift check (run first)**: `git diff --stat 8a5ece2359..HEAD -- apps/api/plane/tests/contract/api/test_projects.py apps/api/plane/tests/contract/api/test_labels.py`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (test-only)
- **Depends on**: none (but unblocks 005's "full suite green" gate and putting pytest in CI)
- **Category**: tests
- **Planned at**: commit `8a5ece2359`, 2026-06-10

## Why this matters

The full API suite is **non-deterministic**: identical invocations have produced 2,
3, 11, and 12 failures depending on DB state and order. Root cause: several
`transaction=True` tests assert **global table counts** (e.g.
`assert Project.objects.count() == 0`). `transaction=True` tests COMMIT rows; with
`--reuse-db` that committed data persists across runs and across other tests, so a
later (or next-run) global-count assertion sees leftover rows and fails. A fresh DB
(`--create-db`) actually exposes MORE failures (11) because the coupling runs both
ways. Until this is fixed, "full suite green" can't be a reliable gate (plan 005)
and pytest can't go into CI without flaking. The fix is to make these assertions
isolation-independent by scoping them to the objects/workspace the test created.

## Current state (confirmed)

- Only two test files use `@pytest.mark.django_db(transaction=True)`:
  `plane/tests/contract/api/test_projects.py` and
  `plane/tests/unit/models/test_page_model.py`.
- `test_projects.py` has global-count assertions that assume an empty DB:

  ```python
  # plane/tests/contract/api/test_projects.py
  :143  assert Project.objects.count() == 0
  :179  assert Project.objects.count() == 0
  :180  assert ProjectMember.objects.count() == 0
  :181  assert State.objects.count() == 0
  ```

  (Other assertions there are already scoped, e.g. `State.objects.filter(project=project).count() == 5` — those are fine.)

- `test_labels.py` and other contract tests fail intermittently as collateral when
  the reused DB carries leftover rows.
- Reproduction of the non-determinism (run several times; counts vary):
  ```
  cd apps/api
  env POSTGRES_HOST=localhost POSTGRES_PORT=5432 POSTGRES_USER=plane POSTGRES_PASSWORD=plane \
      POSTGRES_DB=plane REDIS_URL=redis://localhost:6379/ \
      .venv/bin/python -m pytest plane/tests/ -p no:cacheprovider -q --tb=no
  ```

## Commands you will need

(env prefix = `POSTGRES_HOST=localhost POSTGRES_PORT=5432 POSTGRES_USER=plane POSTGRES_PASSWORD=plane POSTGRES_DB=plane REDIS_URL=redis://localhost:6379/`; pass as SEPARATE tokens — zsh won't word-split a single variable; python = the MAIN checkout's `.venv/bin/python`.)

| Purpose                | Command                                                                     | Expected                    |
| ---------------------- | --------------------------------------------------------------------------- | --------------------------- |
| Full, fresh DB         | `pytest plane/tests/ --create-db -p no:cacheprovider -q --tb=no \| tail -1` | a STABLE count              |
| Full, reuse            | `pytest plane/tests/ -p no:cacheprovider -q --tb=no \| tail -1`             | SAME stable count as fresh  |
| Run twice back-to-back | (run the reuse command twice)                                               | identical result both times |
| atlas_baseline         | `pytest plane/tests/ -k atlas_baseline -q`                                  | 6 pass                      |

## Scope

**In scope** (test-only):

- `apps/api/plane/tests/contract/api/test_projects.py` — scope the global-count assertions.
- `apps/api/plane/tests/unit/models/test_page_model.py` — if it has any global-count or empty-DB assumptions, scope them too.
- Any OTHER test the diagnosis shows is order-coupled (global counts, assuming empty tables, depending on a prior test's data). Grep for the pattern (Step 2).

**Out of scope**:

- Product code. If a test can only pass by changing product behavior, STOP and report.
- The 2 known permission-order failures (`test_issue_app::...404_for_project_outside_workspace`, `test_project_bookmark::...handles_missing_project`) — those are plan 009, NOT this plan. They are the acceptable residual; leave them failing.
- `atlas_baseline` tests (keep green).

## Git workflow

- Branch: `advisor/010-fix-test-isolation`
- Commit per group: `Tests: scope <area> assertions for isolation`.
- Do NOT push or open a PR.

## Steps

### Step 1: Establish the non-determinism, then the target

Run the full suite 3×: once `--create-db`, then twice `--reuse-db`. Record each
failure count and the FAILED test names. Confirm the set varies and that the varying
members are `test_projects.py` / `test_labels.py` / similar (NOT `atlas_baseline`,
NOT the 2 permission-order tests — those should fail every time and are out of scope).

### Step 2: Find every global-count / empty-DB assertion

Grep the test tree for assertions that assume global isolation:

```
grep -rnE "\.objects\.count\(\) ==|\.objects\.all\(\)\.count\(\)|assert .*count\(\) == 0|len\(response\.data\) ==" plane/tests/
```

For each hit, decide: does it assume the whole table (bad — order-coupled) or is it
already scoped to a workspace/project/created object (fine)? List the bad ones.

### Step 3: Scope the assertions to the test's own data

Rewrite each global-count assertion to filter by the object/workspace the test
created. Examples:

- `assert Project.objects.count() == 0` → assert the SPECIFIC project the test acted
  on is gone, e.g. `assert not Project.objects.filter(id=project_id).exists()` (or
  `.filter(workspace=workspace).count() == 0` if the intent is "none in this workspace").
- `assert ProjectMember.objects.count() == 0` → `.filter(project=project).count() == 0`.
- `assert State.objects.count() == 0` → `.filter(project=project).count() == 0`.
  Match the test's actual intent (read the surrounding test to see what it's verifying —
  usually "the thing I created/deleted", not "the global table").

### Step 4: Verify determinism

Re-run the full suite 3× (one `--create-db`, two `--reuse-db`). All three must
report the SAME failure set, and that set must be ONLY the 2 permission-order tests
(plan 009's residual). `atlas_baseline` 6 pass every time.

If the set is still not stable, bisect: the remaining coupling is another
order-dependent test — find it (it will be a test that passes alone but fails after a
specific other test), scope or fix its data assumptions, and repeat. Do NOT give up
at "mostly stable" — list any test you cannot stabilize, with what it depends on.

## Test plan

- No new tests. The deliverable is determinism: the same 2-failure result across
  fresh-DB and repeated reuse-DB runs.

## Done criteria

- [ ] Full suite produces the SAME failure set on `--create-db` and on two consecutive `--reuse-db` runs
- [ ] That stable set is exactly the 2 plan-009 permission-order tests (everything else passes)
- [ ] `atlas_baseline` → 6 pass on every run
- [ ] Only test files changed (`git status` shows no product code)
- [ ] Any test that could not be stabilized is listed in the report with its dependency
- [ ] `plans/README.md` status row updated

## STOP conditions

- A test can only pass by changing product behavior — STOP, report (it's a product bug, not isolation).
- The instability traces to a `transaction=True` test flushing data that a session/module-scoped fixture created — report the fixture-scope conflict before changing fixture scope (that can ripple).
- `atlas_baseline` regresses — stop.

## Maintenance notes

- After this, add `pytest` (with the Postgres+Redis service env) to the API CI
  workflow — it currently runs only `ruff`, which is why this rot accumulated.
- New tests should NEVER assert global table counts — always scope to the workspace/
  objects under test. Consider noting this in the test README/AGENTS.md.
- Plan 005's "full suite green" gate depends on this + plan 009.
