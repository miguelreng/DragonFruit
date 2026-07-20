# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for files sent from the Atlas composer."""

import base64

import pytest

from plane.app.views.agent.chat import (
    _MAX_ATTACHMENTS,
    _MAX_IMAGE_BYTES,
    _normalise_attachments,
)


def _payload(name: str, mime_type: str, content: bytes) -> dict:
    return {
        "name": name,
        "mime_type": mime_type,
        "content_base64": base64.b64encode(content).decode("ascii"),
    }


@pytest.mark.unit
class TestNormaliseAgentChatAttachments:
    def test_normalises_supported_mobile_file_types(self):
        result = _normalise_attachments(
            [
                _payload("photo.png", "image/png", b"png"),
                _payload("brief.pdf", "application/pdf", b"pdf"),
                _payload("items.csv", "text/csv", b"name,status\nOne,open"),
                _payload("notes.txt", "text/plain", b"Review this"),
            ]
        )

        assert [item["kind"] for item in result] == ["image", "pdf", "text", "text"]
        assert result[0]["data_url"].startswith("data:image/png;base64,")
        assert result[1]["data_url"].startswith("data:application/pdf;base64,")
        assert result[2]["text_excerpt"] == "name,status\nOne,open"
        assert result[3]["text_excerpt"] == "Review this"

    def test_limits_a_turn_to_six_files(self):
        raw = [_payload(f"file-{index}.txt", "text/plain", b"hello") for index in range(_MAX_ATTACHMENTS + 2)]
        result = _normalise_attachments(raw)
        assert len(result) == _MAX_ATTACHMENTS

    def test_marks_oversized_images_as_dropped_without_persisting_bytes(self):
        result = _normalise_attachments([_payload("large.png", "image/png", b"x" * (_MAX_IMAGE_BYTES + 1))])
        assert result == [
            {
                "name": "large.png",
                "mime_type": "image/png",
                "size": _MAX_IMAGE_BYTES + 1,
                "kind": "image",
                "data_url": "",
                "dropped": True,
            }
        ]

    def test_drops_malformed_base64_payloads(self):
        result = _normalise_attachments(
            [{"name": "broken.pdf", "mime_type": "application/pdf", "content_base64": "not base64"}]
        )
        assert result == []
