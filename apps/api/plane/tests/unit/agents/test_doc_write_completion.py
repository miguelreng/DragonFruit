# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest

from plane.app.views.agent.doc_write import build_doc_write_completion_message


@pytest.mark.unit
class TestDocWriteCompletionMessage:
    def test_spanish_translation_is_reviewable_and_not_the_old_template(self):
        message = build_doc_write_completion_message(
            prompt="Tradúcelo todo al inglés",
            proposal_count=4,
            title_count=1,
            body_count=3,
            variant_seed="one",
        )

        assert "I drafted" not in message
        assert "tradu" in message.lower()
        assert any(word in message.lower() for word in ("revis", "aplic", "propuesta"))

    def test_zero_matches_says_nothing_changed(self):
        message = build_doc_write_completion_message(
            prompt="replace Renji with Rengi",
            proposal_count=0,
            variant_seed="none",
        )

        assert "nothing" in message.lower() or "untouched" in message.lower() or "no changes" in message.lower()

    def test_title_only_copy_does_not_imply_the_edit_was_applied(self):
        message = build_doc_write_completion_message(
            prompt="Update the title",
            proposal_count=1,
            title_count=1,
            variant_seed="title",
        )

        assert "title" in message.lower()
        assert any(word in message.lower() for word in ("review", "proposal", "applying"))

    def test_repeated_scenarios_have_deterministic_variety(self):
        messages = {
            build_doc_write_completion_message(
                prompt="Make the introduction more concise",
                proposal_count=1,
                body_count=1,
                variant_seed=str(index),
            )
            for index in range(12)
        }

        assert len(messages) >= 2
        assert all("I drafted 1 reviewable document edit in the page." not in message for message in messages)
