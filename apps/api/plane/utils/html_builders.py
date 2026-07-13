# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Shared server-side HTML building primitives.

All functions use stdlib ``html.escape`` only (no Django dependency) and
return plain strings.  They exist so that the various server-side HTML
composers (agent document writer, calendar meeting-notes builder, …) don't
re-implement the same escape-and-wrap logic in isolation.

Rule: the output of every function here must be identical to the inline
expression it replaces.  Do NOT change semantics without updating both the
call sites and the unit tests in plane/tests/unit/test_html_builders.py.
"""

import html
import re


def escape_text(text: str, *, quote: bool = False) -> str:
    """Return *text* with HTML special characters escaped.

    Thin wrapper around ``html.escape`` so callers don't need to import it
    directly, and so the ``quote`` kwarg is available for URL-like values.
    """
    return html.escape(text, quote=quote)


def paragraphs_html(text: str) -> str:
    """Convert *text* to a sequence of ``<p>`` elements.

    Blank lines delimit paragraphs; single newlines within a paragraph
    become ``<br />``.  Returns an empty string when *text* is blank.

    This reproduces exactly the behaviour of ``_plain_text_to_html`` in
    ``plane/app/views/agent/chat.py``.
    """
    paragraphs = [part.strip() for part in re.split(r"\n{2,}", text or "") if part.strip()]
    if not paragraphs:
        return ""
    return "".join(
        f"<p>{html.escape(paragraph).replace(chr(10), '<br />')}</p>"
        for paragraph in paragraphs
    )


def list_html(items: list[str]) -> str:
    """Wrap *items* in ``<ul><li>…</li></ul>``.

    Each item string is inserted verbatim (the caller is responsible for
    escaping individual item content before passing it in).  Returns an
    empty string when *items* is empty.
    """
    if not items:
        return ""
    inner = "".join(f"<li>{item}</li>" for item in items)
    return f"<ul>{inner}</ul>"


def link_html(href: str, label: str) -> str:
    """Return ``<a href="{href}">{label}</a>``.

    *href* is escaped with ``quote=True`` (safe for URL attributes);
    *label* is escaped with the default settings.
    """
    safe_href = html.escape(href, quote=True)
    safe_label = html.escape(label)
    return f'<a href="{safe_href}">{safe_label}</a>'


def wrap(tag: str, inner: str) -> str:
    """Return *inner* wrapped in ``<tag>…</tag>``.

    No escaping is applied — *inner* is expected to already contain valid
    HTML.  This is a convenience function for structural elements like
    ``<ul>``, ``<h3>``, ``<p>``, etc.
    """
    return f"<{tag}>{inner}</{tag}>"


# ---------------------------------------------------------------------------
# Markdown-lite renderer (Atlas doc-write proposals)
# ---------------------------------------------------------------------------
#
# A deliberately constrained, hand-rolled Markdown subset so agent proposals
# can express cosmetic formatting (headings, emphasis, lists, checklists,
# quotes, dividers, links, code) as schema-safe HTML. Everything is escaped
# before marks are applied — there is NO raw-HTML passthrough — and links are
# restricted to http/https, so the output is safe to hand to the editor's
# ProseMirror parser. Task lists emit TipTap's parse shape.
#
# Supported (documented in the doc-write prompts):
#   #/##/### headings (h4-h6 accepted too) · **bold** · *italic* · ~~strike~~
#   `code` · [text](http url) · - bullets · 1. numbered · - [ ]/- [x] tasks
#   > blockquote · ``` fenced code · --- divider. Lists are FLAT (one level).

_MD_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*#*\s*$")
_MD_HR_RE = re.compile(r"^\s*(?:-{3,}|\*{3,}|_{3,})\s*$")
_MD_TASK_RE = re.compile(r"^\s*[-*]\s+\[( |x|X)\]\s+(.*)$")
_MD_BULLET_RE = re.compile(r"^\s*[-*]\s+(.*)$")
_MD_ORDERED_RE = re.compile(r"^\s*\d+[.)]\s+(.*)$")
_MD_QUOTE_RE = re.compile(r"^\s*>\s?(.*)$")
_MD_FENCE_RE = re.compile(r"^\s*```")

_MD_CODE_SPAN_RE = re.compile(r"`([^`]+)`")
_MD_BOLD_RE = re.compile(r"(?:\*\*|__)(?=\S)(.+?)(?<=\S)(?:\*\*|__)")
_MD_ITALIC_RE = re.compile(r"(?<![\w*])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![\w*])")
_MD_STRIKE_RE = re.compile(r"~~(?=\S)(.+?)(?<=\S)~~")
_MD_LINK_RE = re.compile(r"\[([^\]\n]+)\]\((https?://[^)\s]+)\)")


def _md_inline(text: str) -> str:
    """Escape *text* and apply inline marks. Code spans are lifted out first
    so mark syntax inside them stays literal."""
    escaped = html.escape(text)
    spans: list[str] = []

    def _stash_code(match: re.Match) -> str:
        spans.append(f"<code>{match.group(1)}</code>")
        return f"\x00{len(spans) - 1}\x00"

    working = _MD_CODE_SPAN_RE.sub(_stash_code, escaped)
    working = _MD_LINK_RE.sub(
        lambda m: f'<a href="{html.escape(m.group(2), quote=True)}" target="_blank" rel="noopener noreferrer">{m.group(1)}</a>',
        working,
    )
    working = _MD_BOLD_RE.sub(lambda m: f"<strong>{m.group(1)}</strong>", working)
    working = _MD_ITALIC_RE.sub(lambda m: f"<em>{m.group(1)}</em>", working)
    working = _MD_STRIKE_RE.sub(lambda m: f"<s>{m.group(1)}</s>", working)
    for index, span in enumerate(spans):
        working = working.replace(f"\x00{index}\x00", span)
    return working


def markdown_lite_html(text: str) -> str:
    """Render the doc-write Markdown subset to HTML.

    Returns an empty string when *text* is blank (mirrors paragraphs_html).
    """
    lines = (text or "").split("\n")
    out: list[str] = []
    paragraph: list[str] = []
    list_tag: str | None = None  # "ul" | "ol" | "task"
    quote: list[str] = []
    fence: list[str] | None = None

    def close_paragraph() -> None:
        if paragraph:
            out.append("<p>" + "<br />".join(paragraph) + "</p>")
            paragraph.clear()

    def close_list() -> None:
        nonlocal list_tag
        if list_tag == "task":
            out.append("</ul>")
        elif list_tag:
            out.append(f"</{list_tag}>")
        list_tag = None

    def close_quote() -> None:
        if quote:
            out.append("<blockquote>" + "".join(f"<p>{part}</p>" for part in quote) + "</blockquote>")
            quote.clear()

    def open_list(kind: str) -> None:
        nonlocal list_tag
        if list_tag == kind:
            return
        close_list()
        if kind == "task":
            out.append('<ul data-type="taskList">')
        else:
            out.append(f"<{kind}>")
        list_tag = kind

    for line in lines:
        if fence is not None:
            if _MD_FENCE_RE.match(line):
                out.append("<pre><code>" + html.escape("\n".join(fence)) + "</code></pre>")
                fence = None
            else:
                fence.append(line)
            continue
        if _MD_FENCE_RE.match(line):
            close_paragraph(); close_list(); close_quote()
            fence = []
            continue
        if not line.strip():
            close_paragraph(); close_list(); close_quote()
            continue

        heading = _MD_HEADING_RE.match(line)
        if heading:
            close_paragraph(); close_list(); close_quote()
            level = len(heading.group(1))
            out.append(f"<h{level}>{_md_inline(heading.group(2))}</h{level}>")
            continue
        if _MD_HR_RE.match(line):
            close_paragraph(); close_list(); close_quote()
            out.append("<hr>")
            continue
        task = _MD_TASK_RE.match(line)
        if task:
            close_paragraph(); close_quote()
            open_list("task")
            checked = "true" if task.group(1).lower() == "x" else "false"
            out.append(
                f'<li data-type="taskItem" data-checked="{checked}"><p>{_md_inline(task.group(2))}</p></li>'
            )
            continue
        bullet = _MD_BULLET_RE.match(line)
        if bullet:
            close_paragraph(); close_quote()
            open_list("ul")
            out.append(f"<li><p>{_md_inline(bullet.group(1))}</p></li>")
            continue
        ordered = _MD_ORDERED_RE.match(line)
        if ordered:
            close_paragraph(); close_quote()
            open_list("ol")
            out.append(f"<li><p>{_md_inline(ordered.group(1))}</p></li>")
            continue
        quoted = _MD_QUOTE_RE.match(line)
        if quoted:
            close_paragraph(); close_list()
            if quoted.group(1).strip():
                quote.append(_md_inline(quoted.group(1)))
            continue

        close_list(); close_quote()
        paragraph.append(_md_inline(line.strip()))

    if fence is not None:
        out.append("<pre><code>" + html.escape("\n".join(fence)) + "</code></pre>")
    close_paragraph(); close_list(); close_quote()
    return "".join(out)
