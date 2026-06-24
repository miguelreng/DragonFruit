# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Unit tests for the deterministic Atlas find-replace doc-write path.

These cover the two pure helpers added to plane.app.views.agent.doc_write:

  - parse_find_replace(prompt) -> (search, replacement) | None
  - build_find_replace_proposals(blocks, search, replacement) -> [proposal, ...]

The point of the deterministic path is correctness on a literal word swap:
the LLM drafts a couple of block edits and misses occurrences (notably the H1
title), so for a clean "replace X for Y" we build every edit ourselves. No DB,
redis, or LLM is involved — the helpers operate purely on the parsed prompt and
the already-extracted block list.
"""

import pytest

from plane.app.views.agent.doc_write import (
    _document_blocks_from_json,
    build_find_replace_proposals,
    parse_find_replace,
)


def _pm_text(text):
    return {"type": "text", "text": text}


def _pm_block(block_id, node_type, text):
    return {
        "type": node_type,
        "attrs": {"id": block_id, "level": 1} if node_type == "heading" else {"id": block_id},
        "content": [_pm_text(text)],
    }


def _document(*blocks):
    return {"type": "doc", "content": list(blocks)}


@pytest.mark.unit
class TestParseFindReplace:
    def test_replace_x_for_y(self):
        assert parse_find_replace("replace renji for rengi") == ("renji", "rengi")

    def test_replace_x_with_y(self):
        assert parse_find_replace("replace foo with bar") == ("foo", "bar")

    def test_change_x_to_y(self):
        assert parse_find_replace("change cat to dog") == ("cat", "dog")

    def test_change_x_into_y(self):
        assert parse_find_replace("change cat into dog") == ("cat", "dog")

    def test_swap_x_for_y(self):
        assert parse_find_replace("swap red for blue") == ("red", "blue")

    def test_rename_x_to_y(self):
        assert parse_find_replace("rename oldname to newname") == ("oldname", "newname")

    def test_quoted_terms_are_unwrapped(self):
        assert parse_find_replace('replace "Renji" with "Rengi"') == ("Renji", "Rengi")

    def test_single_quoted_terms_are_unwrapped(self):
        assert parse_find_replace("replace 'foo' for 'bar'") == ("foo", "bar")

    def test_case_insensitive_keyword(self):
        assert parse_find_replace("Replace foo with bar") == ("foo", "bar")

    def test_multi_word_phrase_replace(self):
        assert parse_find_replace("replace project alpha with project beta") == (
            "project alpha",
            "project beta",
        )

    def test_non_literal_prompt_returns_none(self):
        assert parse_find_replace("make this paragraph more concise") is None

    def test_empty_prompt_returns_none(self):
        assert parse_find_replace("") is None
        assert parse_find_replace("   ") is None

    def test_multiline_prompt_returns_none(self):
        # A longer editorial request whose first line looks like a command
        # must NOT be treated as a literal replace.
        assert parse_find_replace("replace foo with bar\nand also tidy everything") is None

    def test_missing_replacement_returns_none(self):
        assert parse_find_replace("replace foo with") is None

    def test_quoted_terms_with_leading_filler_word(self):
        # `word` is filler between the keyword and the first quoted term; the
        # quoted-terms path must ignore it and extract just the quoted strings.
        assert parse_find_replace('replace word "rengi" for "antonio"') == ("rengi", "antonio")

    def test_quoted_terms_with_leading_all(self):
        assert parse_find_replace('replace all "rengi" with "antonio"') == ("rengi", "antonio")

    def test_unquoted_the_word_filler_is_stripped(self):
        assert parse_find_replace("replace the word rengi with antonio") == ("rengi", "antonio")

    def test_quoted_priority_keeps_filler_inside_quotes(self):
        # Quoted-terms priority must NOT strip a filler word that lives INSIDE
        # the quotes — "the cat"/"the dog" are the literal terms the user typed.
        assert parse_find_replace('replace "the cat" with "the dog"') == ("the cat", "the dog")

    def test_single_quoted_segment_falls_through_to_positional(self):
        # Only one quoted segment: not the two-quoted case, so the positional
        # patterns handle it and the conservative filler strip applies.
        assert parse_find_replace('replace the word "rengi" with antonio') == ("rengi", "antonio")


@pytest.mark.unit
class TestBuildFindReplaceProposals:
    def test_title_h1_block_is_included(self):
        # The H1 title is exactly what the LLM path drops, so it must be covered.
        document = _document(
            _pm_block("title-1", "heading", "Renji.mp4"),
            _pm_block("p-1", "paragraph", "Notes about Renji and the demo."),
        )
        blocks = _document_blocks_from_json(document)
        proposals = build_find_replace_proposals(blocks, "Renji", "Rengi")

        target_ids = {p["target_block_id"] for p in proposals}
        assert "title-1" in target_ids
        title_proposal = next(p for p in proposals if p["target_block_id"] == "title-1")
        assert title_proposal["operation"] == "replace"
        assert title_proposal["content_text"] == "Rengi.mp4"
        assert title_proposal["target_original_text"] == "Renji.mp4"

    def test_multiple_blocks_all_get_edits_no_cap(self):
        # Build more than a handful of matching blocks to prove there is no cap.
        block_count = 25
        nodes = [
            _pm_block(f"b-{i}", "paragraph", f"line {i} mentions Renji here")
            for i in range(block_count)
        ]
        document = _document(*nodes)
        blocks = _document_blocks_from_json(document)
        proposals = build_find_replace_proposals(blocks, "Renji", "Rengi")

        assert len(proposals) == block_count
        for proposal in proposals:
            assert "Rengi" in proposal["content_text"]
            assert "Renji" not in proposal["content_text"]

    def test_multiple_occurrences_within_a_single_block(self):
        document = _document(
            _pm_block("p-1", "paragraph", "Renji met Renji and then Renji left"),
        )
        blocks = _document_blocks_from_json(document)
        proposals = build_find_replace_proposals(blocks, "Renji", "Rengi")

        assert len(proposals) == 1
        assert proposals[0]["content_text"] == "Rengi met Rengi and then Rengi left"

    def test_case_insensitive_match(self):
        # Prompt term "renji" (lowercase) matches a block containing "Renji".
        search, replacement = parse_find_replace("replace renji for rengi")
        document = _document(
            _pm_block("title-1", "heading", "Renji.mp4"),
            _pm_block("p-1", "paragraph", "renji is lowercase here too"),
        )
        blocks = _document_blocks_from_json(document)
        proposals = build_find_replace_proposals(blocks, search, replacement)

        assert len(proposals) == 2
        by_id = {p["target_block_id"]: p for p in proposals}
        assert by_id["title-1"]["content_text"] == "rengi.mp4"
        assert by_id["p-1"]["content_text"] == "rengi is lowercase here too"

    def test_non_matching_blocks_are_skipped(self):
        document = _document(
            _pm_block("p-1", "paragraph", "nothing relevant here"),
            _pm_block("p-2", "paragraph", "Renji shows up only here"),
        )
        blocks = _document_blocks_from_json(document)
        proposals = build_find_replace_proposals(blocks, "Renji", "Rengi")

        assert len(proposals) == 1
        assert proposals[0]["target_block_id"] == "p-2"

    def test_proposal_shape_matches_review_protocol(self):
        document = _document(_pm_block("p-1", "paragraph", "Renji here"))
        blocks = _document_blocks_from_json(document)
        proposals = build_find_replace_proposals(blocks, "Renji", "Rengi")

        proposal = proposals[0]
        assert set(proposal.keys()) == {
            "id",
            "operation",
            "target_block_id",
            "target_original_text",
            "content_text",
            "content_html",
        }
        assert proposal["id"] == "proposal-1"
        assert proposal["content_html"]  # HTML is rendered for the review UI

    def test_no_match_returns_empty_list(self):
        document = _document(_pm_block("p-1", "paragraph", "no occurrence at all"))
        blocks = _document_blocks_from_json(document)
        assert build_find_replace_proposals(blocks, "Renji", "Rengi") == []

    def test_filler_prompt_end_to_end_rewrites_filename_token(self):
        # Regression for the filler-word bug: `replace the word rengi with antonio`
        # used to extract `the word rengi` (matching no block) and fall through to
        # the LLM, which missed tokens like `rengi.mp4`. With the conservative
        # filler strip the deterministic path turns `rengi.mp4` into `antonio.mp4`.
        search, replacement = parse_find_replace("replace the word rengi with antonio")
        assert (search, replacement) == ("rengi", "antonio")

        document = _document(_pm_block("title-1", "heading", "Brief de Marca: rengi.mp4"))
        blocks = _document_blocks_from_json(document)
        proposals = build_find_replace_proposals(blocks, search, replacement)

        assert len(proposals) == 1
        assert proposals[0]["target_block_id"] == "title-1"
        assert proposals[0]["content_text"] == "Brief de Marca: antonio.mp4"
        assert proposals[0]["target_original_text"] == "Brief de Marca: rengi.mp4"

    def test_quoted_terms_prompt_end_to_end(self):
        # `replace all "rengi" with "antonio"` should drive the same edit.
        search, replacement = parse_find_replace('replace all "rengi" with "antonio"')
        assert (search, replacement) == ("rengi", "antonio")

        document = _document(_pm_block("title-1", "heading", "Brief de Marca: rengi.mp4"))
        blocks = _document_blocks_from_json(document)
        proposals = build_find_replace_proposals(blocks, search, replacement)

        assert len(proposals) == 1
        assert proposals[0]["content_text"] == "Brief de Marca: antonio.mp4"


@pytest.mark.unit
class TestNonLiteralFallsBackToLLM:
    def test_non_literal_prompt_does_not_take_deterministic_path(self):
        # parse_find_replace returning None is the signal the endpoint uses to
        # fall back to the LLM — assert that signal for an editorial request.
        assert parse_find_replace("make this paragraph more concise") is None
