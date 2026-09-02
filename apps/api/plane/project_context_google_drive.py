# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only

"""Google Drive adapter for bounded project context sources.

This module is deliberately the only place that talks to Google Drive.  It
keeps OAuth credentials encrypted, accepts one selected folder as the read
boundary, and refuses to retain a body until the generic source classifier has
approved its relative path.
"""

from __future__ import annotations

import os
from collections import deque
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import requests
from django.conf import settings
from django.core import signing
from django.db import transaction
from django.utils import timezone as django_timezone

from plane.db.models import ProjectContextConnection, ProjectContextSource, ProjectSourceFile
from plane.license.utils.encryption import decrypt_data, encrypt_data
from plane.license.utils.instance_value import get_configuration_value
from plane.project_context_sources import (
    ProjectSourceValidationError,
    classify_source_path,
    upsert_project_source_revision,
)


GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
GOOGLE_DRIVE_API = "https://www.googleapis.com/drive/v3"
GOOGLE_FOLDER_MIME = "application/vnd.google-apps.folder"
GOOGLE_DOCUMENT_MIME = "application/vnd.google-apps.document"
GOOGLE_DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.readonly", "openid", "email"]

OAUTH_STATE_SALT = "project-context-google-drive"
OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60
MAX_DRIVE_FILES_PER_REFRESH = 200
MAX_DRIVE_FOLDER_DEPTH = 10
MAX_DRIVE_FILE_BYTES = 2 * 1024 * 1024


class GoogleDriveError(ValueError):
    """Expected provider/configuration error safe to return to an API caller."""


def _first_config_value(keys: list[str], default: str = "") -> str:
    values = get_configuration_value([{"key": key, "default": os.environ.get(key, "")} for key in keys])
    for value in values:
        if value:
            return str(value)
    for key in keys:
        if os.environ.get(key):
            return str(os.environ[key])
    return default


def _credentials() -> tuple[str, str]:
    return (
        _first_config_value(["GOOGLE_DRIVE_CLIENT_ID", "GOOGLE_CLIENT_ID"]),
        _first_config_value(["GOOGLE_DRIVE_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET"]),
    )


def redirect_uri() -> str:
    app_base_url = (
        getattr(settings, "APP_BASE_URL", None) or getattr(settings, "WEB_URL", "http://localhost:3000")
    ).rstrip("/")
    return _first_config_value(["GOOGLE_DRIVE_REDIRECT_URI"], f"{app_base_url}/context-sources/google/callback")


def build_authorize_url(*, user_id: str, workspace_id: str, workspace_slug: str, project_id: str) -> str:
    client_id, _ = _credentials()
    if not client_id:
        raise GoogleDriveError("Google Drive OAuth is not configured on this instance.")
    state = signing.dumps(
        {
            "user_id": str(user_id),
            "workspace_id": str(workspace_id),
            "workspace_slug": workspace_slug,
            "project_id": str(project_id),
        },
        salt=OAUTH_STATE_SALT,
        compress=True,
    )
    return f"{GOOGLE_AUTHORIZE_URL}?{
        urlencode(
            {
                'client_id': client_id,
                'redirect_uri': redirect_uri(),
                'response_type': 'code',
                'scope': ' '.join(GOOGLE_DRIVE_SCOPES),
                'access_type': 'offline',
                'prompt': 'consent select_account',
                'include_granted_scopes': 'true',
                'state': state,
            }
        )
    }"


def validate_google_drive_state(state: str, *, user_id: str) -> dict:
    try:
        payload = signing.loads(state, salt=OAUTH_STATE_SALT, max_age=OAUTH_STATE_MAX_AGE_SECONDS)
    except signing.BadSignature as exc:
        raise GoogleDriveError("Google Drive authorization state is invalid or expired.") from exc
    if not isinstance(payload, dict) or payload.get("user_id") != str(user_id):
        raise GoogleDriveError("Google Drive authorization belongs to a different user.")
    required = ("workspace_id", "workspace_slug", "project_id")
    if any(not payload.get(key) for key in required):
        raise GoogleDriveError("Google Drive authorization state is incomplete.")
    return payload


def _response_details(response: requests.Response) -> str:
    try:
        payload = response.json()
        if isinstance(payload, dict):
            return str(payload.get("error_description") or payload.get("error") or payload)[:300]
    except ValueError:
        pass
    return str(getattr(response, "text", ""))[:300]


def complete_google_drive_oauth(*, user, code: str, state: str) -> tuple[ProjectContextConnection, dict]:
    if not code:
        raise GoogleDriveError("code is required")
    payload = validate_google_drive_state(state, user_id=str(user.id))
    client_id, client_secret = _credentials()
    if not client_id or not client_secret:
        raise GoogleDriveError("Google Drive OAuth is not configured on this instance.")
    token_response = requests.post(
        GOOGLE_TOKEN_URL,
        data={
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri(),
            "grant_type": "authorization_code",
        },
        timeout=10,
    )
    if token_response.status_code != 200:
        raise GoogleDriveError(f"Google token exchange failed: {_response_details(token_response)}")
    token_data = token_response.json()
    access_token = str(token_data.get("access_token") or "")
    if not access_token:
        raise GoogleDriveError("Google did not return an access token.")

    profile_response = requests.get(
        GOOGLE_USERINFO_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=10,
    )
    profile = profile_response.json() if profile_response.status_code == 200 else {}
    account_email = str(profile.get("email") or "").strip().lower()
    expires_in = int(token_data.get("expires_in") or 0)
    now = datetime.now(timezone.utc)

    with transaction.atomic():
        connection = ProjectContextConnection.objects.filter(
            workspace_id=payload["workspace_id"],
            user=user,
            provider=ProjectContextConnection.PROVIDER_GOOGLE_DRIVE,
            account_email=account_email,
        ).first()
        if connection is None:
            connection = ProjectContextConnection(
                workspace_id=payload["workspace_id"],
                user=user,
                provider=ProjectContextConnection.PROVIDER_GOOGLE_DRIVE,
                account_email=account_email,
            )
        connection.access_token_encrypted = encrypt_data(access_token)
        if token_data.get("refresh_token"):
            connection.refresh_token_encrypted = encrypt_data(str(token_data["refresh_token"]))
        connection.token_expires_at = now + timedelta(seconds=expires_in) if expires_in else None
        connection.scopes = str(token_data.get("scope") or "")
        connection.is_active = True
        connection.deleted_at = None
        connection.save()
    return connection, payload


def serialize_connection(connection: ProjectContextConnection) -> dict:
    return {
        "id": str(connection.id),
        "provider": connection.provider,
        "account_email": connection.account_email,
        "is_active": connection.is_active,
        "scopes": connection.scopes,
    }


def _access_token(connection: ProjectContextConnection, *, force_refresh: bool = False) -> str:
    access_token = decrypt_data(connection.access_token_encrypted) or ""
    expires_at = connection.token_expires_at
    now = datetime.now(timezone.utc)
    if not force_refresh and access_token and (not expires_at or expires_at > now + timedelta(seconds=30)):
        return access_token
    refresh_token = decrypt_data(connection.refresh_token_encrypted) or ""
    client_id, client_secret = _credentials()
    if not refresh_token or not client_id or not client_secret:
        raise GoogleDriveError("Google Drive needs to be reconnected.")
    response = requests.post(
        GOOGLE_TOKEN_URL,
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
        timeout=10,
    )
    if response.status_code != 200:
        connection.is_active = False
        connection.save(update_fields=["is_active", "updated_at"])
        raise GoogleDriveError("Google Drive needs to be reconnected.")
    data = response.json()
    fresh_token = str(data.get("access_token") or "")
    if not fresh_token:
        raise GoogleDriveError("Google Drive did not return a refreshed access token.")
    connection.access_token_encrypted = encrypt_data(fresh_token)
    connection.token_expires_at = now + timedelta(seconds=int(data.get("expires_in") or 3600))
    update_fields = ["access_token_encrypted", "token_expires_at", "updated_at"]
    if data.get("refresh_token"):
        connection.refresh_token_encrypted = encrypt_data(str(data["refresh_token"]))
        update_fields.append("refresh_token_encrypted")
    connection.save(update_fields=update_fields)
    return fresh_token


def _drive_get(
    connection: ProjectContextConnection, path: str, *, params: dict | None = None, stream: bool = False
) -> requests.Response:
    token = _access_token(connection)
    response = requests.get(
        f"{GOOGLE_DRIVE_API}/{path.lstrip('/')}",
        params=params,
        headers={"Authorization": f"Bearer {token}"},
        timeout=20,
        stream=stream,
    )
    if response.status_code == 401:
        token = _access_token(connection, force_refresh=True)
        response = requests.get(
            f"{GOOGLE_DRIVE_API}/{path.lstrip('/')}",
            params=params,
            headers={"Authorization": f"Bearer {token}"},
            timeout=20,
            stream=stream,
        )
    return response


def list_drive_folders(*, connection: ProjectContextConnection, parent_id: str = "root") -> list[dict]:
    if not connection.is_active:
        raise GoogleDriveError("Google Drive needs to be reconnected.")
    parent = "root" if not parent_id or parent_id == "root" else str(parent_id)[:255]
    response = _drive_get(
        connection,
        "files",
        params={
            "q": f"'{parent}' in parents and mimeType = '{GOOGLE_FOLDER_MIME}' and trashed = false",
            "pageSize": 100,
            "orderBy": "name_natural",
            "fields": "files(id,name,modifiedTime)",
            "supportsAllDrives": "true",
            "includeItemsFromAllDrives": "true",
        },
    )
    if response.status_code != 200:
        raise GoogleDriveError(f"Could not list Google Drive folders: {_response_details(response)}")
    return [
        {"id": item["id"], "name": item.get("name") or "Untitled folder", "modified_time": item.get("modifiedTime")}
        for item in response.json().get("files", [])
        if item.get("id")
    ]


def _relative_file_path(path_prefix: str, file_name: str, mime_type: str) -> str:
    name = str(file_name or "Untitled").replace("/", "-").strip() or "Untitled"
    if mime_type == GOOGLE_DOCUMENT_MIME and "." not in name:
        name = f"{name}.txt"
    return f"{path_prefix}/{name}".strip("/")


def _download_text(connection: ProjectContextConnection, file_data: dict) -> str:
    file_id = str(file_data["id"])
    mime_type = str(file_data.get("mimeType") or "")
    if mime_type == GOOGLE_DOCUMENT_MIME:
        response = _drive_get(connection, f"files/{file_id}/export", params={"mimeType": "text/plain"})
    else:
        response = _drive_get(connection, f"files/{file_id}", params={"alt": "media"})
    if response.status_code != 200:
        raise GoogleDriveError(f"Could not download Google Drive file: {_response_details(response)}")
    raw = response.content
    if len(raw) > MAX_DRIVE_FILE_BYTES:
        raise GoogleDriveError("Google Drive file exceeds the 2 MB context-source limit.")
    return raw.decode("utf-8", errors="replace")


def refresh_google_drive_source(*, source: ProjectContextSource) -> dict:
    """Synchronously refresh a bounded Drive tree. Suitable for a small V1 source.

    The hard file/depth/byte caps make this predictable for a foreground
    refresh. A later background worker can reuse this adapter unchanged.
    """
    if source.provider != ProjectContextSource.PROVIDER_GOOGLE_DRIVE or not source.connection_id:
        raise ProjectSourceValidationError("Google Drive source has no connection")
    connection = source.connection
    if connection is None or not connection.is_active:
        raise GoogleDriveError("Google Drive needs to be reconnected.")

    queue: deque[tuple[str, str, int]] = deque([(source.root_external_id, "", 0)])
    discovered_files: list[tuple[dict, str]] = []
    while queue and len(discovered_files) < MAX_DRIVE_FILES_PER_REFRESH:
        parent_id, prefix, depth = queue.popleft()
        response = _drive_get(
            connection,
            "files",
            params={
                "q": f"'{parent_id}' in parents and trashed = false",
                "pageSize": 100,
                "orderBy": "folder,name_natural",
                "fields": "files(id,name,mimeType,modifiedTime,version,size,md5Checksum)",
                "supportsAllDrives": "true",
                "includeItemsFromAllDrives": "true",
            },
        )
        if response.status_code != 200:
            raise GoogleDriveError(f"Could not list Google Drive files: {_response_details(response)}")
        for item in response.json().get("files", []):
            if not item.get("id"):
                continue
            mime_type = str(item.get("mimeType") or "")
            if mime_type == GOOGLE_FOLDER_MIME:
                if depth < MAX_DRIVE_FOLDER_DEPTH:
                    queue.append(
                        (str(item["id"]), _relative_file_path(prefix, str(item.get("name") or ""), ""), depth + 1)
                    )
                continue
            discovered_files.append((item, _relative_file_path(prefix, str(item.get("name") or ""), mime_type)))
            if len(discovered_files) >= MAX_DRIVE_FILES_PER_REFRESH:
                break

    seen_ids: list[str] = []
    eligible_files = 0
    for item, relative_path in discovered_files:
        external_id = str(item["id"])
        seen_ids.append(external_id)
        mime_type = str(item.get("mimeType") or "")
        safe_size = int(item.get("size") or 0)
        eligibility = classify_source_path(relative_path, mime_type)
        if not eligibility.is_eligible:
            upsert_project_source_revision(
                source=source,
                external_id=external_id,
                relative_path=relative_path,
                text="",
                mime_type=mime_type,
                provider_revision=str(item.get("version") or item.get("modifiedTime") or ""),
                size_bytes=safe_size,
            )
            continue
        try:
            text = _download_text(connection, item)
        except GoogleDriveError:
            # One file failure is metadata-only, not a reason to discard a
            # complete source. The next refresh can retry it.
            ProjectSourceFile.objects.filter(source=source, external_id=external_id).update(
                is_eligible=False, exclusion_reason="download_failed"
            )
            continue
        upsert_project_source_revision(
            source=source,
            external_id=external_id,
            relative_path=relative_path,
            text=text,
            mime_type=mime_type,
            provider_revision=str(item.get("version") or item.get("modifiedTime") or ""),
            size_bytes=safe_size,
        )
        eligible_files += 1

    ProjectSourceFile.objects.filter(source=source, deleted_at__isnull=True).exclude(external_id__in=seen_ids).update(
        deleted_at=django_timezone.now()
    )
    ProjectContextSource.objects.filter(pk=source.pk).update(
        status=ProjectContextSource.STATUS_ACTIVE,
        last_refreshed_at=django_timezone.now(),
        last_error_code="source_limit_reached" if len(discovered_files) >= MAX_DRIVE_FILES_PER_REFRESH else "",
    )
    return {
        "files_discovered": len(discovered_files),
        "eligible_files": eligible_files,
        "limited": len(discovered_files) >= MAX_DRIVE_FILES_PER_REFRESH,
    }
