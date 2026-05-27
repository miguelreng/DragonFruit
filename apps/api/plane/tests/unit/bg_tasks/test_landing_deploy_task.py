# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from unittest.mock import patch

import pytest

from plane.bgtasks.landing_deploy_task import trigger_landing_redeploy


@pytest.mark.unit
def test_trigger_landing_redeploy_posts_with_auth_header(settings):
    settings.LANDING_DEPLOY_WEBHOOK_URL = "https://example.com/deploy-hook"
    settings.LANDING_DEPLOY_WEBHOOK_AUTH_HEADER = "Bearer test-token"
    settings.LANDING_DEPLOY_WEBHOOK_TIMEOUT_SECONDS = 7

    payload = {"event": "public_page_changed", "page_id": "123"}

    with patch("plane.bgtasks.landing_deploy_task.requests.post") as mock_post:
        mock_post.return_value.status_code = 200
        mock_post.return_value.text = ""
        trigger_landing_redeploy(payload=payload)

    mock_post.assert_called_once()
    _, kwargs = mock_post.call_args
    assert kwargs["json"] == payload
    assert kwargs["timeout"] == 7
    assert kwargs["headers"]["Authorization"] == "Bearer test-token"


@pytest.mark.unit
def test_trigger_landing_redeploy_noops_without_webhook_url(settings):
    settings.LANDING_DEPLOY_WEBHOOK_URL = ""

    with patch("plane.bgtasks.landing_deploy_task.requests.post") as mock_post:
        trigger_landing_redeploy(payload={"event": "public_page_changed"})

    mock_post.assert_not_called()
