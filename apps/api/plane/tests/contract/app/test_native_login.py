# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from urllib.parse import parse_qs, urlparse

import pytest
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APIRequestFactory, force_authenticate

from plane.authentication.views.common import NativeLoginStartEndpoint


NATIVE_CALLBACK = "https://mhheokgkmmgpgmjfhlggnckdafdgilcp.chromiumapp.org/auth/login-callback"
MOBILE_CALLBACK = "dragonfruit://auth/callback"
LOCMEM_CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}


class AuthenticatedNativeUser:
    is_authenticated = True


@pytest.mark.contract
class TestNativeLoginStartEndpoint:
    @pytest.fixture
    def request_factory(self):
        return APIRequestFactory()

    def get_response(self, request_factory, query_params=None, accept="*/*", user=None):
        request = request_factory.get("/auth/native/start/", query_params or {}, HTTP_ACCEPT=accept)
        if user is not None:
            force_authenticate(request, user=user)
        return NativeLoginStartEndpoint.as_view()(request)

    @override_settings(APP_BASE_URL="https://app.dragonfruit.sh", CACHES=LOCMEM_CACHES)
    def test_json_request_without_session_returns_login_url(self, request_factory):
        response = self.get_response(
            request_factory,
            {"format": "json", "callback": NATIVE_CALLBACK},
            accept="application/json",
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert "Location" not in response.headers
        assert response.data["login_url"].startswith("https://app.dragonfruit.sh/login?")

        login_url = urlparse(response.data["login_url"])
        next_path = parse_qs(login_url.query)["next_path"][0]
        assert next_path.startswith("/auth/native/start/?callback=")
        assert parse_qs(urlparse(next_path).query)["callback"][0] == NATIVE_CALLBACK

    @override_settings(APP_BASE_URL="https://app.dragonfruit.sh", CACHES=LOCMEM_CACHES)
    def test_browser_request_without_session_still_redirects(self, request_factory):
        response = self.get_response(request_factory, {"callback": NATIVE_CALLBACK})

        assert response.status_code == status.HTTP_302_FOUND
        assert response.headers["Location"].startswith("https://app.dragonfruit.sh/login?")

    @override_settings(CACHES=LOCMEM_CACHES)
    def test_json_request_with_session_returns_native_token(self, request_factory, monkeypatch):
        monkeypatch.setattr("plane.authentication.views.common.create_native_api_token", lambda user: "native-token")

        response = self.get_response(
            request_factory,
            {"format": "json", "callback": NATIVE_CALLBACK},
            accept="application/json",
            user=AuthenticatedNativeUser(),
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["api_token"] == "native-token"
        assert response.data["callback"] == f"{NATIVE_CALLBACK}?api_token=native-token"

    @override_settings(CACHES=LOCMEM_CACHES)
    def test_browser_request_with_session_redirects_to_mobile_callback(
        self, request_factory, monkeypatch
    ):
        monkeypatch.setattr("plane.authentication.views.common.create_native_api_token", lambda user: "native-token")

        response = self.get_response(
            request_factory,
            {"callback": MOBILE_CALLBACK},
            user=AuthenticatedNativeUser(),
        )

        assert response.status_code == status.HTTP_302_FOUND
        assert response.headers["Location"] == f"{MOBILE_CALLBACK}?api_token=native-token"
