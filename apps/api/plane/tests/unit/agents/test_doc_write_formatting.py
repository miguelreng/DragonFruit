# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Unit tests for Atlas doc-write cosmetic formatting (plan 026).

Covers the markdown-lite renderer, the [blank] spacer convention, and the
chart-fence pass-through — the three mechanisms that let doc-write express
formatting requests (spacing, headings, emphasis, lists, checklists, quotes,
dividers, links, code) as schema-safe HTML.
"""

import pytest

from plane.app.views.agent.doc_write import (
    _is_blank_spacer,
    _normalise_doc_write_proposals,
    _plain_text_to_html,
    _stream_doc_write_events,
)
from plane.utils.html_builders import markdown_lite_html


BLOCKS = [
    {"id": "b1", "type": "paragraph", "text": "First para"},
    {"id": "b2", "type": "paragraph", "text": "Second para"},
]
BLOCK_MAP = {block["id"]: block for block in BLOCKS}


@pytest.mark.unit
class TestMarkdownLiteHtml:
    def test_blank_input_is_empty(self):
        assert markdown_lite_html("") == ""
        assert markdown_lite_html("   \n \n") == ""

    def test_plain_paragraphs_match_previous_semantics(self):
        assert markdown_lite_html("Hello world") == "<p>Hello world</p>"
        assert markdown_lite_html("One\n\nTwo") == "<p>One</p><p>Two</p>"
        # single newline inside a paragraph stays a soft break
        assert markdown_lite_html("line one\nline two") == "<p>line one<br />line two</p>"

    def test_headings(self):
        assert markdown_lite_html("# Title") == "<h1>Title</h1>"
        assert markdown_lite_html("## Section") == "<h2>Section</h2>"
        assert markdown_lite_html("### Sub") == "<h3>Sub</h3>"

    def test_inline_marks(self):
        assert markdown_lite_html("**bold** move") == "<p><strong>bold</strong> move</p>"
        assert markdown_lite_html("a *quiet* word") == "<p>a <em>quiet</em> word</p>"
        assert markdown_lite_html("~~gone~~ now") == "<p><s>gone</s> now</p>"
        assert markdown_lite_html("run `pnpm dev` now") == "<p>run <code>pnpm dev</code> now</p>"

    def test_marks_inside_code_span_stay_literal(self):
        assert markdown_lite_html("`**not bold**`") == "<p><code>**not bold**</code></p>"

    def test_links_http_only(self):
        assert (
            markdown_lite_html("see [the docs](https://example.com/a)")
            == '<p>see <a href="https://example.com/a" target="_blank" rel="noopener noreferrer">the docs</a></p>'
        )
        # non-http(s) schemes stay literal text
        assert "<a" not in markdown_lite_html("[x](javascript:alert(1))")

    def test_bullet_and_ordered_lists(self):
        assert (
            markdown_lite_html("- one\n- two")
            == "<ul><li><p>one</p></li><li><p>two</p></li></ul>"
        )
        assert (
            markdown_lite_html("1. first\n2. second")
            == "<ol><li><p>first</p></li><li><p>second</p></li></ol>"
        )

    def test_task_list_uses_tiptap_shape(self):
        html = markdown_lite_html("- [ ] draft\n- [x] ship")
        assert html.startswith('<ul data-type="taskList">')
        assert '<li data-type="taskItem" data-checked="false"><p>draft</p></li>' in html
        assert '<li data-type="taskItem" data-checked="true"><p>ship</p></li>' in html

    def test_blockquote_and_divider(self):
        assert markdown_lite_html("> wise words") == "<blockquote><p>wise words</p></blockquote>"
        assert markdown_lite_html("---") == "<hr>"

    def test_fenced_code_block_is_escaped(self):
        html = markdown_lite_html("```\nif a < b:\n    run()\n```")
        assert html == "<pre><code>if a &lt; b:\n    run()</code></pre>"

    def test_raw_html_is_escaped(self):
        assert markdown_lite_html("<script>alert(1)</script>") == "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>"

    def test_mixed_document(self):
        html = markdown_lite_html("## Plan\n\n- [ ] **bold** item\n\n---\n\n> note")
        assert "<h2>Plan</h2>" in html
        assert '<li data-type="taskItem" data-checked="false"><p><strong>bold</strong> item</p></li>' in html
        assert "<hr>" in html
        assert "<blockquote><p>note</p></blockquote>" in html


@pytest.mark.unit
class TestPlainTextToHtml:
    def test_markdown_flows_through(self):
        assert _plain_text_to_html("## Heading") == "<h2>Heading</h2>"

    def test_chart_fence_still_intercepted(self):
        text = 'Before\n\n```chart\n{"type": "bar", "labels": ["A"], "series": [{"name": "S", "values": [1]}]}\n```\n\n## After'
        html = _plain_text_to_html(text)
        assert "<chart-component" in html
        assert "<p>Before</p>" in html
        assert "<h2>After</h2>" in html


@pytest.mark.unit
class TestBlankSpacer:
    def test_token_detection(self):
        assert _is_blank_spacer("[blank]")
        assert _is_blank_spacer("  [Space] ")
        assert _is_blank_spacer("[EMPTY]")
        assert not _is_blank_spacer("blank")
        assert not _is_blank_spacer("[blank] plus text")

    def test_json_normaliser_emits_empty_paragraph(self):
        raw = {
            "proposals": [
                {"operation": "insert_after", "target_block_id": "b1", "content_text": "[blank]"},
                {"operation": "replace", "target_block_id": "b2", "content_text": "**Rewritten**"},
                {"operation": "insert_after", "target_block_id": "", "content_text": "   "},
            ]
        }
        out = _normalise_doc_write_proposals(raw, mode="update", intent="write", blocks=BLOCKS, fallback_text="")
        assert len(out) == 2
        assert out[0]["operation"] == "insert_after"
        assert out[0]["target_block_id"] == "b1"
        assert out[0]["content_html"] == "<p></p>"
        assert out[1]["content_html"] == "<p><strong>Rewritten</strong></p>"

    def test_stream_parser_emits_empty_paragraph(self):
        tokens = [
            "@@ATLAS op=insert_after target=b1\n",
            "[blank]\n",
            "@@ATLAS op=replace target=b2\n",
            "### Better heading\n",
        ]
        events = list(_stream_doc_write_events(iter(tokens), mode="update", intent="write", block_map=BLOCK_MAP))
        completed = [payload for event, payload in events if event == "proposal_completed"]
        assert len(completed) == 2
        assert completed[0]["content_text"] == ""
        assert completed[0]["content_html"] == "<p></p>"
        assert completed[1]["content_html"] == "<h3>Better heading</h3>"
