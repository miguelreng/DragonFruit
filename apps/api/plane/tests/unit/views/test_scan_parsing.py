# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Unit tests for the two pure helpers behind scan-to-doc.

`_parse_scan_json` has to survive whatever a vision model wraps its JSON in,
and `_strip_residual_markers` has to delete the routing markers the model left
in the body *without* eating the user's own hashes and slashes.
"""

import json

from plane.app.views.page.scan import _parse_scan_json, _strip_residual_markers


def reply(**overrides) -> str:
    payload = {
        "title": "Notes",
        "language": "en",
        "project": "",
        "labels": [],
        "markdown": "## Heading\n\n- One",
        "unreadable_pages": [],
    }
    payload.update(overrides)
    return json.dumps(payload)


class TestParseScanJson:
    def test_plain_json(self):
        assert _parse_scan_json(reply())["title"] == "Notes"

    def test_fenced_json(self):
        assert _parse_scan_json(f"```json\n{reply()}\n```")["title"] == "Notes"

    def test_bare_fence_without_language(self):
        assert _parse_scan_json(f"```\n{reply()}\n```")["title"] == "Notes"

    def test_json_wrapped_in_prose(self):
        text = f"Here are the notes you asked for:\n{reply()}\nLet me know if anything looks off."
        assert _parse_scan_json(text)["title"] == "Notes"

    def test_raw_markdown_reply_is_salvaged_as_the_transcription(self):
        parsed = _parse_scan_json("## Agenda\n\n- Ship it\n- Review it")
        assert parsed["markdown"].startswith("## Agenda")
        assert parsed["project"] == ""
        assert parsed["labels"] == []

    def test_long_unmarked_prose_is_salvaged(self):
        text = "First line of the note.\n" + ("more handwriting " * 20)
        assert _parse_scan_json(text)["markdown"] == text.strip()

    def test_single_line_apology_is_not_salvaged(self):
        assert _parse_scan_json("I'm sorry, I can't read that image.") is None

    def test_empty_reply(self):
        assert _parse_scan_json("") is None
        assert _parse_scan_json("   ") is None

    def test_json_list_is_not_a_scan_dict(self):
        assert _parse_scan_json('[{"title": "Notes"}]') is None


class TestStripResidualMarkers:
    def test_marker_at_line_start(self):
        assert _strip_residual_markers("/marketing\nShip it", "marketing", []) == "Ship it"

    def test_marker_mid_sentence(self):
        result = _strip_residual_markers("Ship it /marketing before Friday", "marketing", [])
        assert result == "Ship it before Friday"

    def test_label_markers(self):
        result = _strip_residual_markers("Fix the login #urgent #q3", "", ["urgent", "q3"])
        assert result == "Fix the login"

    def test_case_insensitive(self):
        assert _strip_residual_markers("Ship it /Marketing", "marketing", []) == "Ship it"

    def test_unreported_hash_survives(self):
        # "#3" was never reported as a label, so it's the writer's own text.
        text = "See item #3 in the backlog"
        assert _strip_residual_markers(text, "", ["urgent"]) == text

    def test_url_path_survives(self):
        text = "Read https://example.com/marketing/plan today"
        assert _strip_residual_markers(text, "marketing", []) == text

    def test_longer_word_starting_with_the_marker_survives(self):
        text = "Talk to #urgentcare about it"
        assert _strip_residual_markers(text, "", ["urgent"]) == text

    def test_accented_marker(self):
        result = _strip_residual_markers("Revisar el plan /diseño", "diseño", [])
        assert result == "Revisar el plan"

    def test_no_markers_is_a_passthrough(self):
        text = "## Agenda\n\n- One\n- Two"
        assert _strip_residual_markers(text, "", []) == text

    def test_blank_lines_left_behind_are_collapsed(self):
        result = _strip_residual_markers("First\n\n/marketing\n\nSecond", "marketing", [])
        assert result == "First\n\nSecond"
