# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from unittest.mock import patch

import pytest

from plane.bgtasks.agent_webhook_task import dispatch_agent_webhook


@pytest.mark.unit
class TestAgentWebhookTask:
    @patch("plane.bgtasks.agent_webhook_task.requests.post")
    @patch(
        "plane.bgtasks.agent_webhook_task.validate_url",
        side_effect=ValueError("private destination"),
    )
    def test_does_not_send_when_destination_is_blocked(self, _mock_validate, mock_post):
        dispatch_agent_webhook.run(
            url="http://127.0.0.1/admin",
            body=b"{}",
            headers={"Content-Type": "application/json"},
            dispatch_id="dispatch-1",
        )

        mock_post.assert_not_called()

    @patch("plane.bgtasks.agent_webhook_task.requests.post")
    @patch("plane.bgtasks.agent_webhook_task.validate_url")
    def test_revalidates_destination_immediately_before_send(self, mock_validate, mock_post):
        mock_post.return_value.status_code = 204

        dispatch_agent_webhook.run(
            url="https://example.com/agent",
            body=b"{}",
            headers={"Content-Type": "application/json"},
            dispatch_id="dispatch-2",
        )

        mock_validate.assert_called_once()
        mock_post.assert_called_once()
