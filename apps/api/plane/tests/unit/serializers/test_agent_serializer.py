# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from types import SimpleNamespace
from unittest.mock import patch

from plane.app.serializers.agent import AgentSerializer
from plane.llm.provider import LLMConfigError


def test_agent_serializer_reports_effective_llm_readiness():
    agent = SimpleNamespace()

    with patch("plane.llm.provider.LLMProvider.from_agent", return_value=object()):
        assert AgentSerializer().get_has_effective_llm_config(agent) is True


def test_agent_serializer_reports_missing_llm_configuration():
    agent = SimpleNamespace()

    with patch(
        "plane.llm.provider.LLMProvider.from_agent",
        side_effect=LLMConfigError("Atlas needs configuration"),
    ):
        assert AgentSerializer().get_has_effective_llm_config(agent) is False
