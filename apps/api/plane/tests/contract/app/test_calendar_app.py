# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from datetime import datetime, timedelta, timezone

import pytest
import requests
from django.urls import reverse
from rest_framework import status

from plane.db.models import UserCalendarAccount
from plane.license.utils.encryption import decrypt_data, encrypt_data


class MockResponse:
    def __init__(self, payload, status_code=status.HTTP_200_OK):
        self.payload = payload
        self.status_code = status_code
        self.text = str(payload)

    def json(self):
        return self.payload


def test_summarize_meeting_notes_preserves_json_schema_braces(monkeypatch):
    from plane.app.views.calendar import base as calendar_base

    captured = {}

    def mock_call_llm_chat(**kwargs):
        captured.update(kwargs)
        return (
            """
            {
              "summary": "Done",
              "summary_sections": [{"heading": "Plan", "body": "They discussed the launch."}],
              "decisions": [],
              "next_steps": [],
              "details": []
            }
            """,
            None,
        )

    monkeypatch.setattr(calendar_base, "get_llm_config", lambda workspace: ("api-key", "gpt-4.1-mini", "openai"))
    monkeypatch.setattr(calendar_base, "call_llm_chat", mock_call_llm_chat)

    result = calendar_base._summarize_meeting_notes(
        workspace=object(),
        meeting_title="KickOff: DragonFruit",
        transcript="Miguel: Start notes.",
    )

    assert result["summary"] == "Done"
    assert '"summary": "one or two sentence overview of the meeting"' in captured["user"]
    assert '{"heading": "Short thematic heading", "body": "One short paragraph of prose."}' in captured["user"]
    assert "Meeting title: KickOff: DragonFruit" in captured["user"]
    assert "Miguel: Start notes." in captured["user"]


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

    @pytest.mark.django_db
    def test_events_refresh_tries_alternate_client_credentials(self, session_client, create_user, monkeypatch):
        account = UserCalendarAccount.objects.create(
            user=create_user,
            provider=UserCalendarAccount.PROVIDER_GOOGLE,
            account_email="test@plane.so",
            primary_calendar_id="primary",
            access_token_encrypted=encrypt_data("expired-access-token"),
            refresh_token_encrypted=encrypt_data("existing-refresh-token"),
            token_expires_at=datetime.now(timezone.utc) - timedelta(hours=1),
            is_active=True,
        )

        refresh_attempts = []
        event_auth_headers = []

        def mock_client_credential_candidates(client):
            if client == "web":
                return [("web-id", "web-secret")]
            if client == "native":
                return [("native-id", "native-secret")]
            return []

        def mock_post(url, data, timeout):
            refresh_attempts.append(data)
            if data["client_id"] == "web-id":
                return MockResponse({"error": "invalid_grant"}, status.HTTP_400_BAD_REQUEST)
            return MockResponse(
                {
                    "access_token": "new-access-token",
                    "refresh_token": "rotated-refresh-token",
                    "expires_in": 3600,
                }
            )

        def mock_request(method, url, params=None, json=None, headers=None, timeout=10):
            event_auth_headers.append(headers.get("Authorization", ""))
            return MockResponse({"items": []})

        monkeypatch.setattr(
            "plane.app.views.calendar.base._client_credential_candidates",
            mock_client_credential_candidates,
        )
        monkeypatch.setattr("plane.app.views.calendar.base.requests.post", mock_post)
        monkeypatch.setattr("plane.app.views.calendar.base.requests.request", mock_request)

        response = session_client.get(
            reverse("calendar-accounts-events", kwargs={"account_id": account.id}),
            {"from": "2026-05-01T00:00:00Z", "to": "2026-05-31T00:00:00Z"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data == {"events": []}
        assert [attempt["client_id"] for attempt in refresh_attempts] == ["web-id", "native-id"]
        assert event_auth_headers == ["Bearer new-access-token"]

        account.refresh_from_db()
        assert decrypt_data(account.access_token_encrypted) == "new-access-token"
        assert decrypt_data(account.refresh_token_encrypted) == "rotated-refresh-token"

    @pytest.mark.django_db
    def test_events_force_refreshes_and_retries_after_google_401(self, session_client, create_user, monkeypatch):
        account = UserCalendarAccount.objects.create(
            user=create_user,
            provider=UserCalendarAccount.PROVIDER_GOOGLE,
            account_email="test@plane.so",
            primary_calendar_id="primary",
            access_token_encrypted=encrypt_data("stale-access-token"),
            refresh_token_encrypted=encrypt_data("existing-refresh-token"),
            token_expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            is_active=True,
        )

        refresh_attempts = []
        event_auth_headers = []

        def mock_client_credential_candidates(client):
            if client == "web":
                return [("web-id", "web-secret")]
            return []

        def mock_post(url, data, timeout):
            refresh_attempts.append(data)
            return MockResponse(
                {
                    "access_token": "fresh-access-token",
                    "refresh_token": "rotated-refresh-token",
                    "expires_in": 3600,
                }
            )

        def mock_request(method, url, params=None, json=None, headers=None, timeout=10):
            authorization = headers.get("Authorization", "")
            event_auth_headers.append(authorization)
            if authorization == "Bearer stale-access-token":
                return MockResponse({"error": "invalid_token"}, status.HTTP_401_UNAUTHORIZED)
            return MockResponse({"items": []})

        monkeypatch.setattr(
            "plane.app.views.calendar.base._client_credential_candidates",
            mock_client_credential_candidates,
        )
        monkeypatch.setattr("plane.app.views.calendar.base.requests.post", mock_post)
        monkeypatch.setattr("plane.app.views.calendar.base.requests.request", mock_request)

        response = session_client.get(
            reverse("calendar-accounts-events", kwargs={"account_id": account.id}),
            {"from": "2026-05-01T00:00:00Z", "to": "2026-05-31T00:00:00Z"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data == {"events": []}
        assert event_auth_headers == ["Bearer stale-access-token", "Bearer fresh-access-token"]
        assert [attempt["client_id"] for attempt in refresh_attempts] == ["web-id"]

        account.refresh_from_db()
        assert decrypt_data(account.access_token_encrypted) == "fresh-access-token"
        assert decrypt_data(account.refresh_token_encrypted) == "rotated-refresh-token"

    @pytest.mark.django_db
    def test_upcoming_meetings_returns_error_event_for_google_network_failure(
        self, session_client, create_user, monkeypatch
    ):
        account = UserCalendarAccount.objects.create(
            user=create_user,
            provider=UserCalendarAccount.PROVIDER_GOOGLE,
            account_email="test@plane.so",
            primary_calendar_id="primary",
            access_token_encrypted=encrypt_data("access-token"),
            refresh_token_encrypted=encrypt_data("refresh-token"),
            token_expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            is_active=True,
        )

        def mock_request(method, url, params=None, json=None, headers=None, timeout=10):
            raise requests.Timeout("calendar timeout")

        monkeypatch.setattr("plane.app.views.calendar.base.requests.request", mock_request)

        response = session_client.get(
            reverse("calendar-upcoming-meetings"),
            {"from": "2026-05-01T00:00:00Z", "to": "2026-05-08T00:00:00Z"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["events"][0]["status"] == "error"
        assert response.data["events"][0]["account_id"] == str(account.id)
        assert "calendar timeout" in response.data["events"][0]["description"]
