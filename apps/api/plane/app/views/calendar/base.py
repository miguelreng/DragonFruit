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

import base64
import json
import os
import tempfile
from datetime import datetime, timedelta, timezone
from string import Template
from urllib.parse import quote, urlencode

import requests
from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from rest_framework import status
from rest_framework.response import Response
from openai import OpenAI

from plane.app.permissions import allow_permission, ROLE
from plane.db.models import Issue, Page, Project, ProjectPage, State, UserCalendarAccount, Workspace
from plane.bgtasks.page_transaction_task import page_transaction
from plane.app.views.external.base import call_llm_chat, get_llm_config
from plane.license.utils.encryption import decrypt_data, encrypt_data
from plane.utils.exception_logger import log_exception
from plane.utils.html_builders import escape_text, list_html
from plane.utils.url import normalize_url_path

from ..base import BaseAPIView
from .google_oauth import (
    GOOGLE_AUTHORIZE_URL,
    GOOGLE_TOKEN_URL,
    GOOGLE_CAL_API,
    SCOPES,
    _client_credentials,
    _client_from_state,
    _details_from_response,
    _google_calendar_url,
    _normalize_client,
    _redirect_uri_for_client,
    _serialize,
    _upsert_calendar_account,
    _client_credential_candidates as _google_oauth_client_credential_candidates,
)


def _client_credential_candidates(client: str | None) -> list[tuple[str, str]]:
    """Re-exported in this namespace so tests can monkeypatch it here."""
    return _google_oauth_client_credential_candidates(client)


def _token_exchange_candidates(client: str | None) -> list[dict]:
    normalized = _normalize_client(client)
    clients = [normalized]
    alternate = "native" if normalized == "web" else "web"
    clients.append(alternate)

    seen: set[tuple[str, str, str]] = set()
    candidates: list[dict] = []
    for candidate_client in clients:
        redirect_uri = _redirect_uri_for_client(candidate_client)
        for client_id, client_secret in _client_credential_candidates(candidate_client):
            key = (client_id, client_secret, redirect_uri)
            if key in seen:
                continue
            seen.add(key)
            candidates.append(
                {
                    "client": candidate_client,
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "redirect_uri": redirect_uri,
                }
            )
    return candidates


def _refresh_if_needed(account: UserCalendarAccount, client: str | None = "web", *, force: bool = False) -> str:
    """Return a fresh access token, refreshing via Google if expired."""
    access_token = decrypt_data(account.access_token_encrypted)
    expires_at = account.token_expires_at
    now = datetime.now(timezone.utc)
    if not force and expires_at and now < expires_at - timedelta(seconds=30) and access_token:
        return access_token

    refresh_token = decrypt_data(account.refresh_token_encrypted)
    if not refresh_token:
        return access_token  # best-effort; caller will get 401 and surface it

    normalized_client = _normalize_client(client)
    client_order = [normalized_client]
    alternate = "native" if normalized_client == "web" else "web"
    client_order.append(alternate)

    seen: set[tuple[str, str]] = set()
    credential_candidates: list[tuple[str, str]] = []
    for candidate_client in client_order:
        for client_id, client_secret in _client_credential_candidates(candidate_client):
            key = (client_id, client_secret)
            if key in seen:
                continue
            seen.add(key)
            credential_candidates.append(key)

    td = None
    for client_id, client_secret in credential_candidates:
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
            continue
        td = resp.json()
        break

    if td is None:
        return access_token

    new_access = td.get("access_token", access_token)
    expires_in = int(td.get("expires_in", 3600))
    account.access_token_encrypted = encrypt_data(new_access)
    account.token_expires_at = now + timedelta(seconds=expires_in)
    update_fields = ["access_token_encrypted", "token_expires_at"]
    new_refresh_token = td.get("refresh_token")
    if new_refresh_token:
        account.refresh_token_encrypted = encrypt_data(new_refresh_token)
        update_fields.append("refresh_token_encrypted")
    account.save(update_fields=update_fields)
    return new_access


def _google_api_request(
    *,
    account: UserCalendarAccount,
    method: str,
    url: str,
    client: str | None = "web",
    params: dict | None = None,
    json: dict | None = None,
    timeout: int = 10,
) -> requests.Response:
    def _send(token: str) -> requests.Response:
        headers = {"Authorization": f"Bearer {token}"}
        if json is not None:
            headers["Content-Type"] = "application/json"
        return requests.request(method, url, params=params, json=json, headers=headers, timeout=timeout)

    access_token = _refresh_if_needed(account, client=client)
    response = _send(access_token)

    if response.status_code in {401, 403}:
        retry_token = _refresh_if_needed(account, client=client, force=True)
        response = _send(retry_token)

    return response


def _calendar_to_dict(calendar: dict) -> dict:
    return {
        "id": calendar.get("id", ""),
        "summary": calendar.get("summary") or calendar.get("id") or "Google Calendar",
        "description": calendar.get("description") or "",
        "background_color": calendar.get("backgroundColor") or "",
        "foreground_color": calendar.get("foregroundColor") or "",
        "primary": bool(calendar.get("primary")),
        "selected": calendar.get("selected", True),
        "access_role": calendar.get("accessRole", ""),
    }


def _calendar_error_event(
    *,
    account: UserCalendarAccount,
    time_min: str,
    details: str,
    calendar_id: str = "",
    calendar_name: str = "",
) -> dict:
    return {
        "id": f"error-{account.id}-{calendar_id or 'calendar'}",
        "title": "Google Calendar needs reconnect",
        "description": details,
        "location": "",
        "start": time_min,
        "end": time_min,
        "all_day": False,
        "html_link": "",
        "status": "error",
        "account_id": str(account.id),
        "account_email": account.account_email,
        "calendar_id": calendar_id,
        "calendar_name": calendar_name or account.account_email,
        "source": "google_calendar",
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


class CalendarAccountCalendarsEndpoint(BaseAPIView):
    """List calendars available inside one connected Google account."""

    def get(self, request, account_id):
        try:
            account = UserCalendarAccount.objects.get(id=account_id, user=request.user, is_active=True)
        except UserCalendarAccount.DoesNotExist:
            return Response({"error": "Account not found"}, status=status.HTTP_404_NOT_FOUND)

        resp = _google_api_request(
            account=account,
            method="GET",
            url=f"{GOOGLE_CAL_API}/users/me/calendarList",
            params={"maxResults": 250, "minAccessRole": "reader"},
            timeout=10,
        )
        if resp.status_code != 200:
            return Response(
                {
                    "error": "Failed to fetch calendars",
                    "status": resp.status_code,
                    "details": _details_from_response(resp),
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

        calendars = [_calendar_to_dict(c) for c in resp.json().get("items", []) if c.get("id")]
        calendars.sort(key=lambda c: (not c["primary"], c["summary"].lower()))
        return Response({"calendars": calendars}, status=status.HTTP_200_OK)


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
            "prompt": "consent select_account",
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

        exchange_candidates = _token_exchange_candidates(client)
        if not exchange_candidates:
            return Response(
                {"error": "Google OAuth is not configured on this instance."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        token_resp = None
        used_candidate = None
        used_candidate_index = 0
        for index, candidate in enumerate(exchange_candidates):
            token_resp = requests.post(
                GOOGLE_TOKEN_URL,
                data={
                    "code": code,
                    "client_id": candidate["client_id"],
                    "client_secret": candidate["client_secret"],
                    "redirect_uri": candidate["redirect_uri"],
                    "grant_type": "authorization_code",
                },
                timeout=10,
            )
            used_candidate_index = index
            used_candidate = candidate
            if token_resp.status_code == 200:
                break

        if token_resp is None:
            return Response(
                {"error": "Google OAuth is not configured on this instance."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if token_resp.status_code != 200:
            details = _details_from_response(token_resp)
            return Response(
                {
                    "error": "Token exchange failed",
                    "details": details,
                    "client": client,
                    "redirect_uri": used_candidate["redirect_uri"] if used_candidate else "",
                    "credential_candidates": len(exchange_candidates),
                    "last_candidate": used_candidate_index + 1,
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

        account = _upsert_calendar_account(
            user=request.user,
            account_email=account_email,
            access_token=access_token or "",
            refresh_token=refresh_token,
            expires_in=expires_in,
            primary_calendar_id=primary_calendar_id,
            scope=scope,
        )

        return Response(_serialize(account), status=status.HTTP_200_OK)


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
        calendar_id = request.query_params.get("calendar_id") or account.primary_calendar_id or "primary"

        resp = _google_api_request(
            account=account,
            method="GET",
            url=_google_calendar_url(calendar_id, "events"),
            params={
                "timeMin": time_min,
                "timeMax": time_max,
                "singleEvents": "true",
                "orderBy": "startTime",
                "maxResults": 250,
            },
            timeout=10,
        )
        if resp.status_code != 200:
            return Response(
                {
                    "error": "Failed to fetch events",
                    "status": resp.status_code,
                    "details": _details_from_response(resp),
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

        data = resp.json()
        events = []
        for raw_event in data.get("items", []):
            event = _event_to_dict(raw_event)
            event["calendar_id"] = calendar_id
            events.append(event)
        return Response({"events": events}, status=status.HTTP_200_OK)

    def post(self, request, account_id):
        """Create a Google Calendar event (not a task) on a connected calendar."""
        try:
            account = UserCalendarAccount.objects.get(id=account_id, user=request.user, is_active=True)
        except UserCalendarAccount.DoesNotExist:
            return Response({"error": "Account not found"}, status=status.HTTP_404_NOT_FOUND)

        title = (request.data.get("title") or "").strip()
        if not title:
            return Response({"error": "title is required"}, status=status.HTTP_400_BAD_REQUEST)

        calendar_id = request.data.get("calendar_id") or account.primary_calendar_id or "primary"
        description = (request.data.get("description") or "").strip()
        all_day = bool(request.data.get("all_day"))
        start_raw = request.data.get("start")
        end_raw = request.data.get("end") or start_raw
        time_zone = request.data.get("time_zone")

        if not start_raw:
            return Response({"error": "start is required"}, status=status.HTTP_400_BAD_REQUEST)

        if all_day:
            try:
                start_date = datetime.fromisoformat(str(start_raw)[:10]).date()
                end_date = datetime.fromisoformat(str(end_raw)[:10]).date()
            except ValueError:
                return Response({"error": "start/end must be YYYY-MM-DD"}, status=status.HTTP_400_BAD_REQUEST)
            if end_date < start_date:
                end_date = start_date
            # Google treats the all-day end date as exclusive, so bump the
            # user's inclusive end by a day.
            start_payload = {"date": start_date.isoformat()}
            end_payload = {"date": (end_date + timedelta(days=1)).isoformat()}
        else:
            start_payload = {"dateTime": str(start_raw)}
            end_payload = {"dateTime": str(end_raw)}
            if time_zone:
                start_payload["timeZone"] = str(time_zone)
                end_payload["timeZone"] = str(time_zone)

        payload = {"summary": title, "description": description, "start": start_payload, "end": end_payload}

        resp = _google_api_request(
            account=account,
            method="POST",
            url=_google_calendar_url(calendar_id, "events"),
            json=payload,
            timeout=10,
        )
        if resp.status_code not in (200, 201):
            return Response(
                {
                    "error": "Failed to create event",
                    "status": resp.status_code,
                    "details": _details_from_response(resp),
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )
        event = _event_to_dict(resp.json())
        event["calendar_id"] = calendar_id
        return Response({"event": event}, status=status.HTTP_201_CREATED)

    def patch(self, request, account_id):
        """Update an existing Google Calendar event's schedule and editable details."""
        try:
            account = UserCalendarAccount.objects.get(id=account_id, user=request.user, is_active=True)
        except UserCalendarAccount.DoesNotExist:
            return Response({"error": "Account not found"}, status=status.HTTP_404_NOT_FOUND)

        event_id = str(request.data.get("event_id") or "").strip()
        if not event_id:
            return Response({"error": "event_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        calendar_id = request.data.get("calendar_id") or account.primary_calendar_id or "primary"
        all_day = bool(request.data.get("all_day"))
        start_raw = request.data.get("start")
        end_raw = request.data.get("end") or start_raw
        time_zone = request.data.get("time_zone")
        if not start_raw:
            return Response({"error": "start is required"}, status=status.HTTP_400_BAD_REQUEST)

        if all_day:
            try:
                start_date = datetime.fromisoformat(str(start_raw)[:10]).date()
                end_date = datetime.fromisoformat(str(end_raw)[:10]).date()
            except ValueError:
                return Response({"error": "start/end must be YYYY-MM-DD"}, status=status.HTTP_400_BAD_REQUEST)
            if end_date < start_date:
                end_date = start_date
            start_payload = {"date": start_date.isoformat()}
            # The frontend uses an inclusive end date; Google requires exclusive.
            end_payload = {"date": (end_date + timedelta(days=1)).isoformat()}
        else:
            start_payload = {"dateTime": str(start_raw)}
            end_payload = {"dateTime": str(end_raw)}
            if time_zone:
                start_payload["timeZone"] = str(time_zone)
                end_payload["timeZone"] = str(time_zone)

        event_payload = {"start": start_payload, "end": end_payload}
        if "title" in request.data:
            title = str(request.data.get("title") or "").strip()
            if not title:
                return Response({"error": "title is required"}, status=status.HTTP_400_BAD_REQUEST)
            event_payload["summary"] = title
        if "description" in request.data:
            event_payload["description"] = str(request.data.get("description") or "")
        if "location" in request.data:
            event_payload["location"] = str(request.data.get("location") or "")

        resp = _google_api_request(
            account=account,
            method="PATCH",
            url=_google_calendar_url(calendar_id, f"events/{quote(event_id, safe='')}"),
            json=event_payload,
            timeout=10,
        )
        if resp.status_code != 200:
            return Response(
                {
                    "error": "Failed to update event",
                    "status": resp.status_code,
                    "details": _details_from_response(resp),
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

        event = _event_to_dict(resp.json())
        event["calendar_id"] = calendar_id
        return Response({"event": event}, status=status.HTTP_200_OK)


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
            try:
                calendars_resp = _google_api_request(
                    account=account,
                    method="GET",
                    url=f"{GOOGLE_CAL_API}/users/me/calendarList",
                    params={"maxResults": 250, "minAccessRole": "reader"},
                    timeout=10,
                )
            except requests.RequestException as exc:
                events.append(
                    _calendar_error_event(
                        account=account,
                        time_min=time_min,
                        details=f"Google Calendar request failed: {exc}",
                    )
                )
                continue

            if calendars_resp.status_code == 200:
                calendars = [
                    _calendar_to_dict(calendar)
                    for calendar in calendars_resp.json().get("items", [])
                    if calendar.get("selected", True)
                ]
            else:
                calendars = [{"id": account.primary_calendar_id or "primary", "summary": account.account_email}]

            for calendar in calendars:
                calendar_id = calendar.get("id") or account.primary_calendar_id or "primary"
                try:
                    resp = _google_api_request(
                        account=account,
                        method="GET",
                        url=_google_calendar_url(calendar_id, "events"),
                        params={
                            "timeMin": time_min,
                            "timeMax": time_max,
                            "singleEvents": "true",
                            "orderBy": "startTime",
                            "maxResults": 20,
                        },
                        timeout=10,
                    )
                except requests.RequestException as exc:
                    events.append(
                        _calendar_error_event(
                            account=account,
                            time_min=time_min,
                            details=f"Google Calendar request failed: {exc}",
                            calendar_id=calendar_id,
                            calendar_name=calendar.get("summary") or account.account_email,
                        )
                    )
                    continue
                if resp.status_code != 200:
                    events.append(
                        _calendar_error_event(
                            account=account,
                            time_min=time_min,
                            details=_details_from_response(resp),
                            calendar_id=calendar_id,
                            calendar_name=calendar.get("summary") or account.account_email,
                        )
                    )
                    continue
                for raw_event in resp.json().get("items", []):
                    event = _event_to_dict(raw_event)
                    event["account_id"] = str(account.id)
                    event["account_email"] = account.account_email
                    event["calendar_id"] = calendar_id
                    event["calendar_name"] = calendar.get("summary") or account.account_email
                    event["source"] = "google_calendar"
                    events.append(event)

        events = [event for event in events if event.get("start")]
        events.sort(key=lambda event: event["start"])
        return Response({"events": events[:20]}, status=status.HTTP_200_OK)


def _attach_doc_to_calendar_event(
    *,
    user,
    account_id: str,
    calendar_id: str,
    event_id: str,
    doc_url: str,
    title: str,
) -> bool:
    """Best-effort: attach a meeting-notes doc link onto its Google Calendar event.

    Returns True when the attachment is present after the call. Never raises —
    failing to attach must not block saving the notes doc.
    """
    if not (account_id and event_id and doc_url):
        return False

    account = UserCalendarAccount.objects.filter(
        id=account_id,
        user=user,
        is_active=True,
        provider=UserCalendarAccount.PROVIDER_GOOGLE,
    ).first()
    if account is None:
        return False

    calendar_id = calendar_id or account.primary_calendar_id or "primary"
    event_url = _google_calendar_url(calendar_id, f"events/{event_id}")

    try:
        get_resp = _google_api_request(account=account, method="GET", url=event_url, timeout=10)
        if get_resp.status_code != 200:
            return False

        existing = get_resp.json().get("attachments") or []
        if any(a.get("fileUrl") == doc_url for a in existing):
            return True
        # Google caps attachments at 25 per event; PATCH replaces the whole list,
        # so we resend the existing ones plus ours.
        if len(existing) >= 25:
            return False

        attachments = existing + [
            {
                "fileUrl": doc_url,
                "title": (title or "Meeting notes")[:1024],
                "mimeType": "text/html",
            }
        ]
        patch_resp = _google_api_request(
            account=account,
            method="PATCH",
            url=event_url,
            params={"supportsAttachments": "true"},
            json={"attachments": attachments},
            timeout=10,
        )
        return patch_resp.status_code == 200
    except Exception:
        return False


class MeetingNotesDraftEndpoint(BaseAPIView):
    """Create or update a workspace document from captured meeting notes."""

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if not workspace:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        meeting_id = str(request.data.get("meeting_id") or "").strip()
        meeting_title = str(request.data.get("meeting_title") or "Meeting").strip()
        notes = str(request.data.get("notes") or "").strip()
        if request.FILES:
            transcript, transcription_error = _transcribe_meeting_audio(request=request, workspace=workspace)
            if transcription_error:
                return Response({"error": transcription_error}, status=status.HTTP_400_BAD_REQUEST)
            if transcript:
                notes = transcript
        if not notes:
            return Response({"error": "Meeting notes are required"}, status=status.HTTP_400_BAD_REQUEST)

        account_id = str(request.data.get("account_id") or "").strip()
        calendar_id = str(request.data.get("calendar_id") or "").strip()
        external_key = ":".join(part for part in [account_id, calendar_id, meeting_id] if part)[:255]
        if not external_key:
            external_key = f"meeting-notes:{request.user.id}:{datetime.now(timezone.utc).timestamp()}"[:255]

        try:
            summary = _summarize_meeting_notes(
                workspace=workspace,
                meeting_title=meeting_title,
                transcript=notes,
            )
        except Exception as exc:
            log_exception(exc)
            summary = None
        description_html = _meeting_notes_html(
            meeting_title=meeting_title,
            notes=notes,
            start=str(request.data.get("start") or ""),
            end=str(request.data.get("end") or ""),
            meeting_url=str(request.data.get("meeting_url") or ""),
            account_email=str(request.data.get("account_email") or ""),
            summary=summary,
        )

        # Convert the HTML body to the Yjs blob the collaborative editor reads
        # from, via the live server. The editor renders from description_binary,
        # not description_html. Crucially we must *replace* the doc's content in
        # place rather than swap in a freshly-generated, independently-rooted Yjs
        # blob: the editor caches each doc in IndexedDB by page id, so on
        # re-recording the same meeting a fresh blob would CRDT-merge with the
        # cached copy and stack a duplicate of the whole note on every save. The
        # live server's /replace-document reconciles the new HTML against the
        # existing state, so its deletions are real tombstones the editor applies
        # — replacing the content (and self-healing any already-duplicated doc)
        # instead of unioning it.
        def _apply_document_body(target_page):
            existing_binary = bytes(target_page.description_binary) if target_page.description_binary else None
            document_formats = _replace_meeting_notes_document_formats(
                page_id=str(target_page.id),
                description_html=description_html,
                existing_binary=existing_binary,
            )
            target_page.description_html = description_html
            if document_formats.get("description_binary"):
                target_page.description_json = document_formats.get("description_json") or {}
                target_page.description_binary = base64.b64decode(document_formats["description_binary"])
            else:
                # Live server unavailable — clear the blob so editors re-seed
                # from this fresh HTML on next open. The web editor reconciles
                # HTML seeds into its existing doc in place (real tombstones,
                # no fresh-root union), so this replaces the content for
                # clients with cached state instead of leaving stale notes.
                target_page.description_binary = None
                target_page.description_json = {}

        # The mac app asks which project the notes belong to when the user
        # stops recording; honor that choice when it's a project the user can
        # actually use, otherwise fall back to the oldest-membership default.
        requested_project_id = str(request.data.get("project_id") or "").strip()
        project = None
        if requested_project_id:
            try:
                project = Project.objects.filter(
                    id=requested_project_id,
                    workspace=workspace,
                    archived_at__isnull=True,
                    project_projectmember__member=request.user,
                    project_projectmember__is_active=True,
                ).first()
            except (ValueError, DjangoValidationError):
                project = None
        if not project:
            project = (
                Project.objects.filter(
                    workspace=workspace,
                    archived_at__isnull=True,
                    project_projectmember__member=request.user,
                    project_projectmember__is_active=True,
                )
                .order_by("created_at")
                .first()
            )
        if not project:
            return Response({"error": "No project available for meeting notes"}, status=status.HTTP_400_BAD_REQUEST)

        page = Page.objects.filter(
            workspace=workspace,
            external_source="google_meeting_notes",
            external_id=external_key,
        ).first()
        created = page is None
        old_description_html = None if created else page.description_html

        if page is None:
            page = Page(
                workspace=workspace,
                name=f"Meeting notes: {meeting_title}"[:255],
                page_type=Page.PAGE_TYPE_DOC,
                owned_by=request.user,
                access=Page.PRIVATE_ACCESS,
                external_source="google_meeting_notes",
                external_id=external_key,
            )
            _apply_document_body(page)
            page.save(created_by_id=request.user.id)
        else:
            page.name = f"Meeting notes: {meeting_title}"[:255]
            _apply_document_body(page)
            page.page_type = Page.PAGE_TYPE_DOC
            page.updated_by_id = request.user.id
            page.save()

        ProjectPage.objects.get_or_create(
            workspace=workspace,
            project=project,
            page=page,
            defaults={
                "created_by_id": request.user.id,
                "updated_by_id": request.user.id,
            },
        )
        try:
            page_transaction.delay(
                new_description_html=description_html,
                old_description_html=old_description_html,
                page_id=str(page.id),
            )
        except Exception:
            pass

        app_base_url = (
            getattr(settings, "APP_BASE_URL", None)
            or getattr(settings, "WEB_URL", "http://localhost:3000")
        ).rstrip("/")
        doc_url = f"{app_base_url}/{slug}/projects/{project.id}/pages/{page.id}"

        calendar_attached = _attach_doc_to_calendar_event(
            user=request.user,
            account_id=account_id,
            calendar_id=calendar_id,
            event_id=meeting_id,
            doc_url=doc_url,
            title=page.name,
        )

        return Response(
            {
                "id": str(page.id),
                "name": page.name,
                "created": created,
                "workspace_slug": slug,
                "url": doc_url,
                "calendar_attached": calendar_attached,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


_MEETING_SUMMARY_SYSTEM = (
    "You are a meeting notes assistant. You read a raw meeting transcript and "
    "produce clean, structured notes. Be faithful to the transcript: never invent "
    "decisions, owners, or action items that were not discussed. If a section has no "
    "content, return an empty list for it. Write in the dominant language of the "
    "transcript (English or Spanish)."
)

_MEETING_SUMMARY_INSTRUCTIONS = Template(
    """\
Summarize the meeting transcript below. Respond with ONLY a JSON object (no markdown
fences, no commentary) matching exactly this shape:

{
  "summary": "one or two sentence overview of the meeting",
  "summary_sections": [
    {"heading": "Short thematic heading", "body": "One short paragraph of prose."}
  ],
  "decisions": ["A concrete decision that was made", "..."],
  "next_steps": [
    {
      "owner": "Person responsible or empty string",
      "action": "What to do",
      "detail": "Optional extra context or empty string"
    }
  ],
  "details": [
    {"topic": "Discussion topic", "body": "What was said about it, in prose."}
  ]
}

Rules:
- summary_sections: 0-4 items capturing the main threads of discussion.
- decisions: only things that were actually agreed/decided. Empty list if none.
- next_steps: only concrete follow-up actions. Empty list if none.
- details: the substantive discussion points, in the order they came up.
- Keep prose tight. No filler.

Meeting title: $meeting_title

Transcript:
$transcript
"""
)


def _summarize_meeting_notes(*, workspace: Workspace, meeting_title: str, transcript: str) -> dict | None:
    """Route the transcript through the workspace BYOK LLM to produce structured notes.

    Returns a dict with keys summary/summary_sections/decisions/next_steps/details,
    or None when no LLM is configured or the call/parse fails (caller falls back).
    """
    transcript = (transcript or "").strip()
    if not transcript:
        return None

    api_key, model, provider = get_llm_config(workspace=workspace)
    if not (api_key and model and provider):
        return None

    user_prompt = _MEETING_SUMMARY_INSTRUCTIONS.substitute(
        meeting_title=meeting_title or "Meeting",
        transcript=transcript[:120_000],
    )
    text, error = call_llm_chat(
        system=_MEETING_SUMMARY_SYSTEM,
        user=user_prompt,
        api_key=api_key,
        model=model,
        provider=provider,
        temperature=0.2,
        max_tokens=4096,
    )
    if error or not text:
        return None

    raw = text.strip()
    # Strip an optional ```json ... ``` fence if the model added one.
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1] if "\n" in raw else raw
        if raw.endswith("```"):
            raw = raw[: -3]
        raw = raw.strip()
        if raw.lower().startswith("json"):
            raw = raw[4:].strip()
    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        # Last-ditch: grab the outermost {...} block.
        start_idx = raw.find("{")
        end_idx = raw.rfind("}")
        if start_idx == -1 or end_idx <= start_idx:
            return None
        try:
            data = json.loads(raw[start_idx : end_idx + 1])
        except (ValueError, TypeError):
            return None

    if not isinstance(data, dict):
        return None
    return data


def _replace_meeting_notes_document_formats(
    *, page_id: str, description_html: str, existing_binary: bytes | None
) -> dict:
    """Ask the live server to replace a meeting-notes doc's content with fresh
    HTML *in place*, returning the document-editor Yjs formats (binary + json).

    Reconciling against the doc's existing state (rather than building a fresh,
    independently-rooted blob) keeps the result a proper successor: its deletions
    are real CRDT tombstones, so collaborative editors and their IndexedDB caches
    replace the content instead of unioning it — which is what stacked a duplicate
    of the whole note on every re-recording. Returns {} when the live server is
    unset or unreachable; callers decide how to fall back.
    """
    live_url = getattr(settings, "LIVE_URL", None)
    if not live_url:
        return {}
    payload = {"page_id": page_id, "description_html": description_html}
    if existing_binary:
        payload["existing_binary"] = base64.b64encode(existing_binary).decode("ascii")
    try:
        url = normalize_url_path(f"{live_url}/replace-document/")
        response = requests.post(url, json=payload, timeout=15)
        if response.status_code == 200:
            return response.json()
        log_exception(
            Exception(f"replace-document returned {response.status_code}: {response.text[:200]}")
        )
    except requests.RequestException as exc:
        log_exception(exc)
    return {}


def _meeting_notes_html(
    *,
    meeting_title: str,
    notes: str,
    start: str,
    end: str,
    meeting_url: str,
    account_email: str,
    summary: dict | None = None,
) -> str:
    metadata = []
    if start:
        metadata.append(f"<strong>Start:</strong> {escape_text(start)}")
    if end:
        metadata.append(f"<strong>End:</strong> {escape_text(end)}")
    if account_email:
        metadata.append(f"<strong>Calendar:</strong> {escape_text(account_email)}")
    if meeting_url:
        safe_url = escape_text(meeting_url, quote=True)
        safe_url_label = escape_text(meeting_url)
        metadata.append(f'<strong>Join link:</strong> <a href="{safe_url}">{safe_url_label}</a>')

    transcript_paragraphs = "".join(
        f"<p>{escape_text(line)}</p>" for line in notes.splitlines() if line.strip()
    )
    if not transcript_paragraphs:
        transcript_paragraphs = f"<p>{escape_text(notes)}</p>"

    header = (
        f"<h2>{escape_text(meeting_title)}</h2>"
        f"<p><em>Captured by DragonFruit Atlas.</em></p>"
        f"{list_html(metadata)}"
    )

    structured = _structured_summary_html(summary) if summary else ""
    if structured:
        return f"{header}{structured}<h3>Transcript</h3>{transcript_paragraphs}"

    # Fallback: no LLM summary available — keep the plain transcript render.
    return (
        f"{header}"
        f"<h3>Meeting notes</h3>"
        f"{transcript_paragraphs}"
        f"<h3>Next steps</h3>"
        f"<p>Move this draft into a project, convert it into tasks, or keep it as meeting context.</p>"
    )


def _structured_summary_html(summary: dict) -> str:
    """Render the LLM's structured notes as Gemini-style HTML. Empty string if nothing usable."""

    def _clean(value) -> str:
        return str(value or "").strip()

    sections: list[str] = []

    overview = _clean(summary.get("summary"))
    summary_sections = summary.get("summary_sections")
    summary_body = f"<p>{escape_text(overview)}</p>" if overview else ""
    if isinstance(summary_sections, list):
        for item in summary_sections:
            if not isinstance(item, dict):
                continue
            heading = _clean(item.get("heading"))
            body = _clean(item.get("body"))
            if not (heading or body):
                continue
            prefix = f"<strong>{escape_text(heading)}</strong> " if heading else ""
            summary_body += f"<p>{prefix}{escape_text(body)}</p>"
    if summary_body:
        sections.append(f"<h3>Summary</h3>{summary_body}")

    decisions = summary.get("decisions")
    if isinstance(decisions, list):
        decision_items = [escape_text(_clean(d)) for d in decisions if _clean(d)]
        if decision_items:
            sections.append(f"<h3>Decisions</h3>{list_html(decision_items)}")

    next_steps = summary.get("next_steps")
    if isinstance(next_steps, list):
        step_items = []
        for step in next_steps:
            if not isinstance(step, dict):
                continue
            owner = _clean(step.get("owner"))
            action = _clean(step.get("action"))
            detail = _clean(step.get("detail"))
            if not action:
                continue
            owner_html = f"<strong>{escape_text(owner)}</strong> — " if owner else ""
            detail_html = f": {escape_text(detail)}" if detail else ""
            step_items.append(f"{owner_html}{escape_text(action)}{detail_html}")
        if step_items:
            sections.append(f"<h3>Next steps</h3>{list_html(step_items)}")

    details = summary.get("details")
    if isinstance(details, list):
        detail_items = []
        for item in details:
            if not isinstance(item, dict):
                continue
            topic = _clean(item.get("topic"))
            body = _clean(item.get("body"))
            if not (topic or body):
                continue
            topic_html = f"<strong>{escape_text(topic)}</strong>: " if topic else ""
            detail_items.append(f"{topic_html}{escape_text(body)}")
        if detail_items:
            sections.append(f"<h3>Details</h3>{list_html(detail_items)}")

    return "".join(sections)


def _transcribe_meeting_audio(*, request, workspace: Workspace) -> tuple[str, str | None]:
    api_key, _, provider = get_llm_config(workspace=workspace)
    if (provider or "").lower() != "openai" or not api_key:
        return "", "Meeting audio transcription requires an OpenAI key in workspace AI settings or instance LLM config."

    client = OpenAI(api_key=api_key)
    model = os.environ.get("LLM_TRANSCRIPTION_MODEL", "gpt-4o-transcribe")
    parts = []
    for field, label in (("system_audio", "Meeting audio"), ("mic_audio", "Microphone")):
        uploaded = request.FILES.get(field)
        if not uploaded:
            continue
        suffix = os.path.splitext(uploaded.name or "")[1] or ".m4a"
        with tempfile.NamedTemporaryFile(suffix=suffix) as temp:
            for chunk in uploaded.chunks():
                temp.write(chunk)
            temp.flush()
            temp.seek(0)
            try:
                result = client.audio.transcriptions.create(
                    model=model,
                    file=temp,
                    prompt="This is a work meeting. Speakers may switch between English and Spanish.",
                )
            except Exception as exc:
                return "", f"Could not transcribe meeting audio: {exc}"
        text = getattr(result, "text", "") or ""
        text = text.strip()
        if text:
            parts.append(f"{label}:\n{text}")
    return "\n\n".join(parts).strip(), None


def _upsert_google_event_for_issue(
    *, account: UserCalendarAccount, issue: Issue, calendar_id: str | None = None
) -> str:
    """Create/update a Google Calendar event for one issue and return event id."""
    calendar_id = calendar_id or account.primary_calendar_id or "primary"
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
        event_id = issue.external_id.rsplit(":", 1)[-1]
        resp = _google_api_request(
            account=account,
            method="PATCH",
            url=_google_calendar_url(calendar_id, f"events/{event_id}"),
            json=payload,
            timeout=10,
        )
        if resp.status_code == 200:
            return event_id

    create_resp = _google_api_request(
        account=account,
        method="POST",
        url=_google_calendar_url(calendar_id, "events"),
        json=payload,
        timeout=10,
    )
    if create_resp.status_code not in (200, 201):
        raise RuntimeError(f"google_event_sync_failed:{create_resp.status_code}")
    event_id = create_resp.json().get("id")
    if not event_id:
        raise RuntimeError("google_event_sync_failed:no_event_id")
    issue.external_source = "google_calendar"
    issue.external_id = f"{account.id}:{calendar_id}:{event_id}"
    issue.save(update_fields=["external_source", "external_id", "updated_at"])
    return event_id


class CalendarSyncTasksToGoogleEndpoint(BaseAPIView):
    """Two-way sync step 1: push DragonFruit tasks to Google Calendar events."""

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug):
        account_id = request.data.get("account_id")
        calendar_id = request.data.get("calendar_id")
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
                _upsert_google_event_for_issue(account=account, issue=issue, calendar_id=calendar_id)
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

        calendar_id = request.data.get("calendar_id") or account.primary_calendar_id or "primary"
        resp = _google_api_request(
            account=account,
            method="GET",
            url=_google_calendar_url(calendar_id, "events"),
            params={
                "timeMin": time_from,
                "timeMax": time_to,
                "singleEvents": "true",
                "orderBy": "startTime",
                "maxResults": 250,
            },
            timeout=10,
        )
        if resp.status_code != 200:
            return Response(
                {
                    "error": "Failed to fetch events",
                    "status": resp.status_code,
                    "details": _details_from_response(resp),
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

        default_state = (
            State.objects.filter(project=project, default=True).first()
            or State.objects.filter(project=project).order_by("sequence").first()
        )
        imported = 0
        skipped = 0
        failed: list[dict] = []
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
            try:
                issue, created = Issue.issue_objects.update_or_create(
                    workspace=project.workspace,
                    project=project,
                    external_source="google_calendar",
                    external_id=f"{account.id}:{calendar_id}:{event_id}",
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
            except Exception as exc:  # noqa: BLE001
                failed.append({"event_id": event_id, "reason": str(exc)[:200]})

        return Response({"imported": imported, "skipped": skipped, "failed": failed}, status=status.HTTP_200_OK)


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
    attendees = e.get("attendees") or []
    meeting_link = e.get("hangoutLink", "")
    if not meeting_link:
        entry_points = (e.get("conferenceData") or {}).get("entryPoints") or []
        meeting_link = next(
            (entry.get("uri", "") for entry in entry_points if entry.get("entryPointType") == "video"),
            "",
        )
    return {
        "id": e.get("id"),
        "title": e.get("summary") or "(no title)",
        "description": e.get("description", ""),
        "location": e.get("location", ""),
        "start": start.get("dateTime") or start.get("date"),
        "end": end.get("dateTime") or end.get("date"),
        "all_day": is_all_day,
        "html_link": e.get("htmlLink", ""),
        "hangout_link": meeting_link,
        "status": e.get("status", ""),
        "attendee_count": len(attendees),
        "has_other_attendees": any(not a.get("self") for a in attendees),
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
            # Google Calendar events are already overlaid live on the calendar, so
            # imported copies (external_source="google_calendar") would be stale
            # duplicates that linger after the source event is deleted. Keep them
            # out of the task layer.
            .exclude(external_source="google_calendar")
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
