# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Unit tests for the voice-note attachment marker.

Mobile's voice-note composer sends `input_mode="voice"` and
`voice_duration_seconds` alongside the transcript (as `content`) — no raw
audio ever rides along. `_normalise_voice_marker` turns that into the small
persisted attachment `{"kind": "voice", "duration_seconds": int}`, and
`_build_user_prompt` must skip it (the transcript is already in `text`, so
echoing the marker back would duplicate it in the LLM prompt).
"""

import pytest

from plane.app.views.agent.chat import (
    _MAX_VOICE_DURATION_SECONDS,
    _build_user_prompt,
    _normalise_voice_marker,
)


@pytest.mark.unit
class TestNormaliseVoiceMarker:
    def test_returns_none_when_input_mode_is_not_voice(self):
        assert _normalise_voice_marker(None, 12) is None
        assert _normalise_voice_marker("", 12) is None
        assert _normalise_voice_marker("text", 12) is None

    def test_builds_marker_for_voice_input_mode(self):
        assert _normalise_voice_marker("voice", 42) == {"kind": "voice", "duration_seconds": 42}

    def test_is_case_insensitive_and_trims_whitespace(self):
        assert _normalise_voice_marker(" Voice ", 5) == {"kind": "voice", "duration_seconds": 5}

    def test_rounds_fractional_duration(self):
        assert _normalise_voice_marker("voice", 12.6) == {"kind": "voice", "duration_seconds": 13}

    def test_negative_duration_floors_to_zero(self):
        assert _normalise_voice_marker("voice", -5) == {"kind": "voice", "duration_seconds": 0}

    def test_missing_or_invalid_duration_defaults_to_zero(self):
        assert _normalise_voice_marker("voice", None) == {"kind": "voice", "duration_seconds": 0}
        assert _normalise_voice_marker("voice", "not-a-number") == {"kind": "voice", "duration_seconds": 0}

    def test_caps_absurd_duration_at_the_max(self):
        huge = _MAX_VOICE_DURATION_SECONDS + 1_000
        assert _normalise_voice_marker("voice", huge) == {
            "kind": "voice",
            "duration_seconds": _MAX_VOICE_DURATION_SECONDS,
        }


@pytest.mark.unit
class TestBuildUserPromptSkipsVoiceMarker:
    def test_voice_only_attachment_uses_plain_transcript_fast_path(self):
        marker = {"kind": "voice", "duration_seconds": 30}
        result = _build_user_prompt("create a task to review the budget", [marker])
        assert result == "create a task to review the budget"

    def test_voice_marker_alongside_image_only_emits_image_blocks(self):
        marker = {"kind": "voice", "duration_seconds": 10}
        image = {"kind": "image", "name": "a.png", "data_url": "data:image/png;base64,abc"}
        result = _build_user_prompt("what's in this", [marker, image])
        assert isinstance(result, list)
        kinds = [block["type"] for block in result]
        assert "image_url" in kinds
        # No block should carry the raw marker dict or a "voice" mention —
        # the transcript already covers it via the text block.
        assert not any("voice" in str(block).lower() for block in result)
