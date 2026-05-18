# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Google Calendar connection + read-only events fetch.

Flow:
  1. Frontend calls GET /api/users/me/calendar-accounts/google/start/
     -> server returns { authorize_url } using its registered Google
        OAuth client + the calendar.readonly scope.
  2. User completes Google consent, Google redirects to the server's
     callback URL with ?code=.
  3. Server exchanges the code for tokens, hits the Calendar API once
     to learn the user's primary calendar id + email, stores tokens
     Fernet-encrypted.
  4. Frontend fetches events for a date range via
     GET /api/users/me/calendar-accounts/<id>/events/?from=&to=.

Read-only by design (no calendar.events write scope). v1.
"""

from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import requests
from django.conf import settings
from django.shortcuts import redirect
from rest_framework import status
from rest_framework.response import Response

from plane.db.models import UserCalendarAccount
from plane.license.utils.encryption import decrypt_data, encrypt_data

from ..base import BaseAPIView


GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_CAL_API = "https://www.googleapis.com/calendar/v3"
SCOPES = ["https://www.googleapis.com/auth/calendar.readonly", "openid", "email"]


def _client_credentials() -> tuple[str, str, str]:
    """Read Google credentials from Django settings.

    We reuse the existing Plane Google OAuth client (already plumbed for
    `IS_GOOGLE_ENABLED`); admins just need to add the `calendar.readonly`
    scope in Google Cloud and add a redirect URI for this view.
    """
    client_id = getattr(settings, "GOOGLE_CALENDAR_CLIENT_ID", None) or getattr(settings, "GOOGLE_CLIENT_ID", None) or ""
    client_secret = (
        getattr(settings, "GOOGLE_CALENDAR_CLIENT_SECRET", None)
        or getattr(settings, "GOOGLE_CLIENT_SECRET", None)
        or ""
    )
    redirect_uri = (
        getattr(settings, "GOOGLE_CALENDAR_REDIRECT_URI", None)
        or f"{getattr(settings, 'WEB_URL', 'http://localhost:3000').rstrip('/')}/calendar/oauth/callback"
    )
    return client_id, client_secret, redirect_uri


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
        client_id, _, redirect_uri = _client_credentials()
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
            "state": str(request.user.id),
        }
        return Response(
            {"authorize_url": f"{GOOGLE_AUTHORIZE_URL}?{urlencode(params)}"},
            status=status.HTTP_200_OK,
        )


class GoogleCalendarCallbackEndpoint(BaseAPIView):
    """Exchange the authorization code for tokens and persist the account."""

    def post(self, request):
        code = request.data.get("code")
        if not code:
            return Response({"error": "code is required"}, status=status.HTTP_400_BAD_REQUEST)

        client_id, client_secret, redirect_uri = _client_credentials()
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
            return Response(
                {"error": "Token exchange failed", "details": token_resp.text[:500]},
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

        account, _ = UserCalendarAccount.objects.update_or_create(
            user=request.user,
            provider=UserCalendarAccount.PROVIDER_GOOGLE,
            account_email=account_email,
            defaults={
                "access_token_encrypted": encrypt_data(access_token or ""),
                "refresh_token_encrypted": encrypt_data(refresh_token or ""),
                "token_expires_at": datetime.now(timezone.utc) + timedelta(seconds=expires_in) if expires_in else None,
                "primary_calendar_id": primary_calendar_id,
                "scopes": scope,
                "is_active": True,
            },
        )

        return Response(_serialize(account), status=status.HTTP_200_OK)


def _refresh_if_needed(account: UserCalendarAccount) -> str:
    """Return a fresh access token, refreshing via Google if expired."""
    access_token = decrypt_data(account.access_token_encrypted)
    expires_at = account.token_expires_at
    now = datetime.now(timezone.utc)
    if expires_at and now < expires_at - timedelta(seconds=30) and access_token:
        return access_token

    refresh_token = decrypt_data(account.refresh_token_encrypted)
    if not refresh_token:
        return access_token  # best-effort; caller will get 401 and surface it

    client_id, client_secret, _ = _client_credentials()
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
                {"error": "Failed to fetch events", "status": resp.status_code, "details": resp.text[:500]},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        data = resp.json()
        events = [_event_to_dict(e) for e in data.get("items", [])]
        return Response({"events": events}, status=status.HTTP_200_OK)


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
