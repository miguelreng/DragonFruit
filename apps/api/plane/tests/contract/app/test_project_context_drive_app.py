# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only

from urllib.parse import parse_qs, urlparse

import pytest
from rest_framework import status

from plane.db.models import (
    Project,
    ProjectContextConnection,
    ProjectContextSource,
    ProjectMember,
    ProjectSourceFile,
    ProjectSourceRevision,
)
from plane.license.utils.encryption import decrypt_data, encrypt_data
from plane.project_context_google_drive import (
    build_authorize_url,
    refresh_google_drive_source,
    validate_google_drive_state,
)


class FakeGoogleResponse:
    def __init__(self, status_code=200, payload=None, content=b""):
        self.status_code = status_code
        self._payload = payload or {}
        self.content = content
        self.text = str(self._payload)

    def json(self):
        return self._payload


@pytest.mark.contract
class TestProjectContextGoogleDriveAPI:
    @pytest.fixture
    def project(self, workspace, create_user):
        project = Project.objects.create(name="Context Drive", identifier="DRV", workspace=workspace)
        ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
        return project

    def _source_url(self, workspace, project):
        return f"/api/workspaces/{workspace.slug}/projects/{project.id}/context-sources/"

    @pytest.mark.django_db
    def test_start_uses_signed_state_and_read_only_scope(
        self, session_client, workspace, project, create_user, monkeypatch
    ):
        monkeypatch.setattr("plane.project_context_google_drive._credentials", lambda: ("drive-client", "drive-secret"))
        response = session_client.get(f"{self._source_url(workspace, project)}google/start/")

        assert response.status_code == status.HTTP_200_OK
        query = parse_qs(urlparse(response.data["authorize_url"]).query)
        assert query["scope"] == ["https://www.googleapis.com/auth/drive.readonly openid email"]
        state = validate_google_drive_state(query["state"][0], user_id=str(create_user.id))
        assert state["project_id"] == str(project.id)
        assert state["workspace_id"] == str(workspace.id)

    @pytest.mark.django_db
    def test_callback_encrypts_tokens_and_returns_no_secret(
        self, session_client, workspace, project, create_user, monkeypatch
    ):
        monkeypatch.setattr("plane.project_context_google_drive._credentials", lambda: ("drive-client", "drive-secret"))
        authorize_url = build_authorize_url(
            user_id=str(create_user.id),
            workspace_id=str(workspace.id),
            workspace_slug=workspace.slug,
            project_id=str(project.id),
        )
        state = parse_qs(urlparse(authorize_url).query)["state"][0]

        monkeypatch.setattr(
            "plane.project_context_google_drive.requests.post",
            lambda *args, **kwargs: FakeGoogleResponse(
                payload={
                    "access_token": "drive-access",
                    "refresh_token": "drive-refresh",
                    "expires_in": 3600,
                    "scope": "drive.readonly",
                }
            ),
        )
        monkeypatch.setattr(
            "plane.project_context_google_drive.requests.get",
            lambda *args, **kwargs: FakeGoogleResponse(payload={"email": "person@example.com"}),
        )

        response = session_client.post(
            "/api/users/me/project-context-connections/google/callback/",
            {"code": "authorization-code", "state": state},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert "access_token" not in str(response.data)
        connection = ProjectContextConnection.objects.get(pk=response.data["connection"]["id"])
        assert decrypt_data(connection.access_token_encrypted) == "drive-access"
        assert decrypt_data(connection.refresh_token_encrypted) == "drive-refresh"

    @pytest.mark.django_db
    def test_refresh_only_reads_descendants_and_never_retains_sensitive_file_bodies(
        self, workspace, create_user, project, monkeypatch
    ):
        connection = ProjectContextConnection.objects.create(
            workspace=workspace,
            user=create_user,
            provider=ProjectContextConnection.PROVIDER_GOOGLE_DRIVE,
            account_email="person@example.com",
            access_token_encrypted=encrypt_data("valid-access"),
            refresh_token_encrypted=encrypt_data("valid-refresh"),
        )
        source = ProjectContextSource.objects.create(
            workspace=workspace,
            project=project,
            connection=connection,
            provider=ProjectContextSource.PROVIDER_GOOGLE_DRIVE,
            root_external_id="selected-folder",
            display_name="Shared project folder",
            selection_config={"included_paths": ["README.md", "docs/notes.txt"]},
        )

        def fake_get(url, params=None, **kwargs):
            if url.endswith("/files"):
                query = (params or {}).get("q", "")
                if "selected-folder" in query:
                    return FakeGoogleResponse(
                        payload={
                            "files": [
                                {"id": "nested", "name": "docs", "mimeType": "application/vnd.google-apps.folder"},
                                {
                                    "id": "readme",
                                    "name": "README.md",
                                    "mimeType": "text/markdown",
                                    "version": "1",
                                    "size": "12",
                                },
                                {"id": "env", "name": ".env", "mimeType": "text/plain", "version": "1", "size": "30"},
                            ]
                        }
                    )
                if "nested" in query:
                    return FakeGoogleResponse(
                        payload={
                            "files": [
                                {
                                    "id": "notes",
                                    "name": "notes.txt",
                                    "mimeType": "text/plain",
                                    "version": "2",
                                    "size": "8",
                                }
                            ]
                        }
                    )
            if url.endswith("/files/readme"):
                return FakeGoogleResponse(content=b"# Context\n")
            if url.endswith("/files/notes"):
                return FakeGoogleResponse(content=b"Decision")
            raise AssertionError(f"Unexpected Google request: {url} {params}")

        monkeypatch.setattr("plane.project_context_google_drive.requests.get", fake_get)
        result = refresh_google_drive_source(source=source)

        assert result == {"files_discovered": 3, "eligible_files": 2, "limited": False}
        assert ProjectSourceRevision.objects.filter(source_file__source=source).count() == 2
        env_file = ProjectSourceFile.objects.get(source=source, external_id="env")
        assert env_file.is_eligible is False
        assert env_file.exclusion_reason == "sensitive_filename"
        assert ProjectSourceRevision.objects.filter(source_file=env_file).exists() is False
