# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Google Calendar OAuth / token / credential helpers.

Extracted from calendar/base.py so that the OAuth credential resolution,
token exchange, token refresh, and raw Google API request logic live in one
place separate from the endpoint classes.

Note: _client_credential_candidates, _token_exchange_candidates,
_refresh_if_needed, and _google_api_request remain in base.py because
the test suite monkeypatches them (and requests.*) through the base module
namespace; moving them here would silently break those patches.
"""

import os
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import requests
from django.conf import settings

from plane.db.models import UserCalendarAccount
from plane.license.utils.instance_value import get_configuration_value
from plane.license.utils.encryption import encrypt_data


GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_CAL_API = "https://www.googleapis.com/calendar/v3"
SCOPES = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
    "openid",
    "email",
]


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


def _unique_credential_pairs(pairs: list[tuple[str, str]]) -> list[tuple[str, str]]:
    seen: set[tuple[str, str]] = set()
    unique: list[tuple[str, str]] = []
    for client_id, client_secret in pairs:
        if not client_id or not client_secret:
            continue
        key = (client_id, client_secret)
        if key in seen:
            continue
        seen.add(key)
        unique.append(key)
    return unique


def _web_credential_candidates() -> list[tuple[str, str]]:
    primary = _calendar_web_credentials()

    env_calendar = (
        _first_config_value(["GOOGLE_CALENDAR_CLIENT_ID"], prefer_env=True),
        _first_config_value(["GOOGLE_CALENDAR_CLIENT_SECRET"], prefer_env=True),
    )
    env_google = (
        _first_config_value(["GOOGLE_CLIENT_ID"], prefer_env=True),
        _first_config_value(["GOOGLE_CLIENT_SECRET"], prefer_env=True),
    )
    configured_calendar = (
        _first_config_value(["GOOGLE_CALENDAR_CLIENT_ID"]),
        _first_config_value(["GOOGLE_CALENDAR_CLIENT_SECRET"]),
    )
    configured_google = (
        _first_config_value(["GOOGLE_CLIENT_ID"]),
        _first_config_value(["GOOGLE_CLIENT_SECRET"]),
    )

    return _unique_credential_pairs(
        [
            primary,
            env_calendar,
            env_google,
            configured_calendar,
            configured_google,
        ]
    )


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


def _client_credential_candidates(client: str | None) -> list[tuple[str, str]]:
    if _normalize_client(client) == "web":
        return _web_credential_candidates()
    return _unique_credential_pairs([_client_credentials(client)])


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


def _upsert_calendar_account(
    *,
    user,
    account_email: str,
    access_token: str,
    refresh_token: str,
    expires_in: int,
    primary_calendar_id: str,
    scope: str,
) -> UserCalendarAccount:
    account = UserCalendarAccount.objects.filter(
        user=user,
        provider=UserCalendarAccount.PROVIDER_GOOGLE,
        account_email=account_email,
    ).first()

    if account is None:
        account = UserCalendarAccount.all_objects.filter(
            user=user,
            provider=UserCalendarAccount.PROVIDER_GOOGLE,
            account_email=account_email,
        ).first()

    if account is None:
        account = UserCalendarAccount(
            user=user,
            provider=UserCalendarAccount.PROVIDER_GOOGLE,
            account_email=account_email,
        )

    account.access_token_encrypted = encrypt_data(access_token)
    if refresh_token:
        account.refresh_token_encrypted = encrypt_data(refresh_token)
    account.token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in) if expires_in else None
    account.primary_calendar_id = primary_calendar_id
    account.scopes = scope
    account.is_active = True
    account.deleted_at = None
    account.save()
    return account


def _google_calendar_url(calendar_id: str, suffix: str = "") -> str:
    encoded_calendar_id = quote(calendar_id or "primary", safe="")
    suffix = suffix.strip("/")
    if suffix:
        return f"{GOOGLE_CAL_API}/calendars/{encoded_calendar_id}/{suffix}"
    return f"{GOOGLE_CAL_API}/calendars/{encoded_calendar_id}"
