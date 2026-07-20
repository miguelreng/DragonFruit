# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from datetime import datetime, timedelta, timezone

import pytest
import requests
from django.urls import reverse
from rest_framework import status

from plane.db.models import Page, Project, ProjectMember, ProjectPage, UserCalendarAccount
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
    def test_meeting_notes_draft_creates_project_doc(self, session_client, workspace, create_user, monkeypatch):
        project = Project.objects.create(name="Meetings", identifier="MTG", workspace=workspace, created_by=create_user)
        ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
        monkeypatch.setattr("plane.app.views.calendar.base._summarize_meeting_notes", lambda **kwargs: None)
        monkeypatch.setattr("plane.app.views.calendar.base._attach_doc_to_calendar_event", lambda **kwargs: False)
        monkeypatch.setattr("plane.app.views.calendar.base.page_transaction.delay", lambda **kwargs: None)

        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/calendar/meeting-notes/",
            {
                "meeting_id": "event-1",
                "meeting_title": "Weekly Review",
                "start": "2026-06-06T22:00:00Z",
                "end": "2026-06-06T22:30:00Z",
                "meeting_url": "https://meet.example.test/weekly",
                "account_id": "calendar-account",
                "calendar_id": "primary",
                "account_email": "miguel@example.test",
                "notes": "Miguel: We shipped the Mac app fixes.",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["created"] is True
        assert response.data["calendar_attached"] is False

        page = Page.objects.get(id=response.data["id"])
        assert page.name == "Meeting notes: Weekly Review"
        assert "Miguel: We shipped the Mac app fixes." in page.description_html
        assert ProjectPage.objects.filter(project=project, page=page, workspace=workspace).exists()

    @pytest.mark.django_db
    def test_meeting_notes_draft_saves_transcript_when_summary_fails(
        self, session_client, workspace, create_user, monkeypatch
    ):
        project = Project.objects.create(name="Meetings", identifier="MTG", workspace=workspace, created_by=create_user)
        ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)

        def raise_summary_error(**kwargs):
            raise ValueError("invalid llm config")

        monkeypatch.setattr("plane.app.views.calendar.base._summarize_meeting_notes", raise_summary_error)
        monkeypatch.setattr("plane.app.views.calendar.base._attach_doc_to_calendar_event", lambda **kwargs: False)
        monkeypatch.setattr("plane.app.views.calendar.base.page_transaction.delay", lambda **kwargs: None)

        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/calendar/meeting-notes/",
            {
                "meeting_id": "event-1",
                "meeting_title": "Weekly Review",
                "notes": "The raw transcript still needs to be saved.",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        page = Page.objects.get(id=response.data["id"])
        assert "The raw transcript still needs to be saved." in page.description_html

    @pytest.mark.django_db
    def test_meeting_notes_draft_updates_existing_project_doc(
        self, session_client, workspace, create_user, monkeypatch
    ):
        project = Project.objects.create(name="Meetings", identifier="MTG", workspace=workspace, created_by=create_user)
        ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
        monkeypatch.setattr("plane.app.views.calendar.base._summarize_meeting_notes", lambda **kwargs: None)
        monkeypatch.setattr("plane.app.views.calendar.base._attach_doc_to_calendar_event", lambda **kwargs: False)
        monkeypatch.setattr("plane.app.views.calendar.base.page_transaction.delay", lambda **kwargs: None)

        payload = {
            "meeting_id": "event-1",
            "meeting_title": "Weekly Review",
            "account_id": "calendar-account",
            "calendar_id": "primary",
            "notes": "First transcript.",
        }
        url = f"/api/workspaces/{workspace.slug}/calendar/meeting-notes/"

        first_response = session_client.post(url, payload, format="json")
        second_response = session_client.post(url, {**payload, "notes": "Updated transcript."}, format="json")

        assert first_response.status_code == status.HTTP_201_CREATED
        assert second_response.status_code == status.HTTP_200_OK
        assert second_response.data["id"] == first_response.data["id"]
        assert second_response.data["created"] is False

        page = Page.objects.get(id=second_response.data["id"])
        assert "Updated transcript." in page.description_html
        assert "First transcript." not in page.description_html
        assert page.updated_by_id == create_user.id

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
    def test_move_timed_google_event_updates_only_its_schedule(self, session_client, create_user, monkeypatch):
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
        captured = {}

        def mock_google_request(**kwargs):
            captured.update(kwargs)
            return MockResponse(
                {
                    "id": "event/with spaces",
                    "summary": "Design review",
                    "start": {"dateTime": "2026-07-22T15:00:00Z"},
                    "end": {"dateTime": "2026-07-22T16:00:00Z"},
                }
            )

        monkeypatch.setattr("plane.app.views.calendar.base._google_api_request", mock_google_request)

        response = session_client.patch(
            reverse("calendar-accounts-events", kwargs={"account_id": account.id}),
            {
                "event_id": "event/with spaces",
                "calendar_id": "team@example.test",
                "all_day": False,
                "start": "2026-07-22T15:00:00Z",
                "end": "2026-07-22T16:00:00Z",
                "time_zone": "America/Bogota",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert captured["method"] == "PATCH"
        assert captured["url"].endswith("/calendars/team%40example.test/events/event%2Fwith%20spaces")
        assert captured["json"] == {
            "start": {"dateTime": "2026-07-22T15:00:00Z", "timeZone": "America/Bogota"},
            "end": {"dateTime": "2026-07-22T16:00:00Z", "timeZone": "America/Bogota"},
        }
        assert response.data["event"]["calendar_id"] == "team@example.test"

    @pytest.mark.django_db
    def test_move_all_day_google_event_converts_inclusive_end_to_google_exclusive(
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
        captured = {}

        def mock_google_request(**kwargs):
            captured.update(kwargs)
            return MockResponse(
                {
                    "id": "all-day-event",
                    "summary": "Conference",
                    "start": {"date": "2026-07-22"},
                    "end": {"date": "2026-07-25"},
                }
            )

        monkeypatch.setattr("plane.app.views.calendar.base._google_api_request", mock_google_request)

        response = session_client.patch(
            reverse("calendar-accounts-events", kwargs={"account_id": account.id}),
            {
                "event_id": "all-day-event",
                "all_day": True,
                "start": "2026-07-22",
                "end": "2026-07-24",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert captured["json"] == {
            "start": {"date": "2026-07-22"},
            "end": {"date": "2026-07-25"},
        }

    @pytest.mark.django_db
    def test_edit_google_event_updates_schedule_and_details(self, session_client, create_user, monkeypatch):
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
        captured = {}

        def mock_google_request(**kwargs):
            captured.update(kwargs)
            return MockResponse(
                {
                    "id": "event-1",
                    "summary": "Updated planning",
                    "description": "Bring the latest brief",
                    "location": "Studio 2",
                    "hangoutLink": "https://meet.google.com/abc-defg-hij",
                    "start": {"dateTime": "2026-07-22T10:00:00-05:00"},
                    "end": {"dateTime": "2026-07-22T11:00:00-05:00"},
                }
            )

        monkeypatch.setattr("plane.app.views.calendar.base._google_api_request", mock_google_request)

        response = session_client.patch(
            reverse("calendar-accounts-events", kwargs={"account_id": account.id}),
            {
                "event_id": "event-1",
                "all_day": False,
                "start": "2026-07-22T10:00:00",
                "end": "2026-07-22T11:00:00",
                "time_zone": "America/Bogota",
                "title": "Updated planning",
                "description": "Bring the latest brief",
                "location": "Studio 2",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert captured["json"] == {
            "start": {"dateTime": "2026-07-22T10:00:00", "timeZone": "America/Bogota"},
            "end": {"dateTime": "2026-07-22T11:00:00", "timeZone": "America/Bogota"},
            "summary": "Updated planning",
            "description": "Bring the latest brief",
            "location": "Studio 2",
        }
        assert response.data["event"]["hangout_link"] == "https://meet.google.com/abc-defg-hij"

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

    # ------------------------------------------------------------------ #
    # Atlas baseline: doc-replace reconcile                               #
    # ------------------------------------------------------------------ #

    @pytest.mark.django_db
    def test_atlas_baseline_doc_replace_does_not_duplicate_content(
        self, session_client, workspace, create_user, monkeypatch
    ):
        """POSTing meeting notes twice for the same meeting key must NOT
        duplicate content. With LIVE_URL unset _replace_meeting_notes_document_formats
        returns {} so description_binary is cleared and description_html is replaced
        in full — not concatenated. The second POST returns 200 (not 201) and reuses
        the same page id.
        """
        project = Project.objects.create(
            name="Meetings",
            identifier="MBL",
            workspace=workspace,
            created_by=create_user,
        )
        ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)

        monkeypatch.setattr("plane.app.views.calendar.base._summarize_meeting_notes", lambda **kwargs: None)
        monkeypatch.setattr("plane.app.views.calendar.base._attach_doc_to_calendar_event", lambda **kwargs: False)
        monkeypatch.setattr("plane.app.views.calendar.base.page_transaction.delay", lambda **kwargs: None)
        # Ensure settings.WEB_URL is a string so the view can call .rstrip("/")
        from django.conf import settings as django_settings
        monkeypatch.setattr(django_settings, "WEB_URL", "http://localhost:3000", raising=False)

        payload = {
            "meeting_id": "atlas-baseline-event-1",
            "meeting_title": "Atlas Baseline Meeting",
            "account_id": "acct-baseline",
            "calendar_id": "primary",
            "notes": "First recording of the meeting.",
        }
        url = f"/api/workspaces/{workspace.slug}/calendar/meeting-notes/"

        first_response = session_client.post(url, payload, format="json")
        assert first_response.status_code == status.HTTP_201_CREATED, (
            f"first POST should be 201; got {first_response.status_code}: {first_response.data}"
        )
        page_id_first = first_response.data["id"]

        second_response = session_client.post(
            url, {**payload, "notes": "Second recording — completely different content."}, format="json"
        )
        assert second_response.status_code == status.HTTP_200_OK, (
            f"second POST should be 200 (update); got {second_response.status_code}: {second_response.data}"
        )
        assert second_response.data["id"] == page_id_first, "second POST must reuse the same page id"
        assert second_response.data["created"] is False

        page = Page.objects.get(id=page_id_first)
        # HTML must contain the SECOND transcript, not the first.
        assert "Second recording" in page.description_html
        # The FIRST transcript must NOT appear (no concatenation / duplication).
        assert "First recording" not in page.description_html
        # With LIVE_URL unset the binary is always cleared so editors re-seed.
        assert page.description_binary is None

    # ------------------------------------------------------------------ #
    # Meeting notes: explicit project choice                              #
    # ------------------------------------------------------------------ #

    @pytest.mark.django_db
    def test_meeting_notes_honors_requested_project_and_falls_back_when_invalid(
        self, session_client, workspace, create_user, monkeypatch
    ):
        """The mac app sends project_id when the user picks a destination on
        stop. The doc must be linked to that project (not the oldest-membership
        default) and the returned URL must point at it. A project_id the user
        can't use (bogus uuid, non-member project) falls back to the default
        instead of failing the save.
        """
        default_project = Project.objects.create(
            name="Oldest Default",
            identifier="OLD",
            workspace=workspace,
            created_by=create_user,
        )
        ProjectMember.objects.create(project=default_project, member=create_user, role=20, is_active=True)
        chosen_project = Project.objects.create(
            name="Chosen Destination",
            identifier="CHO",
            workspace=workspace,
            created_by=create_user,
        )
        ProjectMember.objects.create(project=chosen_project, member=create_user, role=20, is_active=True)

        monkeypatch.setattr("plane.app.views.calendar.base._summarize_meeting_notes", lambda **kwargs: None)
        monkeypatch.setattr("plane.app.views.calendar.base._attach_doc_to_calendar_event", lambda **kwargs: False)
        monkeypatch.setattr("plane.app.views.calendar.base.page_transaction.delay", lambda **kwargs: None)
        from django.conf import settings as django_settings
        monkeypatch.setattr(django_settings, "WEB_URL", "http://localhost:3000", raising=False)

        url = f"/api/workspaces/{workspace.slug}/calendar/meeting-notes/"
        payload = {
            "meeting_id": "project-pick-event-1",
            "meeting_title": "Project Pick Meeting",
            "account_id": "acct-pick",
            "calendar_id": "primary",
            "notes": "Notes destined for a specific project.",
            "project_id": str(chosen_project.id),
        }

        response = session_client.post(url, payload, format="json")
        assert response.status_code == status.HTTP_201_CREATED, (
            f"expected 201; got {response.status_code}: {response.data}"
        )
        page_id = response.data["id"]
        assert str(chosen_project.id) in response.data["url"]
        assert ProjectPage.objects.filter(page_id=page_id, project=chosen_project).exists()
        assert not ProjectPage.objects.filter(page_id=page_id, project=default_project).exists()

        # Invalid project ids (not a uuid / not a member) fall back to the
        # oldest-membership default rather than erroring.
        for bad_project_id in ["not-a-uuid", "00000000-0000-0000-0000-000000000000"]:
            bad_response = session_client.post(
                url,
                {
                    **payload,
                    "meeting_id": f"project-pick-fallback-{bad_project_id[:8]}",
                    "project_id": bad_project_id,
                },
                format="json",
            )
            assert bad_response.status_code == status.HTTP_201_CREATED, (
                f"fallback save should still 201; got {bad_response.status_code}: {bad_response.data}"
            )
            assert str(default_project.id) in bad_response.data["url"]

    # ------------------------------------------------------------------ #
    # Atlas baseline: OAuth token refresh retries credential candidates   #
    # ------------------------------------------------------------------ #

    @pytest.mark.django_db
    def test_atlas_baseline_token_refresh_retries_second_credential_candidate(
        self, session_client, create_user, monkeypatch
    ):
        """_refresh_if_needed iterates credential candidates when the first one
        returns 400 from Google. The account must be updated with the token from
        the successful candidate and the event list request must succeed.
        """
        account = UserCalendarAccount.objects.create(
            user=create_user,
            provider=UserCalendarAccount.PROVIDER_GOOGLE,
            account_email="atlas@baseline.test",
            primary_calendar_id="primary",
            access_token_encrypted=encrypt_data("old-access-token"),
            refresh_token_encrypted=encrypt_data("stored-refresh-token"),
            # Expired — forces a refresh on every call.
            token_expires_at=datetime.now(timezone.utc) - timedelta(hours=2),
            is_active=True,
        )

        refresh_attempts: list[dict] = []

        def mock_client_credential_candidates(client):
            # web: first candidate fails, second succeeds.
            if client == "web":
                return [("bad-id", "bad-secret"), ("good-id", "good-secret")]
            return []

        def mock_post(url, data, timeout):
            refresh_attempts.append({"client_id": data["client_id"]})
            if data["client_id"] == "bad-id":
                return MockResponse({"error": "invalid_client"}, status.HTTP_400_BAD_REQUEST)
            # second candidate succeeds
            return MockResponse(
                {
                    "access_token": "refreshed-access-token",
                    "refresh_token": "rotated-refresh-token",
                    "expires_in": 3600,
                }
            )

        event_auth_headers: list[str] = []

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
            {"from": "2026-06-01T00:00:00Z", "to": "2026-06-30T00:00:00Z"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data == {"events": []}

        # Both candidates must have been tried before success.
        assert [a["client_id"] for a in refresh_attempts] == ["bad-id", "good-id"]

        # The event request must have used the refreshed token.
        assert event_auth_headers == ["Bearer refreshed-access-token"]

        account.refresh_from_db()
        assert decrypt_data(account.access_token_encrypted) == "refreshed-access-token"
        assert decrypt_data(account.refresh_token_encrypted) == "rotated-refresh-token"
