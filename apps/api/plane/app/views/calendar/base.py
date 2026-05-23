# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Workspace calendar: native DragonFruit task calendar + optional Google overlay.

There are two halves to this module:

(1) Native task feed: `MyCalendarTasksEndpoint` returns issues across the
    workspace where the current user is the assignee or creator, with a
    target_date in the requested range. This drives the always-on calendar
    view — no third-party connection required.

(2) Google Calendar integration: read-only OAuth + events fetch. Optional
    overlay on top of the native task feed. Tokens stored Fernet-encrypted.
"""

import os
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import requests
from django.conf import settings
from django.db.models import Q
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import allow_permission, ROLE
from plane.db.models import Issue, Project, State, UserCalendarAccount
from plane.license.utils.instance_value import get_configuration_value
from plane.license.utils.encryption import decrypt_data, encrypt_data

from ..base import BaseAPIView


GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_CAL_API = "https://www.googleapis.com/calendar/v3"
SCOPES = ["https://www.googleapis.com/auth/calendar.events", "openid", "email"]


def _first_config_value(keys: list[str], default: str = "", *, prefer_env: bool = False) -> str:
    if prefer_env:
        for key in keys:
            value = os.environ.get(key)
            if value:
                return value

    values = get_configuration_value(
        [{"key": key, "default": os.environ.get(key, "")} for key in keys]
    )
    for value in values:
        if value:
            return str(value)
    for key in keys:
        value = os.environ.get(key)
        if value:
            return value
    return default


def _calendar_web_credentials() -> tuple[str, str]:
    calendar_client_id = _first_config_value(["GOOGLE_CALENDAR_CLIENT_ID"], prefer_env=True)
    calendar_client_secret = _first_config_value(["GOOGLE_CALENDAR_CLIENT_SECRET"], prefer_env=True)
    google_client_id = _first_config_value(["GOOGLE_CLIENT_ID"], prefer_env=True)
    google_client_secret = _first_config_value(["GOOGLE_CLIENT_SECRET"], prefer_env=True)

    client_id = calendar_client_id or google_client_id
    if calendar_client_id and google_client_id and calendar_client_id == google_client_id and google_client_secret:
        return client_id, google_client_secret

    return client_id, calendar_client_secret or google_client_secret


def _normalize_client(client: str | None) -> str:
    normalized = (client or "web").strip().lower()
    return normalized if normalized in {"web", "native"} else "web"


def _client_credentials(client: str | None) -> tuple[str, str]:
    """Read Google credentials from Django settings.

    We reuse the existing Plane Google OAuth client (already plumbed for
    `IS_GOOGLE_ENABLED`); admins just need to add the `calendar.readonly`
    scope in Google Cloud and add a redirect URI for this view.
    """
    normalized = _normalize_client(client)
    if normalized == "native":
        return (
            _first_config_value(
                [
                    "GOOGLE_CALENDAR_NATIVE_CLIENT_ID",
                    "GOOGLE_CALENDAR_CLIENT_ID",
                    "GOOGLE_CLIENT_ID",
                ]
            ),
            _first_config_value(
                [
                    "GOOGLE_CALENDAR_NATIVE_CLIENT_SECRET",
                    "GOOGLE_CALENDAR_CLIENT_SECRET",
                    "GOOGLE_CLIENT_SECRET",
                ]
            ),
        )

    return _calendar_web_credentials()


def _redirect_uri_for_client(client: str | None) -> str:
    """Resolve the Google redirect URI for web/native clients.

    Priority:
    - native: GOOGLE_CALENDAR_REDIRECT_URI_NATIVE
    - web/default: GOOGLE_CALENDAR_REDIRECT_URI
    - fallback web callback under WEB_URL
    """
    normalized = _normalize_client(client)
    if normalized == "native":
        native = _first_config_value(
            [
                "GOOGLE_CALENDAR_NATIVE_REDIRECT_URI",
                "GOOGLE_CALENDAR_REDIRECT_URI_NATIVE",
            ]
        )
        if native:
            return native

    app_base_url = (
        getattr(settings, "APP_BASE_URL", None)
        or getattr(settings, "WEB_URL", "http://localhost:3000")
    ).rstrip("/")

    return _first_config_value(
        ["GOOGLE_CALENDAR_REDIRECT_URI"],
        f"{app_base_url}/calendar/oauth/callback",
    )


def _client_from_state(state: str | None) -> str | None:
    if not state or ":" not in state:
        return None
    client = state.rsplit(":", 1)[-1].strip().lower()
    if client in {"web", "native"}:
        return client
    return None


def _details_from_response(response: requests.Response) -> str:
    try:
        payload = response.json()
        if isinstance(payload, dict):
            message = payload.get("error_description") or payload.get("error") or payload
            return str(message)[:500]
    except ValueError:
        pass
    return response.text[:500]


def _serialize(acc: UserCalendarAccount) -> dict:
    return {
        "id": str(acc.id),
        "provider": acc.provider,
        "account_email": acc.account_email,
        "primary_calendar_id": acc.primary_calendar_id,
        "is_active": acc.is_active,
        "scopes": acc.scopes,
        "created_at": acc.created_at.isoformat() if acc.created_at else None,
    }


class CalendarAccountsListEndpoint(BaseAPIView):
    """List the calendar accounts the current user has connected."""

    def get(self, request):
        accounts = UserCalendarAccount.objects.filter(user=request.user, is_active=True).order_by("-created_at")
        return Response([_serialize(a) for a in accounts], status=status.HTTP_200_OK)


class CalendarAccountDetailEndpoint(BaseAPIView):
    """Disconnect a calendar account."""

    def delete(self, request, account_id):
        UserCalendarAccount.objects.filter(id=account_id, user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class GoogleCalendarStartEndpoint(BaseAPIView):
    """Return the Google OAuth authorize URL with the calendar scope."""

    def get(self, request):
        client = _normalize_client(request.query_params.get("client", "web"))
        client_id, _ = _client_credentials(client)
        redirect_uri = _redirect_uri_for_client(client)
        if not client_id:
            return Response(
                {"error": "Google OAuth is not configured on this instance."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        # Carry the user id through `state` so the callback can attribute
        # the token without relying on a session cookie. In production this
        # should be HMAC-signed; for now we keep it simple and validate that
        # the callback is hit by an authenticated user.
        params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": " ".join(SCOPES),
            "access_type": "offline",
            "prompt": "consent",
            "include_granted_scopes": "true",
            "state": f"{request.user.id}:{client}",
        }
        return Response(
            {"authorize_url": f"{GOOGLE_AUTHORIZE_URL}?{urlencode(params)}"},
            status=status.HTTP_200_OK,
        )


class GoogleCalendarCallbackEndpoint(BaseAPIView):
    """Exchange the authorization code for tokens and persist the account."""

    def post(self, request):
        code = request.data.get("code")
        state = request.data.get("state")
        client = request.data.get("client") or _client_from_state(state) or "web"
        if not code:
            return Response({"error": "code is required"}, status=status.HTTP_400_BAD_REQUEST)

        client_id, client_secret = _client_credentials(client)
        redirect_uri = _redirect_uri_for_client(client)
        if not client_id or not client_secret:
            return Response(
                {"error": "Google OAuth is not configured on this instance."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        token_resp = requests.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
            timeout=10,
        )
        if token_resp.status_code != 200:
            details = _details_from_response(token_resp)
            return Response(
                {
                    "error": "Token exchange failed",
                    "details": details,
                    "client": client,
                    "redirect_uri": redirect_uri,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        td = token_resp.json()
        access_token = td.get("access_token")
        refresh_token = td.get("refresh_token", "")
        expires_in = int(td.get("expires_in", 0))
        scope = td.get("scope", "")

        # Figure out the user's primary calendar + the connected email
        cal_resp = requests.get(
            f"{GOOGLE_CAL_API}/users/me/calendarList/primary",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        primary_calendar_id = ""
        account_email = ""
        if cal_resp.status_code == 200:
            data = cal_resp.json()
            primary_calendar_id = data.get("id", "")
            account_email = data.get("id", "")

        account = (
            UserCalendarAccount.objects.filter(
                user=request.user,
                provider=UserCalendarAccount.PROVIDER_GOOGLE,
                account_email=account_email,
            ).first()
            or UserCalendarAccount(user=request.user, provider=UserCalendarAccount.PROVIDER_GOOGLE, account_email=account_email)
        )
        account.access_token_encrypted = encrypt_data(access_token or "")
        if refresh_token:
            account.refresh_token_encrypted = encrypt_data(refresh_token)
        account.token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in) if expires_in else None
        account.primary_calendar_id = primary_calendar_id
        account.scopes = scope
        account.is_active = True
        account.save()

        return Response(_serialize(account), status=status.HTTP_200_OK)


def _refresh_if_needed(account: UserCalendarAccount, client: str | None = "web") -> str:
    """Return a fresh access token, refreshing via Google if expired."""
    access_token = decrypt_data(account.access_token_encrypted)
    expires_at = account.token_expires_at
    now = datetime.now(timezone.utc)
    if expires_at and now < expires_at - timedelta(seconds=30) and access_token:
        return access_token

    refresh_token = decrypt_data(account.refresh_token_encrypted)
    if not refresh_token:
        return access_token  # best-effort; caller will get 401 and surface it

    client_id, client_secret = _client_credentials(client)
    if not client_id or not client_secret:
        return access_token
    resp = requests.post(
        GOOGLE_TOKEN_URL,
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
        timeout=10,
    )
    if resp.status_code != 200:
        return access_token

    td = resp.json()
    new_access = td.get("access_token", access_token)
    expires_in = int(td.get("expires_in", 3600))
    account.access_token_encrypted = encrypt_data(new_access)
    account.token_expires_at = now + timedelta(seconds=expires_in)
    account.save(update_fields=["access_token_encrypted", "token_expires_at"])
    return new_access


class CalendarAccountEventsEndpoint(BaseAPIView):
    """Fetch events for a connected calendar in [from, to]."""

    def get(self, request, account_id):
        try:
            account = UserCalendarAccount.objects.get(id=account_id, user=request.user, is_active=True)
        except UserCalendarAccount.DoesNotExist:
            return Response({"error": "Account not found"}, status=status.HTTP_404_NOT_FOUND)

        time_min = request.query_params.get("from") or datetime.now(timezone.utc).isoformat()
        time_max = (
            request.query_params.get("to")
            or (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        )
        calendar_id = account.primary_calendar_id or "primary"

        access_token = _refresh_if_needed(account)
        resp = requests.get(
            f"{GOOGLE_CAL_API}/calendars/{calendar_id}/events",
            params={
                "timeMin": time_min,
                "timeMax": time_max,
                "singleEvents": "true",
                "orderBy": "startTime",
                "maxResults": 250,
            },
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        if resp.status_code != 200:
            return Response(
                {"error": "Failed to fetch events", "status": resp.status_code, "details": _details_from_response(resp)},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        data = resp.json()
        events = [_event_to_dict(e) for e in data.get("items", [])]
        return Response({"events": events}, status=status.HTTP_200_OK)


class UpcomingCalendarMeetingsEndpoint(BaseAPIView):
    """Fetch the current user's next Google Calendar meetings across accounts."""

    def get(self, request):
        time_min = request.query_params.get("from") or datetime.now(timezone.utc).isoformat()
        time_max = (
            request.query_params.get("to")
            or (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
        )
        accounts = UserCalendarAccount.objects.filter(user=request.user, is_active=True)
        events: list[dict] = []

        for account in accounts:
            calendar_id = account.primary_calendar_id or "primary"
            access_token = _refresh_if_needed(account)
            resp = requests.get(
                f"{GOOGLE_CAL_API}/calendars/{calendar_id}/events",
                params={
                    "timeMin": time_min,
                    "timeMax": time_max,
                    "singleEvents": "true",
                    "orderBy": "startTime",
                    "maxResults": 20,
                },
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=10,
            )
            if resp.status_code != 200:
                events.append(
                    {
                        "id": f"error-{account.id}",
                        "title": "Google Calendar needs reconnect",
                        "description": _details_from_response(resp),
                        "location": "",
                        "start": time_min,
                        "end": time_min,
                        "all_day": False,
                        "html_link": "",
                        "status": "error",
                        "account_id": str(account.id),
                        "account_email": account.account_email,
                        "source": "google_calendar",
                    }
                )
                continue
            for raw_event in resp.json().get("items", []):
                event = _event_to_dict(raw_event)
                event["account_id"] = str(account.id)
                event["account_email"] = account.account_email
                event["source"] = "google_calendar"
                events.append(event)

        events = [event for event in events if event.get("start")]
        events.sort(key=lambda event: event["start"])
        return Response({"events": events[:20]}, status=status.HTTP_200_OK)


def _upsert_google_event_for_issue(*, account: UserCalendarAccount, issue: Issue) -> str:
    """Create/update a Google Calendar event for one issue and return event id."""
    calendar_id = account.primary_calendar_id or "primary"
    access_token = _refresh_if_needed(account)
    start_date = issue.start_date or issue.target_date
    end_date = issue.target_date or issue.start_date or start_date
    if start_date is None:
        raise ValueError("Issue has no start or target date to sync")

    payload = {
        "summary": issue.name,
        "description": issue.description_stripped or "",
        "start": {"date": start_date.isoformat()},
        "end": {"date": end_date.isoformat()},
    }

    if issue.external_source == "google_calendar" and issue.external_id:
        resp = requests.patch(
            f"{GOOGLE_CAL_API}/calendars/{calendar_id}/events/{issue.external_id}",
            json=payload,
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
            timeout=10,
        )
        if resp.status_code == 200:
            return issue.external_id

    create_resp = requests.post(
        f"{GOOGLE_CAL_API}/calendars/{calendar_id}/events",
        json=payload,
        headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
        timeout=10,
    )
    if create_resp.status_code not in (200, 201):
        raise RuntimeError(f"google_event_sync_failed:{create_resp.status_code}")
    event_id = create_resp.json().get("id")
    if not event_id:
        raise RuntimeError("google_event_sync_failed:no_event_id")
    issue.external_source = "google_calendar"
    issue.external_id = event_id
    issue.save(update_fields=["external_source", "external_id", "updated_at"])
    return event_id


class CalendarSyncTasksToGoogleEndpoint(BaseAPIView):
    """Two-way sync step 1: push DragonFruit tasks to Google Calendar events."""

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug):
        account_id = request.data.get("account_id")
        if not account_id:
            return Response({"error": "account_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            account = UserCalendarAccount.objects.get(id=account_id, user=request.user, is_active=True)
        except UserCalendarAccount.DoesNotExist:
            return Response({"error": "Account not found"}, status=status.HTTP_404_NOT_FOUND)

        time_from = request.data.get("from")
        time_to = request.data.get("to")
        if not time_from or not time_to:
            return Response({"error": "from and to are required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            from_dt = datetime.fromisoformat(str(time_from).replace("Z", "+00:00"))
            to_dt = datetime.fromisoformat(str(time_to).replace("Z", "+00:00"))
        except ValueError:
            return Response({"error": "from/to must be ISO-8601"}, status=status.HTTP_400_BAD_REQUEST)

        issues = (
            Issue.issue_objects.filter(workspace__slug=slug)
            .filter(
                project__project_projectmember__member=request.user,
                project__project_projectmember__is_active=True,
            )
            .filter(Q(assignees=request.user) | Q(created_by=request.user))
            .filter(
                Q(target_date__range=(from_dt.date(), to_dt.date()))
                | Q(start_date__range=(from_dt.date(), to_dt.date()))
            )
            .distinct()
            .order_by("target_date", "start_date")
        )

        synced = 0
        failed: list[dict] = []
        for issue in issues:
            try:
                _upsert_google_event_for_issue(account=account, issue=issue)
                synced += 1
            except Exception as exc:  # noqa: BLE001
                failed.append({"issue_id": str(issue.id), "reason": str(exc)[:200]})

        return Response({"synced": synced, "failed": failed}, status=status.HTTP_200_OK)


class CalendarImportGoogleEventsEndpoint(BaseAPIView):
    """Two-way sync step 2: import Google Calendar events into a DragonFruit project."""

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug):
        account_id = request.data.get("account_id")
        project_id = request.data.get("project_id")
        time_from = request.data.get("from")
        time_to = request.data.get("to")
        if not account_id:
            return Response(
                {"error": "account_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not time_from or not time_to:
            return Response({"error": "from and to are required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            account = UserCalendarAccount.objects.get(id=account_id, user=request.user, is_active=True)
            project_query = Project.objects.filter(
                workspace__slug=slug,
                project_projectmember__member=request.user,
                project_projectmember__is_active=True,
            )
            project = project_query.get(id=project_id) if project_id else project_query.order_by("created_at").first()
            if project is None:
                return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
        except UserCalendarAccount.DoesNotExist:
            return Response({"error": "Account not found"}, status=status.HTTP_404_NOT_FOUND)
        except Project.DoesNotExist:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

        access_token = _refresh_if_needed(account)
        calendar_id = account.primary_calendar_id or "primary"
        resp = requests.get(
            f"{GOOGLE_CAL_API}/calendars/{calendar_id}/events",
            params={
                "timeMin": time_from,
                "timeMax": time_to,
                "singleEvents": "true",
                "orderBy": "startTime",
                "maxResults": 250,
            },
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        if resp.status_code != 200:
            return Response(
                {"error": "Failed to fetch events", "status": resp.status_code, "details": _details_from_response(resp)},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        default_state = (
            State.objects.filter(project=project, default=True).first()
            or State.objects.filter(project=project).order_by("sequence").first()
        )
        imported = 0
        skipped = 0
        for event in resp.json().get("items", []):
            event_id = event.get("id")
            if not event_id or event.get("status") == "cancelled":
                skipped += 1
                continue
            start_date = _google_event_date(event.get("start", {}))
            end_date = _google_event_date(event.get("end", {})) or start_date
            if not start_date:
                skipped += 1
                continue
            issue, created = Issue.issue_objects.update_or_create(
                workspace=project.workspace,
                project=project,
                external_source="google_calendar",
                external_id=event_id,
                defaults={
                    "name": event.get("summary") or "Untitled calendar event",
                    "description_html": event.get("description") or "<p>Imported from Google Calendar.</p>",
                    "start_date": start_date,
                    "target_date": end_date,
                    "state": default_state,
                    "priority": "none",
                },
            )
            if created:
                issue.assignees.add(request.user)
            imported += 1

        return Response({"imported": imported, "skipped": skipped}, status=status.HTTP_200_OK)


def _google_event_date(value: dict):
    raw = value.get("dateTime") or value.get("date")
    if not raw:
        return None
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00")).date()
    except ValueError:
        return None


def _event_to_dict(e: dict) -> dict:
    """Reduce Google's event payload to what the frontend actually uses."""
    start = e.get("start", {})
    end = e.get("end", {})
    is_all_day = "date" in start and "dateTime" not in start
    return {
        "id": e.get("id"),
        "title": e.get("summary") or "(no title)",
        "description": e.get("description", ""),
        "location": e.get("location", ""),
        "start": start.get("dateTime") or start.get("date"),
        "end": end.get("dateTime") or end.get("date"),
        "all_day": is_all_day,
        "html_link": e.get("htmlLink", ""),
        "status": e.get("status", ""),
    }


class MyCalendarTasksEndpoint(BaseAPIView):
    """Return tasks (issues) for the current user that fall within a date range.

    Pulled across every project in the workspace where the user is a member.
    Each entry is shaped for the Schedule-X frontend — title, start, end,
    project, state, and the URL slug needed to link back.
    """

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        time_from = request.query_params.get("from")
        time_to = request.query_params.get("to")
        if not time_from or not time_to:
            return Response({"error": "from and to are required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            from_dt = datetime.fromisoformat(time_from.replace("Z", "+00:00"))
            to_dt = datetime.fromisoformat(time_to.replace("Z", "+00:00"))
        except ValueError:
            return Response({"error": "from/to must be ISO-8601"}, status=status.HTTP_400_BAD_REQUEST)

        user = request.user

        # A task lands on the calendar if either its target_date or start_date
        # intersects the visible range. Assigned-to-me OR created-by-me, scoped
        # to projects the user is an active member of.
        issues = (
            Issue.issue_objects.filter(workspace__slug=slug)
            .filter(project__project_projectmember__member=user, project__project_projectmember__is_active=True)
            .filter(Q(assignees=user) | Q(created_by=user))
            .filter(
                Q(target_date__range=(from_dt.date(), to_dt.date()))
                | Q(start_date__range=(from_dt.date(), to_dt.date()))
            )
            .select_related("project", "state")
            .distinct()
            .order_by("target_date", "start_date")
        )

        tasks = []
        for issue in issues:
            start = issue.start_date or issue.target_date
            end = issue.target_date or issue.start_date
            tasks.append(
                {
                    "id": str(issue.id),
                    "sequence_id": issue.sequence_id,
                    "title": issue.name,
                    "project_id": str(issue.project_id) if issue.project_id else None,
                    "project_identifier": issue.project.identifier if issue.project else "",
                    "state_id": str(issue.state_id) if issue.state_id else None,
                    "state_name": issue.state.name if issue.state else "",
                    "state_color": issue.state.color if issue.state else "#9ca3af",
                    "state_group": issue.state.group if issue.state else "",
                    "start": start.isoformat() if start else None,
                    "end": end.isoformat() if end else None,
                    "priority": issue.priority,
                    "completed": issue.state.group == "completed" if issue.state else False,
                }
            )
        return Response({"tasks": tasks}, status=status.HTTP_200_OK)
