# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json
from unittest.mock import Mock, patch

import pytest
from django.test import RequestFactory, override_settings

from plane.middleware.logger import APITokenLogMiddleware


@pytest.mark.unit
class TestAPITokenLogMiddleware:
    @override_settings(SECRET_KEY="activity-log-test-key")
    @patch("plane.middleware.logger.process_logs.delay")
    def test_redacts_credentials_and_does_not_store_bodies(self, mock_delay):
        api_key = "plane_api_live-secret"
        request = RequestFactory().post(
            "/api/workspaces/",
            data='{"password":"secret"}',
            content_type="application/json",
            HTTP_X_API_KEY=api_key,
            HTTP_AUTHORIZATION="Bearer another-secret",
            HTTP_COOKIE="session=secret",
        )
        request.user = Mock(is_authenticated=False)
        response = Mock(status_code=201, content=b'{"access_token":"secret"}')

        middleware = APITokenLogMiddleware(lambda _request: response)
        middleware.process_request(request, response, request.body)

        log_data = mock_delay.call_args.kwargs["log_data"]
        headers = json.loads(log_data["headers"])

        assert log_data["token_identifier"].startswith("hmac-sha256:")
        assert api_key not in str(log_data)
        assert log_data["body"] is None
        assert log_data["response_body"] is None
        assert headers["X-Api-Key"] == "[REDACTED]"
        assert headers["Authorization"] == "[REDACTED]"
        assert headers["Cookie"] == "[REDACTED]"

    @override_settings(SECRET_KEY="activity-log-test-key")
    def test_fingerprint_is_stable_without_revealing_token(self):
        middleware = APITokenLogMiddleware(lambda _request: None)

        first = middleware._token_fingerprint("plane_api_secret")
        second = middleware._token_fingerprint("plane_api_secret")

        assert first == second
        assert "plane_api_secret" not in first
