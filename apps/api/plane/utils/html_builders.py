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
