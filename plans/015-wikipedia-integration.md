# Plan 015: Wikipedia integration — grounding tool, inline card, entity-definition proposals

> **Executor instructions**: Build in 3 phases, **commit per phase**, and verify each
> before the next. A shared Wikipedia client is the foundation (Phase A) the others
> reuse. There is no web/editor runtime harness — verify with the API suite
> (Phase A) + typecheck/build/lint (B/C); the reviewer smoke-tests. `@plane/editor`
> is consumed from dist — rebuild after editing it. If a STOP condition occurs, stop
> and report. SKIP updating plans/README.md. Audit claims against real tool output.
> Reply with the report format at the end.
>
> **Drift check (run first)**: `git diff --stat 9c29bd3fcb..HEAD -- apps/api/plane/app/views/agent/chat.py apps/api/plane/llm`

## Status

- **Priority**: P2 · **Effort**: M–L (3 phases) · **Risk**: MED (new prod features; can't runtime-verify in worktree → reviewer smokes)
- **Depends on**: none · **Category**: feature
- **Planned at**: commit `9c29bd3fcb`, 2026-06-10

## Why

Atlas states facts and writes docs, but its "Sources" come from the model (hallucination-prone). Wikipedia's free REST API (no auth, CORS-friendly) gives **real, citable** summaries. Three uses: (A) a grounding/citation tool the agent calls, (B) an inline knowledge card in the editor, (C) cited entity-definition proposals.

## Environment

- API: local Postgres+Redis (user/pw/db=plane, redis 6379), MAIN checkout's `.venv/bin/python`; env vars as SEPARATE tokens.
- Web/editor: `pnpm install` (worktree, hardlinks), `pnpm turbo run build --filter=@plane/editor`, `check:types --filter=web --filter=@plane/editor`, `pnpm check:lint`.

## Wikipedia API reference (use these exact endpoints)

- **Search**: `GET https://{lang}.wikipedia.org/w/rest.php/v1/search/page?q=<q>&limit=<n>` → `{ pages: [{ key, title, description, excerpt }] }`
- **Summary**: `GET https://{lang}.wikipedia.org/api/rest_v1/page/summary/<title>` → `{ title, extract, content_urls: { desktop: { page } }, thumbnail: { source } }`
- Always send a descriptive `User-Agent` header (Wikipedia requires it; e.g. `"DragonFruit-Atlas/1.0 (https://dragonfruit.sh)"`), a short timeout (~6s), and handle non-200/missing fields gracefully. Default `lang="en"`.
- Host is fixed `*.wikipedia.org` — no SSRF concern (unlike the MCP URLs in plan 001).

---

## Phase A — server grounding tool + citations (commit 1)

### A1: `apps/api/plane/llm/wikipedia.py` (create)

Two functions using `requests`:

- `search_wikipedia(query: str, *, lang: str = "en", limit: int = 3) -> list[dict]` → `[{title, description, key}]` from the search endpoint.
- `wikipedia_summary(title: str, *, lang: str = "en") -> dict | None` → `{title, extract, url, thumbnail}` from the summary endpoint (None on failure).
  Both: descriptive User-Agent, timeout, try/except returning empty/None on error (never raise into the agent loop).

### A2: `_make_wikipedia_lookup_tool()` in chat.py + register

- Add an `LLMTool` named `lookup_wikipedia`, params schema `{ "query": {"type": "string"} }` (+ optional `lang`). Handler: `search_wikipedia(query)` → take top hit → `wikipedia_summary(...)` → return a compact string like `"<title>: <extract>\n(source: <url>)"`, or `"No Wikipedia article found for '<query>'."` Cap the extract (~1500 chars). On any error return a short `"wikipedia_error: ..."` string (the loop's existing handler tolerates that).
- Register it in the tools list at `chat.py:1487` (alongside `web_search`/`search_workspace`).

### A3: prompt nudge (chat.py `_CHAT_INTENT_SYSTEM_PROMPT`)

Add one line: _"For factual questions about real-world entities, history, science, or definitions, call `lookup_wikipedia` to ground your answer and cite the returned URL — prefer it over stating facts from memory. In document Sources sections, use real URLs returned by `lookup_wikipedia`, never invented ones."_ Do not remove existing rules.

### A4: tests

`apps/api/plane/tests/unit/test_wikipedia.py` (mark `@pytest.mark.unit`): monkeypatch `requests.get` to return canned search + summary payloads; assert `search_wikipedia`/`wikipedia_summary` parse correctly, and that the tool handler returns the cited string (and the graceful "not found"/error strings on bad responses).

**Verify A**: `ruff check` clean on changed files; `python -m pytest plane/tests/unit/test_wikipedia.py -q` passes; full suite still 0 failed. **Commit.**

---

## Phase B — inline knowledge card in the editor (commit 2)

Goal: select text in a doc → a "Look up on Wikipedia" affordance → a popover **card** (title + extract + thumbnail + "Read more" link) with an **"Insert as cited block"** action. Scope it to a **selection/bubble-menu trigger** (not hover-entity-detection — that's a follow-up).

- Add a client-side fetch util (the Wikipedia REST API is CORS-friendly, so call it directly from the browser — no backend route needed). Put it in the editor package (e.g. `packages/editor/src/core/extensions/wikipedia-card/client.ts`) or a web util — match where other editor fetch helpers live.
- Add the card UI: reuse the editor's existing bubble-menu / popover pattern (grep `extensions/` for the bubble menu / a Tippy/floating popover already in use; follow it). The card shows summary fields; "Insert as cited block" inserts `<h-ish>title</h> <p>extract</p> <p>Source: <a>url</a></p>` at the selection (a normal editor insert — this is user-initiated content, not an Atlas artifact).
- If the editor has no reusable popover primitive, prefer the **slash-command** route instead: add a `/wiki` command (see `extensions/slash-commands`) that prompts for / uses the selection as the query and inserts the cited block. Pick whichever fits the existing primitives with the least new surface; report which you chose.

**Verify B**: `pnpm turbo run check:types --filter=@plane/editor` exit 0 → `build --filter=@plane/editor` success → `check:types --filter=web` exit 0 → `pnpm check:lint` no new errors. **Commit.**

## Phase C — cited entity-definition proposals (commit 3)

Goal: when Atlas writes/expands a doc and references a notable entity, it can propose a short **cited definition** as a doc-write proposal (reusing the existing proposal + 012 multi-select UI).

- This builds on Phase A. The doc-write _stream_ path (`_DOC_WRITE_STREAM_SYSTEM_PROMPT`) has no tool access, so do the grounding as a **pre-step**: in the doc-write endpoint (`chat.py`, the `/doc-writes/` handler ~1077–1200), before streaming, optionally fetch Wikipedia summaries for entities the request is about (e.g. when the user asks to "explain/define/add background on X") and inject them into the prompt as `"Cited reference material (use and cite the URLs):\n<summaries>"`. Keep it bounded: only when the request looks definitional, fetch ≤3 summaries.
- Update `_DOC_WRITE_STREAM_SYSTEM_PROMPT` / `_DOC_WRITE_SYSTEM_PROMPT` to say: _"When reference material is provided, ground factual statements in it and include a final cited line/Source where appropriate; do not invent sources."_
- The proposals remain normal doc content (clean) — the only change is they're grounded + cited when reference material exists. No personality (it's a result).

**Verify C**: full API suite still 0 failed; `ruff check` clean on changed files.

---

## Phase D — `@wiki` mention token (idea #1) (commit 4)

Goal: type `@wiki <topic>` → a search dropdown of Wikipedia hits → selecting inserts a **linked, hover-able entity reference** (mention node → article URL; hover shows the summary card). Reuses the existing **mentions** extension + Phase B's `wikipedia-client`.

- `packages/editor/src/core/extensions/mentions/` already implements `@`-mention triggers/suggestion lists. Add a `@wiki` trigger (or a wiki mention category) whose suggestion source is `searchWikipedia(query)` (debounced) and whose selected item inserts a mention node carrying `{ label, url }`. On hover, show the summary via `fetchWikipediaSummary` (reuse a popover primitive if one exists; else render a styled link with a `title` tooltip — report which).
- Match the existing mention node's markup/serialization so it round-trips through Yjs/HTML like other mentions.
- **Verify**: `check:types --filter=@plane/editor` exit 0 → build success → `check:types --filter=web` exit 0 → lint clean. Commit.
- **STOP** if the mentions suggestion source can't take an async/remote provider without a large refactor — report and fall back to a `/wiki-link` slash command.

## Phase E — "Cite this" on selection (idea #10) (commit 5)

Goal: select an existing claim → "Cite this" → find the best-matching Wikipedia article and insert an inline citation/footnote (grounds _existing_ prose). Reuses the selection trigger + Phase B's `wikipedia-client`.

- Web-only for v1 (no LLM): add a selection action on the same surface chosen in Phase B (`/cite` slash command, or a bubble-menu item if one exists). It runs `searchWikipedia(selectionText)`, takes the top hit, and inserts a citation after the selection — a superscript/inline link (`<sup><a href=url>[wiki]</a></sup>`) or a "Sources" line; match whatever footnote/link pattern the editor already supports (report which).
- Optional later (out of scope v1): use the LLM to pick the _most relevant_ article and verify the claim is supported.
- **Verify**: editor + web typecheck, editor build, lint clean. Commit.
- **STOP** if anchoring a citation to a selection needs a new footnote subsystem — report; ship a simpler inline-link-after-selection.

## Scope

**In scope**: `apps/api/plane/llm/wikipedia.py` (new), `apps/api/plane/app/views/agent/chat.py`, `apps/api/plane/tests/unit/test_wikipedia.py` (new); editor: a `wikipedia-card` extension/util + the card or `/wiki` command; `apps/api/plane/app/views/agent/doc_write.py` (prompt nudge).
**Out of scope**: hover-entity auto-detection, `@wiki` mentions, multilingual UI, image suggestions (future ideas). The MCP-server packaging (could come later). Meeting-notes enrichment.

## Git workflow

- Branch: `advisor/015-wikipedia-integration`
- 3 commits (one per phase): `Wikipedia: <phase>`. Do NOT push/PR.

## Done criteria

- [ ] Phase A: `lookup_wikipedia` tool registered + prompt nudge; `test_wikipedia.py` passes; full suite 0 failed; ruff clean
- [ ] Phase B: selection card OR `/wiki` command inserts a cited summary block; editor+web typecheck, editor build, lint all green
- [ ] Phase C: doc-write grounds on injected Wikipedia reference material when the request is definitional; suite still 0 failed
- [ ] Only in-scope files changed (`git status`)
- [ ] Report: which Phase-B approach you chose, and that runtime smoke is pending the reviewer

## STOP conditions

- Phase B has no reusable popover/bubble/slash primitive to build on and would require a large new UI subsystem — STOP after A (+ report), don't hand-roll a popover framework.
- A test asserts on prompt text and fails — report (don't gut it).
- The doc-write endpoint structure doesn't allow a clean pre-step injection — report; ship A+B and leave C as a follow-up rather than forcing it.
- Wikipedia calls would need auth or hit rate limits in tests — you must mock all network in tests; never hit the real API from the suite.

## Maintenance notes

- The grounding tool is the high-value core; B and C are additive. If time/risk forces a cut, A alone is a complete, shippable win.
- Future: package as an MCP server for the Integrations store; add `@wiki` mentions / hover cards / fact-check lens (see the 10-ideas list).
- Network is mocked in tests; the real API is only hit at runtime. Respect Wikipedia's UA requirement.
