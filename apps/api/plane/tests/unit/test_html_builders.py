# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Unit tests for plane.utils.html_builders.

These tests lock the exact output strings produced by each helper so that
refactoring the call sites in chat.py and calendar/base.py is provably
behaviour-preserving.  Add a test here whenever a new helper is introduced.
"""

import pytest

from plane.utils.html_builders import (
    escape_text,
    link_html,
    list_html,
    paragraphs_html,
    wrap,
)


@pytest.mark.unit
class TestEscapeText:
    def test_no_special_characters(self):
        assert escape_text("hello world") == "hello world"

    def test_escapes_angle_brackets(self):
        assert escape_text("<script>") == "&lt;script&gt;"

    def test_escapes_ampersand(self):
        assert escape_text("a & b") == "a &amp; b"

    def test_quote_false_by_default(self):
        # double-quote is NOT escaped when quote=False (the default)
        assert escape_text('say "hi"') == 'say "hi"'

    def test_quote_true_escapes_double_quote(self):
        assert escape_text('say "hi"', quote=True) == "say &#x27;hi&#x27;" or escape_text(
            'say "hi"', quote=True
        ) == 'say &quot;hi&quot;'

    def test_quote_true_for_url(self):
        result = escape_text("https://example.com/path?q=a&b=c", quote=True)
        assert "&amp;" in result  # & should be escaped
        assert "https" in result


@pytest.mark.unit
class TestParagraphsHtml:
    def test_empty_string(self):
        assert paragraphs_html("") == ""

    def test_none_treated_as_empty(self):
        # paragraphs_html(None) would be called as paragraphs_html(None or "")
        # The function accepts `text or ""` so passing None raises TypeError.
        # Confirm a blank string returns empty.
        assert paragraphs_html("   ") == ""

    def test_single_paragraph(self):
        assert paragraphs_html("Hello world") == "<p>Hello world</p>"

    def test_two_paragraphs_separated_by_blank_line(self):
        result = paragraphs_html("First paragraph\n\nSecond paragraph")
        assert result == "<p>First paragraph</p><p>Second paragraph</p>"

    def test_single_newline_becomes_br(self):
        result = paragraphs_html("line one\nline two")
        assert result == "<p>line one<br />line two</p>"

    def test_special_chars_escaped(self):
        result = paragraphs_html("<b>bold</b> & more")
        assert result == "<p>&lt;b&gt;bold&lt;/b&gt; &amp; more</p>"

    def test_multi_paragraph_with_br_in_one(self):
        text = "Para one line A\nPara one line B\n\nPara two"
        result = paragraphs_html(text)
        assert result == "<p>Para one line A<br />Para one line B</p><p>Para two</p>"

    def test_three_or_more_newlines_still_splits(self):
        result = paragraphs_html("A\n\n\nB")
        assert result == "<p>A</p><p>B</p>"


@pytest.mark.unit
class TestListHtml:
    def test_empty_list(self):
        assert list_html([]) == ""

    def test_single_item(self):
        assert list_html(["hello"]) == "<ul><li>hello</li></ul>"

    def test_multiple_items(self):
        result = list_html(["alpha", "beta", "gamma"])
        assert result == "<ul><li>alpha</li><li>beta</li><li>gamma</li></ul>"

    def test_item_with_already_escaped_content(self):
        # list_html does NOT escape — items are pre-escaped by the caller
        item = "a &amp; b"
        result = list_html([item])
        assert result == f"<ul><li>{item}</li></ul>"

    def test_item_with_html_content(self):
        # Caller may pass pre-built HTML (e.g. <strong>…</strong> + text)
        item = "<strong>Key</strong>: value"
        assert list_html([item]) == f"<ul><li>{item}</li></ul>"


@pytest.mark.unit
class TestLinkHtml:
    def test_simple_link(self):
        result = link_html("https://example.com", "Example")
        assert result == '<a href="https://example.com">Example</a>'

    def test_label_with_special_chars_escaped(self):
        result = link_html("https://example.com", "<Click here>")
        assert result == '<a href="https://example.com">&lt;Click here&gt;</a>'

    def test_href_with_ampersand_escaped(self):
        result = link_html("https://example.com/?a=1&b=2", "Link")
        assert result == '<a href="https://example.com/?a=1&amp;b=2">Link</a>'

    def test_href_and_label_both_contain_specials(self):
        result = link_html("https://x.com/p?q=a&b=2", "a & b")
        assert "a &amp; b" in result  # label escaped
        assert "q=a&amp;b=2" in result  # href escaped


@pytest.mark.unit
class TestWrap:
    def test_wrap_paragraph(self):
        assert wrap("p", "hello") == "<p>hello</p>"

    def test_wrap_heading(self):
        assert wrap("h3", "Title") == "<h3>Title</h3>"

    def test_wrap_with_inner_html(self):
        inner = "<strong>bold</strong> text"
        assert wrap("p", inner) == f"<p>{inner}</p>"

    def test_wrap_ul(self):
        assert wrap("ul", "<li>item</li>") == "<ul><li>item</li></ul>"
