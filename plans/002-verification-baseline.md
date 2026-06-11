# Plan 002: Establish a one-command test baseline + characterization tests for the Atlas surface

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 866fb1777f..HEAD -- package.json apps/api/pytest.ini apps/api/plane/app/views/calendar/base.py apps/api/plane/llm/mcp_client.py`
> If any of these changed, compare the "Current state" excerpts against the live
> code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S (scripts) + M (tests)
- **Risk**: LOW
- **Depends on**: none (unblocks 005)
- **Category**: tests / dx
- **Planned at**: commit `866fb1777f`, 2026-06-10

## Why this matters

There is no single command a developer can run to know the custom "Atlas" code
still works. The root `package.json` exposes `check` (format + lint + types) and
`build`, but **no `test`** — the API's pytest suite isn't reachable from the repo
root and isn't run in CI (the API CI workflow runs only `ruff check`). The
existing API tests are thin (`test_agent_app.py` is 162 lines, `test_calendar_app.py` 398) for the surface they cover, and the highest-risk paths — the agent tool-use
loop, the doc-replace Yjs reconcile, OAuth token refresh, MCP failure handling —
have no characterization tests. This makes every change to the custom surface a
blind change, and it blocks the god-file refactor (plan 005) from being done
safely. This plan adds the missing `pnpm test` entry point and a focused set of
characterization tests around the riskiest behaviors.

## Current state

- `package.json` (repo root) scripts — no `test`:

  ```json
  "build": "turbo run build",
  "check": "turbo run check",
  "check:types": "turbo run check:types",
  ...
  ```

- `apps/api/pytest.ini` — pytest is configured with Django test settings and markers:

  ```ini
  [pytest]
  DJANGO_SETTINGS_MODULE = plane.settings.test
  markers =
      unit: ...
      contract: Contract tests for API endpoints
      smoke: ...
  addopts = --strict-markers --reuse-db --nomigrations -vs
  ```

- Existing contract tests live in `apps/api/plane/tests/contract/app/` and use
  fixtures from `apps/api/plane/tests/conftest.py` (`session_client`, `workspace`,
  `create_user`). Example test header + style:

  ```python
  # apps/api/plane/tests/contract/app/test_agent_app.py:1-40
  import pytest
  from rest_framework import status
  from plane.app.views.agent.chat import (_make_create_document_tool, ...)

  @pytest.mark.contract
  class TestAgentAPI:
      @pytest.mark.django_db
      def test_delete_agent_soft_deletes_and_deactivates_bot(self, session_client, workspace):
          ...
  ```

- The doc-replace reconcile logic that needs coverage is in
  `apps/api/plane/app/views/calendar/base.py` (`_replace_meeting_notes_document_formats`,
  the `_apply_document_body` closure inside `MeetingNotesDraftEndpoint.post`) and
  the editor helper `replaceDocumentEditorBinaryFromHTML` in
  `packages/editor/src/core/helpers/yjs-utils.ts`.

## Commands you will need

| Purpose            | Command                                                               | Expected on success    |
| ------------------ | --------------------------------------------------------------------- | ---------------------- |
| API tests          | `cd apps/api && python -m pytest plane/tests/ -q`                     | all pass               |
| New API tests only | `cd apps/api && python -m pytest plane/tests/ -k "atlas_baseline" -q` | new tests pass         |
| Root test script   | `pnpm test`                                                           | runs API tests, exit 0 |
| Lint               | `cd apps/api && ruff check plane/`                                    | exit 0                 |

## Scope

**In scope**:

- `package.json` (root) — add a `test` script.
- `apps/api/package.json` — create or extend so `turbo`/pnpm can invoke API tests (see Step 1 — match how other apps expose scripts).
- `turbo.json` — add a `test` task entry if turbo orchestration is used (see Step 1).
- `apps/api/plane/tests/contract/app/test_calendar_app.py` — extend with doc-replace + token-refresh characterization tests.
- `apps/api/plane/tests/contract/app/test_agent_app.py` — extend with tool-loop + MCP-failure characterization tests.

**Out of scope**:

- Do NOT change any non-test source file to "make it testable" beyond what is strictly necessary; if a path is untestable without a refactor, write the test at the nearest seam and note the limitation (do not refactor — that is plan 005).
- Do NOT wire frontend (web/editor) test runners in this plan — API baseline only. (A follow-up can add Vitest for `packages/editor`.)
- Do NOT add tests that hit real network or real Google/LLM APIs — mock at the boundary, following the existing monkeypatch style in `test_calendar_app.py`.

## Git workflow

- Branch: `advisor/002-verification-baseline`
- Commit style: `Tests: <imperative>` / `DX: add pnpm test entry point`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add a `pnpm test` entry point

Decide the simplest wiring that works in this repo:

1. Inspect `turbo.json` for an existing `test` pipeline task and how `apps/api`
   participates in turbo (it may have no `package.json`).
2. If `apps/api` has no `package.json`, the lowest-risk approach is a root script
   that shells into the API directly:

   ```json
   "test": "cd apps/api && python -m pytest plane/tests/ -q",
   "test:api": "cd apps/api && python -m pytest plane/tests/ -q"
   ```

   If turbo already orchestrates per-app `test` tasks, instead add a `test` task
   to `turbo.json` and a `"test": "python -m pytest plane/tests/ -q"` script to a
   minimal `apps/api/package.json`, and set root `"test": "turbo run test"`.

Pick ONE approach; do not do both. Prefer the direct root script if turbo has no
test pipeline (less moving parts).

**Verify**: `pnpm test` runs the API suite and exits 0 (all currently-passing tests pass). If the suite needs a database, document the prerequisite in the script comment or AGENTS.md (the suite uses `--reuse-db --nomigrations`).

### Step 2: Characterization test — doc-replace reconcile does not duplicate content

In `test_calendar_app.py`, add a test (mark `@pytest.mark.contract @pytest.mark.django_db`,
prefix the test name with `test_atlas_baseline_` so `-k atlas_baseline` selects it)
that posts meeting notes **twice** for the same calendar event (same
`account_id`/`calendar_id`/`meeting_id`) and asserts:

- The second POST returns 200 (not 201) and reuses the same page id.
- The page's `description_html` reflects the _second_ set of notes (replace), and
  does not contain two concatenated copies of the body.

Mock `_summarize_meeting_notes` and the live-server call (`_replace_meeting_notes_document_formats`
returns `{}` when `LIVE_URL` is unset — assert the no-live fallback path clears
`description_binary` so it re-seeds, matching the documented behavior). Follow the
existing meeting-notes test in this file as the structural pattern.

**Verify**: `cd apps/api && python -m pytest plane/tests/contract/app/test_calendar_app.py -k atlas_baseline -q` → passes.

### Step 3: Characterization test — OAuth token refresh retries credential candidates

In `test_calendar_app.py`, add `test_atlas_baseline_token_refresh_*` that mocks the
Google token endpoint to fail on the first credential candidate and succeed on the
second, and asserts the calendar account row ends with the refreshed token and the
request succeeds. (Locate the refresh helper in `calendar/base.py` —
`_token_exchange_candidates` / `_client_credential_candidates`.) If the refresh
path is not reachable without real Google calls even with mocking, write the test
at the helper-function level (call the helper directly with a mocked `requests.post`)
and note it.

**Verify**: `cd apps/api && python -m pytest plane/tests/contract/app/test_calendar_app.py -k atlas_baseline -q` → passes.

### Step 4: Characterization test — agent tool loop caps iterations and honors cancel

In `test_agent_app.py`, add `test_atlas_baseline_tool_loop_*` covering the
provider's tool-use loop in `apps/api/plane/llm/provider.py`: mock the LiteLLM call
to always return a tool call (would loop forever) and assert the loop terminates at
the documented max-iteration cap rather than spinning. If the loop is only
reachable through a higher-level entry, test at the smallest callable seam and mock
the provider call. Add a second case: a tool handler that raises is caught and
surfaced as a tool-error result (not a 500), per the existing `except` behavior.

**Verify**: `cd apps/api && python -m pytest plane/tests/contract/app/test_agent_app.py -k atlas_baseline -q` → passes.

### Step 5: Characterization test — MCP server failure degrades gracefully

Add `test_atlas_baseline_mcp_failure_*`: when an MCP server is unreachable (mock
`requests.post` in `mcp_client.py` to raise), assert the agent still functions with
its base tools and the failure is logged rather than crashing the run. Test at the
`MCPClient`/dispatch seam.

**Verify**: `cd apps/api && python -m pytest plane/tests/ -k atlas_baseline -q` → all new tests pass.

## Test plan

- All new tests prefixed `test_atlas_baseline_` so `pytest -k atlas_baseline`
  selects exactly this plan's additions (4 behaviors: doc-replace, token refresh,
  tool-loop cap + handler error, MCP failure).
- Structural pattern: existing `@pytest.mark.contract` classes in
  `test_calendar_app.py` / `test_agent_app.py`, using `session_client`, `workspace`
  fixtures and `monkeypatch` for boundaries.
- Verification: `cd apps/api && python -m pytest plane/tests/ -q` → all pass (existing + new); `pnpm test` from root → exit 0.

## Done criteria

ALL must hold:

- [ ] `pnpm test` exists in root `package.json` and runs the API suite to exit 0
- [ ] `cd apps/api && python -m pytest plane/tests/ -k atlas_baseline -q` runs ≥4 new tests, all passing
- [ ] `cd apps/api && python -m pytest plane/tests/ -q` — full suite green (no regressions)
- [ ] No non-test source file modified except the script-wiring files in scope (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report (do not improvise) if:

- A behavior under test cannot be exercised without refactoring source (e.g. the tool loop has no injectable seam) — write what you can at the nearest seam, mark the rest as a gap, and report; do NOT refactor source here.
- The full suite has pre-existing failures unrelated to your changes — report them; don't "fix" unrelated code.
- The test database can't be created in the executor environment — report the exact error; the suite needs Postgres with `--reuse-db`.
- Wiring `pnpm test` would require changing turbo's build/dev pipelines in a way that risks other apps — stop and report the conflict.

## Maintenance notes

- This is the prerequisite for plan 005 (god-file split): those refactors must keep `pytest -k atlas_baseline` green at each step.
- Follow-up (not in this plan): wire `packages/editor` Vitest tests for the Yjs reconcile helpers, and add `pnpm test` to the API CI workflow (`.github/workflows/pull-request-build-lint-api.yml` currently runs only `ruff`).
- Reviewer should confirm the new tests actually assert behavior (not just status codes) and that mocks are at the network boundary, not mocking the unit under test.
