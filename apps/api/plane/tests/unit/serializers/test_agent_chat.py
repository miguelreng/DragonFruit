# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from types import SimpleNamespace

import pytest

from plane.app.serializers.agent import AgentChatSessionSerializer, generate_agent_chat_title


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        ("  Plan   the launch  ", "Plan the launch"),
        (
            "Review the onboarding flow and suggest improvements for new workspace members",
            "Review the onboarding flow and suggest…",
        ),
        ("", "New chat"),
    ],
)
def test_generate_agent_chat_title(message, expected):
    assert generate_agent_chat_title(message) == expected


@pytest.mark.parametrize("generic_title", ["New chat", "Atlas Chat", "Atlas Voice", ""])
def test_display_title_uses_first_user_message_for_generic_titles(generic_title):
    session = SimpleNamespace(title=generic_title, first_user_message="Help me prepare the project kickoff")

    assert AgentChatSessionSerializer().get_display_title(session) == "Help me prepare the project kickoff"


def test_display_title_preserves_a_custom_title():
    session = SimpleNamespace(title="Launch plan", first_user_message="Ignore this message")

    assert AgentChatSessionSerializer().get_display_title(session) == "Launch plan"
