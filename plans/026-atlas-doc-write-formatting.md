# Plan 026: Atlas doc-write — cosmetic formatting requests

> Executed immediately after planning (same session as the [blank] spacer
> fix, 2026-07-13). This file records the request catalog, the design, and
> what shipped, so follow-ups extend rather than rediscover.

## Status

- **Priority**: P1 (class-fix behind a live user complaint)
- **Effort**: M
- **Risk**: LOW-MED (backend-only; review UI already parses HTML through the
  ProseMirror schema)
- **Depends on**: the [blank] spacer convention (shipped `f7eee663c1`)
- **Category**: product / Atlas

## Why this matters

"Fix spacing between paragraphs" failed because Atlas doc-write could only
emit plain text. That is one instance of a class: every cosmetic-formatting
request dies the same way — `paragraphs_html` escapes everything, so the
model cannot produce a heading, a real list, bold text, a divider, a quote,
a checklist, a link, or a code block. Users will keep asking for these:

## Request catalog (what users will ask for)

| Likely request                                   | Needs                    | Status after this plan |
| ------------------------------------------------ | ------------------------ | ---------------------- |
| "add space between paragraphs"                   | empty `<p>`              | DONE (spacer, f7eee663) |
| "make X bold / italicize / strike"               | inline marks             | DONE (markdown subset) |
| "turn this into a heading / make titles H2"      | `<h1>`–`<h3>`            | DONE                   |
| "turn these lines into bullets / numbered list"  | `<ul>/<ol>`              | DONE (flat lists)      |
| "make this a checklist / todo list"              | TipTap task-list HTML    | DONE                   |
| "add a divider between sections"                 | `<hr>`                   | DONE                   |
| "quote this passage"                             | `<blockquote>`           | DONE                   |
| "format as code"                                 | `<pre><code>` + inline   | DONE                   |
| "link X to <url>"                                | `<a>` (http/https only)  | DONE                   |
| "make a chart of ..."                            | chart-component fence    | pre-existing, kept     |
| tables                                           | table nodes              | DEFERRED               |
| text color / highlight                           | color marks              | DEFERRED               |
| alignment / indentation                          | block attrs              | DEFERRED               |
| images                                           | asset upload flow        | DEFERRED               |

## Design

One class fix instead of nine point fixes: **doc-write proposal content is
now a constrained Markdown subset**, rendered server-side to schema-safe
HTML by `markdown_lite_html()` (new, in `plane/utils/html_builders.py`).

- Hand-rolled line-oriented renderer, no new dependency (mirrors the same
  subset the docs/ux build-reader prototype hand-rolls). Everything is
  HTML-escaped first — no raw-HTML passthrough, so sanitization is inherent.
  Links accept http/https only. Task lists emit TipTap's parse shape
  (`ul[data-type="taskList"] > li[data-type="taskItem"][data-checked]`).
- `_plain_text_to_html` (doc_write) now routes non-chart segments through
  the markdown renderer; ```chart fences and the `[blank]` spacer keep their
  existing handling. `paragraphs_html` itself is untouched (other consumers
  keep plain-text semantics).
- Both doc-write prompts document the subset and add: for formatting-only
  requests, `replace` the named block re-writing it with Markdown formatting
  without changing the words.
- Frontend needs no changes: the review extension parses `content_html` via
  `ProseMirrorDOMParser.parseSlice`, so headings/lists/quotes/hr/task lists
  land as real nodes on Accept.

## Known limitation (accepted, documented in prompts)

The model sees blocks as plain text, so a `replace` cannot preserve inline
marks it was never shown — re-formatting a block that already contains
links/bold flattens them. Prompts instruct Atlas to limit replaces to the
blocks the request names. Fixing this properly means serializing block
content as Markdown in the block list (future work, pairs with tables).

## Verification

- Unit tests: `plane/tests/unit/agents/test_doc_write_formatting.py` —
  renderer cases (headings, marks, lists, checklists, quote, hr, fenced
  code, links incl. javascript: rejection, escaping, br behavior), chart
  fence pass-through, spacer paths (JSON + stream), plus the pre-existing
  34 doc-write tests stay green.
- Runtime: prod smoke after deploy — ask Atlas "turn these lines into a
  checklist" / "make the section titles headings" in a doc and accept.
