# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from unittest.mock import patch

import pytest
from django.test import override_settings

from plane.app.views.agent_webhook.base import _validate_agent_webhook_url


@pytest.mark.unit
class TestAgentWebhookURLValidation:
    @patch("plane.app.views.agent_webhook.base.validate_url")
    def test_rejects_the_application_host(self, _mock_validate):
        with pytest.raises(ValueError):
            _validate_agent_webhook_url(
                "https://api.dragonfruit.sh/internal",
                request_host="api.dragonfruit.sh",
            )

    @override_settings(WEBHOOK_DISALLOWED_DOMAINS=["dragonfruit.sh"])
    @patch("plane.app.views.agent_webhook.base.validate_url")
    def test_rejects_disallowed_subdomains(self, _mock_validate):
        with pytest.raises(ValueError):
            _validate_agent_webhook_url("https://private.dragonfruit.sh/hook")

    @patch(
        "plane.app.views.agent_webhook.base.validate_url",
        side_effect=ValueError("private destination"),
    )
    def test_rejects_private_network_destinations(self, _mock_validate):
        with pytest.raises(ValueError):
            _validate_agent_webhook_url("http://127.0.0.1/hook")
