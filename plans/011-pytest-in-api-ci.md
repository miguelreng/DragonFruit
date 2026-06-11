# Plan 011: Run the API test suite in CI (Postgres + Redis services)

> **Executor instructions**: This adds a CI job to an existing workflow. You CANNOT
> fully run GitHub Actions locally — verify by (a) YAML validity, (b) confirming the
> exact pytest invocation passes locally against the running Postgres+Redis, (c)
> structural correctness against the patterns below. Touch only the workflow file.
> Commit. SKIP updating plans/README.md. Report only what you can evidence. Reply
> with the report format at the end.
>
> **Drift check (run first)**: `git diff --stat 982d3e92c5..HEAD -- .github/workflows/pull-request-build-lint-api.yml`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW to implement (additive CI job); the job GATES PRs once merged — that's the point
- **Depends on**: 002, 007, 008, 009, 010 (DONE — the suite is green & deterministic)
- **Category**: dx / ci
- **Planned at**: commit `982d3e92c5`, 2026-06-10
- **Note for reviewer**: outward-facing — it changes the team's PR gate. Merge is the operator's decision.

## Why this matters

The API suite is now green (332 passed, 0 failed) and deterministic, but **CI does
not run it** — the API workflow runs only `ruff`. That's exactly how 64 failures
accumulated unnoticed (plans 002/007). Without a CI gate, the green suite will
silently rot again and the whole test-fixing effort decays. Adding a `pytest` job
with Postgres + Redis service containers locks it in.

## Current state

`.github/workflows/pull-request-build-lint-api.yml` runs on PRs to `preview`
(paths `apps/api/**`), one job `lint-api`: setup Python 3.12 → `pip install ruff` →
`pip install -r requirements.txt` → `ruff check --fix apps/api`. There is no test job.

Relevant facts:

- pytest config: `apps/api/pytest.ini` — `DJANGO_SETTINGS_MODULE=plane.settings.test`,
  addopts `--strict-markers --reuse-db --nomigrations -vs`. (`--reuse-db` creates the
  DB on first run; `--nomigrations` builds schema from models — both fine on a fresh CI DB.)
- Test deps live in `apps/api/requirements/test.txt` (`-r base.txt` + pytest, pytest-django, etc.).
  `requirements.txt` itself is production-only, so the test job must install `requirements/test.txt`.
- The suite needs these env vars (proven locally): `POSTGRES_HOST`, `POSTGRES_PORT`,
  `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` (settings read them in
  `common.py:217`), and `REDIS_URL` (`common.py:250`). Locally: user/pw/db all `plane`.

## Commands you will need

| Purpose                             | Command                                                                                                                                                                                                                                                                               | Expected   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| YAML valid                          | `python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/pull-request-build-lint-api.yml')); print('ok')"`                                                                                                                                                                 | `ok`       |
| Local suite (proves the invocation) | from `apps/api`, `env POSTGRES_HOST=localhost POSTGRES_PORT=5432 POSTGRES_USER=plane POSTGRES_PASSWORD=plane POSTGRES_DB=plane REDIS_URL=redis://localhost:6379/ /Users/miguelreng/Documents/Code/DragonFruit/apps/api/.venv/bin/python -m pytest plane/tests/ -q --tb=no \| tail -1` | `0 failed` |

(Local Postgres+Redis are running for the second check; env vars as SEPARATE tokens — zsh won't split a single variable.)

## Scope

**In scope**:

- `.github/workflows/pull-request-build-lint-api.yml` — add a `test-api` job.

**Out of scope**:

- Any source or test file. The suite is already green; do not "fix" anything here.
- The existing `lint-api` job — leave it unchanged.
- Other workflow files.

## Git workflow

- Branch: `advisor/011-pytest-in-api-ci`
- Commit: `CI: run the API pytest suite with Postgres + Redis services`.
- Do NOT push or open a PR.

## Steps

### Step 1: Add a `test-api` job

Add a second job to the workflow, alongside `lint-api`, that runs the suite with
service containers. Target shape (adapt key names to the runner's conventions; use
the same `if:` guard and `runs-on` as `lint-api`):

```yaml
test-api:
  name: Test API
  runs-on: ubuntu-latest
  timeout-minutes: 25
  if: |
    github.event.pull_request.draft == false &&
    github.event.pull_request.requested_reviewers != null
  services:
    postgres:
      image: postgres:15
      env:
        POSTGRES_USER: plane
        POSTGRES_PASSWORD: plane
        POSTGRES_DB: plane
      ports:
        - 5432:5432
      options: >-
        --health-cmd pg_isready --health-interval 10s
        --health-timeout 5s --health-retries 5
    redis:
      image: redis:7
      ports:
        - 6379:6379
      options: >-
        --health-cmd "redis-cli ping" --health-interval 10s
        --health-timeout 5s --health-retries 5
  steps:
    - uses: actions/checkout@v6
    - name: Set up Python
      uses: actions/setup-python@v6
      with:
        python-version: "3.12.x"
        cache: "pip"
        cache-dependency-path: "apps/api/requirements/test.txt"
    - name: Install API + test dependencies
      run: cd apps/api && pip install -r requirements/test.txt
    - name: Run API test suite
      env:
        POSTGRES_HOST: localhost
        POSTGRES_PORT: "5432"
        POSTGRES_USER: plane
        POSTGRES_PASSWORD: plane
        POSTGRES_DB: plane
        REDIS_URL: redis://localhost:6379/
      run: cd apps/api && python -m pytest plane/tests/ -q
```

Notes for the executor:

- Keep the existing `lint-api` job intact; just add `test-api` as a sibling under `jobs:`.
- If `requirements/test.txt` does not install everything the app imports at runtime
  (it pulls `-r base.txt`; the lint job used the top-level `requirements.txt`), and a
  collection error occurs locally that's import-related, prefer installing
  `requirements/test.txt` (it includes base). If something is still missing, report
  exactly what — do NOT add product deps blindly.

**Verify**:

1. `python -c "import yaml; yaml.safe_load(open('.github/workflows/pull-request-build-lint-api.yml'))"` → no error.
2. Re-run the local suite with the exact env block above → `0 failed` (this is the same command CI will run).

### Step 2: Confirm no other change

`git status` shows only the workflow file changed.

## Test plan

- Pre-merge verification is limited to YAML validity + the local suite passing with
  the identical env/command (done in Step 1). The authoritative test is the first PR
  that triggers the workflow — note this in the report as the final gate.

## Done criteria

- [ ] `test-api` job added; `lint-api` unchanged
- [ ] YAML parses (`yaml.safe_load` succeeds)
- [ ] The exact pytest command in the job passes locally → `0 failed`
- [ ] Only `.github/workflows/pull-request-build-lint-api.yml` changed (`git status`)
- [ ] Report notes that real CI verification happens on the next PR to `preview`
- [ ] `plans/README.md` status row updated

## STOP conditions

- The local suite is NOT `0 failed` with the env block above — report (something regressed since 010/009).
- `requirements/test.txt` doesn't cover the app's runtime imports and pytest can't even collect — report the missing piece; don't guess at product deps.
- The workflow uses a non-obvious matrix/reusable-workflow structure that a simple sibling job doesn't fit — report rather than restructuring.

## Maintenance notes

- The job mirrors the local stack (Postgres + Redis, user/pw/db = `plane`). If the
  app later needs more services (e.g. MinIO/S3) for some tests, add them as services
  or keep those tests mocked (plan 008/010 already mock S3/broker).
- Consider also gating on PRs to `main` if the team's flow changes (currently the
  workflow targets `preview`).
- Once this is green on a PR, the green suite is protected from silent regression.
