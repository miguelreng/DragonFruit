# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from django.urls import reverse
from rest_framework import status

from plane.db.models import UserCalendarAccount


class MockResponse:
    def __init__(self, payload, status_code=status.HTTP_200_OK):
        self.payload = payload
        self.status_code = status_code
        self.text = str(payload)

    def json(self):
        return self.payload


@pytest.mark.contract
class TestCalendarAppEndpoint:
    @pytest.mark.django_db
    def test_google_callback_reconnects_soft_deleted_account(self, session_client, create_user, monkeypatch):
        existing_account = UserCalendarAccount.objects.create(
            user=create_user,
            provider=UserCalendarAccount.PROVIDER_GOOGLE,
            account_email="test@plane.so",
            primary_calendar_id="old-calendar",
            access_token_encrypted="old-token",
            refresh_token_encrypted="old-refresh",
            is_active=False,
        )
        existing_account.delete()

        def mock_post(url, data, timeout):
            return MockResponse(
                {
                    "access_token": "new-access-token",
                    "refresh_token": "new-refresh-token",
                    "expires_in": 3600,
                    "scope": "openid email https://www.googleapis.com/auth/calendar.events",
                }
            )

        def mock_get(url, headers, timeout):
            return MockResponse({"id": "test@plane.so"})

        monkeypatch.setattr(
            "plane.app.views.calendar.base._client_credential_candidates",
            lambda client: [("id", "secret")],
        )
        monkeypatch.setattr("plane.app.views.calendar.base.requests.post", mock_post)
        monkeypatch.setattr("plane.app.views.calendar.base.requests.get", mock_get)

        response = session_client.post(
            reverse("calendar-accounts-google-callback"),
            {"code": "auth-code", "state": f"{create_user.id}:web"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == str(existing_account.id)
        assert response.data["account_email"] == "test@plane.so"
        assert response.data["is_active"] is True

        existing_account.refresh_from_db()
        assert existing_account.deleted_at is None
        assert existing_account.primary_calendar_id == "test@plane.so"

    @pytest.mark.django_db
    def test_google_callback_retries_alternate_client_exchange(self, session_client, create_user, monkeypatch):
        token_attempts = []

        def mock_post(url, data, timeout):
            token_attempts.append(data)
            if data["redirect_uri"] == "dragonfruitmini://calendar/oauth/callback":
                return MockResponse(
                    {
                        "access_token": "native-access-token",
                        "refresh_token": "native-refresh-token",
                        "expires_in": 3600,
                        "scope": "openid email https://www.googleapis.com/auth/calendar.events",
                    }
                )
            return MockResponse({"error": "invalid_grant"}, status.HTTP_400_BAD_REQUEST)

        def mock_get(url, headers, timeout):
            return MockResponse({"id": "test@plane.so"})

        monkeypatch.setattr(
            "plane.app.views.calendar.base._client_credential_candidates",
            lambda client: [(f"{client}-id", f"{client}-secret")],
        )
        monkeypatch.setattr(
            "plane.app.views.calendar.base._redirect_uri_for_client",
            lambda client: "dragonfruitmini://calendar/oauth/callback"
            if client == "native"
            else "https://app.dragonfruit.sh/calendar/oauth/callback",
        )
        monkeypatch.setattr("plane.app.views.calendar.base.requests.post", mock_post)
        monkeypatch.setattr("plane.app.views.calendar.base.requests.get", mock_get)

        response = session_client.post(
            reverse("calendar-accounts-google-callback"),
            {"code": "auth-code", "state": f"{create_user.id}:web"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["account_email"] == "test@plane.so"
        assert [attempt["redirect_uri"] for attempt in token_attempts] == [
            "https://app.dragonfruit.sh/calendar/oauth/callback",
            "dragonfruitmini://calendar/oauth/callback",
        ]
