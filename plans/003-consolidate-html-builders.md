# Plan 003: Consolidate duplicated server-side HTML builders into one helper module

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report. When done, update the status row in
> `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 866fb1777f..HEAD -- apps/api/plane/app/views/agent/chat.py apps/api/plane/app/views/calendar/base.py`
> On any change, compare "Current state" excerpts against live code; mismatch = STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (do AFTER 002 if you want a test net, but not required)
- **Category**: tech-debt
- **Planned at**: commit `866fb1777f`, 2026-06-10

## Why this matters

Server-side HTML for agent documents and meeting notes is built by string
concatenation in two large files, with the same primitives (escape-and-wrap a
paragraph, render a `<ul>` of escaped items, render an escaped `<a>` link)
re-implemented in each. This is a maintainability cost: adding a format or fixing
a rendering bug means finding and editing every site. Consolidating into one small
helper module reduces the surface and makes the meeting-notes / agent-doc HTML
consistent.

**Scope-honesty note**: an earlier audit framed this as a _security_ issue
("divergent escaping"). That premise was checked and is **false** — both files
already use proper escaping (`html.escape` in `chat.py`, `django.utils.html.escape`
in `calendar/base.py`). This is a pure maintainability cleanup; treat it as P3 and
do not expand scope chasing a security angle that isn't there.

## Current state

- `apps/api/plane/app/views/agent/chat.py`:
  - `_plain_text_to_html(text)` (line 336) — splits on blank lines, wraps each in
    `<p>` with `html.escape` and `<br />`.
  - `_build_fallback_document_html(...)` (line 878) — builds title + body + a
    `<ul>` of source `<li>` links using `html.escape` (lines ~930, ~940).

  ```python
  # chat.py:336-340
  def _plain_text_to_html(text: str) -> str:
      paragraphs = [part.strip() for part in re.split(r"\n{2,}", text or "") if part.strip()]
      if not paragraphs:
          return ""
      return "".join(f"<p>{html.escape(paragraph).replace(chr(10), '<br />')}</p>" for paragraph in paragraphs)
  ```

- `apps/api/plane/app/views/calendar/base.py`:
  - `_structured_summary_html(summary)` (line 1215) — builds `<h3>`, `<p>`, and
    `<ul><li>` sections, each item via `escape(...)` from `django.utils.html`.
  - `_meeting_notes_html(...)` (line ~1170) — builds the metadata `<ul>` and
    transcript `<p>` blocks, also via `escape`.

  ```python
  # calendar/base.py:1234-1242 (representative)
  decisions = summary.get("decisions")
  if isinstance(decisions, list):
      items = "".join(f"<li>{escape(_clean(d))}</li>" for d in decisions if _clean(d))
      if items:
          sections.append(f"<h3>Decisions</h3><ul>{items}</ul>")
  ```

- Convention: prefer `html.escape` (stdlib) — it's already imported in chat.py;
  `django.utils.html.escape` is equivalent for this purpose. Pick `html.escape`
  for the shared module so there are no Django imports in a pure-formatting util.

## Commands you will need

| Purpose | Command                                                                                                 | Expected |
| ------- | ------------------------------------------------------------------------------------------------------- | -------- |
| Lint    | `cd apps/api && ruff check plane/utils/ plane/app/views/agent/chat.py plane/app/views/calendar/base.py` | exit 0   |
| Tests   | `cd apps/api && python -m pytest plane/tests/ -q`                                                       | all pass |

## Scope

**In scope**:

- `apps/api/plane/utils/html_builders.py` (create) — `escape_text`, `paragraphs_html(text)`, `list_html(items)`, `link_html(href, label)`, `wrap(tag, inner)`.
- `apps/api/plane/app/views/agent/chat.py` — refactor `_plain_text_to_html` and the list/link building in `_build_fallback_document_html` to call the shared helpers.
- `apps/api/plane/app/views/calendar/base.py` — refactor the `<li>`/`<p>`/`<ul>` building in `_structured_summary_html` and `_meeting_notes_html` to call the shared helpers.
- `apps/api/plane/tests/unit/test_html_builders.py` (create).

**Out of scope**:

- The LLM prompt strings, the JSON parsing of the summary, and the doc-write
  proposal logic — only the HTML _string assembly_ changes.
- The exact HTML output must not change. This is a behavior-preserving refactor.

## Git workflow

- Branch: `advisor/003-consolidate-html-builders`
- Commit style: `API: consolidate server-side HTML builders into plane/utils`.

## Steps

### Step 1: Create the helper module

`apps/api/plane/utils/html_builders.py` with stdlib `html.escape` only. Each
function returns a string and preserves the exact markup the call sites currently
produce (e.g. `paragraphs_html` splits on blank lines and inserts `<br />` for
single newlines, matching `_plain_text_to_html`).

**Verify**: `cd apps/api && ruff check plane/utils/html_builders.py` → exit 0.

### Step 2: Unit-test the helpers FIRST (lock behavior)

Create `plane/tests/unit/test_html_builders.py` (mark `@pytest.mark.unit`) asserting
the exact output strings for: a two-paragraph text, a single-newline text (→ `<br />`),
a list of items (with one needing escaping like `a & b`), and a link with a label
containing `<`. These tests define "behavior-preserving."

**Verify**: `cd apps/api && python -m pytest plane/tests/unit/test_html_builders.py -q` → pass.

### Step 3: Refactor `chat.py` call sites

Replace the bodies of `_plain_text_to_html` and the list/link assembly in
`_build_fallback_document_html` with calls to the helpers. Keep the function
signatures and return values identical.

**Verify**: `cd apps/api && python -m pytest plane/tests/contract/app/test_agent_app.py -q` → pass (existing tests cover `_build_fallback_document_html` and `_plain_text_to_html` import).

### Step 4: Refactor `calendar/base.py` call sites

Replace the `<li>`/`<ul>`/`<p>` assembly in `_structured_summary_html` and
`_meeting_notes_html` with helper calls. Keep output identical.

**Verify**: `cd apps/api && python -m pytest plane/tests/contract/app/test_calendar_app.py -q` → pass.

## Test plan

- New `plane/tests/unit/test_html_builders.py` (Step 2) — the behavior contract.
- Existing contract tests cover the call sites; they must stay green.
- Verification: `cd apps/api && python -m pytest plane/tests/ -q` → all pass.

## Done criteria

ALL must hold:

- [ ] `plane/utils/html_builders.py` exists; `grep -rn "html_builders" plane/app/views/agent/chat.py plane/app/views/calendar/base.py` shows both importing it
- [ ] `cd apps/api && python -m pytest plane/tests/ -q` — all pass (existing + new unit tests)
- [ ] `cd apps/api && ruff check plane/` exits 0
- [ ] No HTML output changed (the unit tests + existing contract tests are the proof)
- [ ] No files outside scope modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- Making the output identical requires changing a helper to be call-site-specific (i.e. the duplication isn't actually the same logic) — report which sites diverge instead of forcing a shared helper.
- An existing contract test starts failing and the cause is a real output difference you can't reconcile — the refactor isn't behavior-preserving; report it.

## Maintenance notes

- Future HTML formats (bold, code blocks, headings) should be added to `html_builders.py`, not re-hand-rolled at a call site.
- Reviewer should diff the rendered HTML for one real meeting-notes payload before/after to confirm byte-identical output.
- Deliberately deferred: the `live`/editor-side HTML→Yjs conversion is unrelated and out of scope.
