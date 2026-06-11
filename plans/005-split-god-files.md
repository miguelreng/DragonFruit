# Plan 005: Split the three Atlas "god files" into cohesive modules

> **Executor instructions**: This is a behavior-preserving refactor. Do ONE file
> at a time, keep the test suite green between every move, and obey STOP
> conditions. Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 866fb1777f..HEAD -- apps/api/plane/app/views/agent/chat.py apps/api/plane/app/views/calendar/base.py apps/Copilot/Sources/MeetingStore.swift`
> On any change, re-derive the line ranges below from the live files; do not trust
> stale line numbers.

## Status

- **Priority**: P3
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: **002** (verification baseline) — do not start until `pytest -k atlas_baseline` exists and is green.
- **Category**: tech-debt
- **Planned at**: commit `866fb1777f`, 2026-06-10

## Why this matters

Three files carry most of the custom Atlas surface and are far above the repo's
median size, which makes them slow to review and risky to change:

- `apps/Copilot/Sources/MeetingStore.swift` — ~4268 lines (meeting lifecycle, system-audio capture, speech recognition, Whisper, upload, state, UI coordination).
- `apps/api/plane/app/views/agent/chat.py` — ~1915 lines (40+ helpers: document building, web/workspace search, HTML, doc-write proposal parsing, streaming, fallbacks).
- `apps/api/plane/app/views/calendar/base.py` — ~1606 lines (15 endpoint classes + ~30 OAuth/token/Google/summary helpers).

Splitting them into cohesive modules lowers cognitive load and review risk. Because
these files are load-bearing, this is explicitly gated behind the test baseline
(plan 002) and done as pure **move + re-import**, never logic changes.

## Current state

Measured sizes (re-confirm with `wc -l` during the drift check — they will have
changed if 001/003 landed):

```
apps/Copilot/Sources/MeetingStore.swift     ~4268
apps/api/plane/app/views/agent/chat.py      ~1915
apps/api/plane/app/views/calendar/base.py   ~1606
```

Extraction seams already visible in the code:

- `calendar/base.py`: OAuth/token helpers cluster (`_client_credential_candidates`,
  `_token_exchange_candidates`, `_upsert_calendar_account`, the Google API request
  helper) → a `google_oauth.py` module.
- `chat.py`: doc-write proposal logic (`_normalise_doc_write_proposals`,
  `_document_blocks_from_json`, `_text_from_pm_node`, streaming/event helpers) →
  an `agent/doc_write.py` module; the HTML helpers may already be extracted by plan 003.
- `MeetingStore.swift`: `SystemAudioCapture` (a self-contained `private final class`)
  and the speech-recognition code → separate Swift files.

## Commands you will need

| Purpose         | Command                                                                                                                                                                     | Expected                |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| API tests       | `cd apps/api && python -m pytest plane/tests/ -q`                                                                                                                           | all pass                |
| Baseline subset | `cd apps/api && python -m pytest plane/tests/ -k atlas_baseline -q`                                                                                                         | all pass                |
| API lint        | `cd apps/api && ruff check plane/`                                                                                                                                          | exit 0                  |
| Swift build     | `cd apps/Copilot && xcodebuild -project DragonFruitMini.xcodeproj -scheme DragonFruitMini -configuration Debug -derivedDataPath .build/xcode build CODE_SIGNING_ALLOWED=NO` | `** BUILD SUCCEEDED **` |

## Scope

**In scope** (create new modules + adjust imports; move code verbatim):

- `apps/api/plane/app/views/calendar/google_oauth.py` (create) + edits to `calendar/base.py`.
- `apps/api/plane/app/views/agent/doc_write.py` (create) + edits to `agent/chat.py`.
- `apps/Copilot/Sources/SystemAudioCapture.swift` (create) + edits to `MeetingStore.swift`; if the Xcode project is generated, also `apps/Copilot/scripts_generate_project.rb` or the `.xcodeproj` file list so the new file compiles.

**Out of scope**:

- ANY behavior change. No renamed public functions, no signature changes, no "while I'm here" fixes. Pure relocation + import wiring.
- The URL fields, endpoint routes, and serializers — unchanged.

## Git workflow

- Branch: `advisor/005-split-god-files`
- One commit per extracted module; tests/build green at each commit.
- Commit style: `Refactor: extract <module> from <file> (no behavior change)`.

## Steps

Do the **Python files first** (cheapest to verify), one module per step. Do the
Swift file last (build is slower, project-file wiring is fiddly).

### Step 1: Extract `google_oauth.py` from `calendar/base.py`

Move the OAuth/token/credential helper functions (identify them by reading the file
— the `_client_credential_candidates`, `_token_exchange_candidates`,
`_upsert_calendar_account`, and the Google API request helper cluster) into a new
`apps/api/plane/app/views/calendar/google_oauth.py`. Re-import them into `base.py`
(`from .google_oauth import ...`) so existing references resolve unchanged. Move
only functions with no circular dependency on endpoint classes; if a helper
references a module-level constant, move or import that too.

**Verify**: `cd apps/api && ruff check plane/ && python -m pytest plane/tests/ -q` → all pass.

### Step 2: Extract `agent/doc_write.py` from `chat.py`

Move the doc-write proposal helpers (`_normalise_doc_write_proposals`,
`_document_blocks_from_json`, `_text_from_pm_node`, and the stream/event helpers
they use) into `apps/api/plane/app/views/agent/doc_write.py`; re-import into
`chat.py`. Note `test_agent_app.py` imports several `chat.py` helpers by name —
keep those importable from `chat.py` (re-export if you move them) so the tests
don't break.

**Verify**: `cd apps/api && ruff check plane/ && python -m pytest plane/tests/contract/app/test_agent_app.py -q` → pass; then full suite `python -m pytest plane/tests/ -q` → pass.

### Step 3: Extract `SystemAudioCapture.swift` from `MeetingStore.swift`

Move the `private final class SystemAudioCapture` (and any helper extensions it
owns, e.g. `AudioObjectID` extensions used only by it) into a new
`apps/Copilot/Sources/SystemAudioCapture.swift`. Change `private` to internal
visibility as needed so `MeetingStore` can still use it within the module. If the
Xcode project file enumerates sources explicitly, add the new file to the build
(check `scripts_generate_project.rb`; if the project is generated, regenerate it
per `apps/Copilot/README.md`/`INSTALL.md`).

**Verify**: `cd apps/Copilot && xcodebuild ... build CODE_SIGNING_ALLOWED=NO` → `** BUILD SUCCEEDED **`.

### Step 4 (optional, only if time/appetite): further Swift split

If Step 3 went cleanly, optionally extract the speech-recognition code similarly.
If anything about the project-file wiring is uncertain, STOP after Step 3 and
report — a half-wired Xcode target is worse than a large file.

## Test plan

- No new tests — plan 002's `atlas_baseline` tests + the existing suite are the
  safety net. They must stay green at every commit.
- Swift has no unit suite; the build succeeding is the gate.

## Done criteria

ALL must hold:

- [ ] `cd apps/api && python -m pytest plane/tests/ -q` — all pass (including `-k atlas_baseline`)
- [ ] `cd apps/api && ruff check plane/` exits 0
- [ ] `cd apps/Copilot && xcodebuild ... build CODE_SIGNING_ALLOWED=NO` → `** BUILD SUCCEEDED **`
- [ ] `git diff 866fb1777f..HEAD` shows only moves + imports — no logic edits (reviewer-checkable)
- [ ] Each of the three source files is meaningfully smaller (`wc -l`)
- [ ] No files outside scope modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report (do not improvise) if:

- Plan 002's `atlas_baseline` tests do not exist yet — this plan depends on them.
- A helper can't be moved without a circular import — report the cycle; don't restructure logic to break it in this plan.
- The Xcode project file is not obviously regenerable and adding the new Swift file risks breaking the build — stop after the Python steps and report.
- You find yourself wanting to "improve" logic while moving it — that's a separate plan; keep this one pure.

## Maintenance notes

- Keep re-exports in `chat.py` for any helper the tests import by name, or update the test imports in the same commit (and note it).
- After this lands, the audit's other plans (003 HTML builders) become trivially mergeable; if 003 hasn't landed yet, coordinate to avoid conflicting moves of the HTML helpers.
- Reviewer's main job: confirm zero behavior change — diff should be almost entirely cut/paste + import lines.
