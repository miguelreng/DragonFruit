# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only

import pytest
from rest_framework import status

from plane.app.views.agent.chat import _project_source_context
from plane.db.models import Project, ProjectContextSource, ProjectMember, ProjectSourceFile, ProjectSourceRevision


@pytest.mark.contract
class TestProjectContextSourcesAPI:
    @pytest.fixture
    def project(self, workspace, create_user):
        project = Project.objects.create(name="Context Project", identifier="CTX", workspace=workspace)
        ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
        return project

    def _sources_url(self, workspace, project):
        return f"/api/workspaces/{workspace.slug}/projects/{project.id}/context-sources/"

    @pytest.mark.django_db
    def test_manual_source_is_bounded_and_builds_selected_context_pack(self, session_client, workspace, project):
        create = session_client.post(
            self._sources_url(workspace, project),
            {
                "provider": "manual",
                "root_external_id": "dragonfruit-folder",
                "display_name": "DragonFruit folder",
                "selection_config": {"included_paths": ["AGENTS.md"]},
            },
            format="json",
        )

        assert create.status_code == status.HTTP_201_CREATED
        source_id = create.data["id"]
        ingest_url = f"{self._sources_url(workspace, project)}{source_id}/manual-ingest/"
        ingest = session_client.post(
            ingest_url,
            {
                "external_id": "drive-agent-instructions",
                "relative_path": "AGENTS.md",
                "mime_type": "text/markdown",
                "provider_revision": "v1",
                "text": "Use the Solar icon set and run focused tests.",
            },
            format="json",
        )

        assert ingest.status_code == status.HTTP_201_CREATED
        assert ingest.data["file"]["is_eligible"] is True
        assert ingest.data["revision_id"]
        source = ProjectContextSource.objects.get(pk=source_id)
        assert source.status == ProjectContextSource.STATUS_ACTIVE
        assert source.last_refreshed_at is not None

        pack = session_client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/context-pack/")
        assert pack.status_code == status.HTTP_200_OK
        assert pack.data["used_characters"] > 0
        assert len(pack.data["sections"]) == 1
        assert pack.data["sections"][0]["path"] == "AGENTS.md"
        assert pack.data["sections"][0]["content"] == "Use the Solar icon set and run focused tests."
        assert pack.data["sections"][0]["content_hash"]
        assert "--- AGENTS.md" in _project_source_context(project)
        assert "Use the Solar icon set and run focused tests." in _project_source_context(project)

    @pytest.mark.django_db
    def test_sensitive_paths_are_recorded_without_retaining_a_revision(self, session_client, workspace, project):
        source = ProjectContextSource.objects.create(
            workspace=workspace,
            project=project,
            provider=ProjectContextSource.PROVIDER_MANUAL,
            root_external_id="manual-root",
            display_name="Manual context",
        )

        response = session_client.post(
            f"{self._sources_url(workspace, project)}{source.id}/manual-ingest/",
            {
                "external_id": "env-file",
                "relative_path": ".env.production",
                "mime_type": "text/plain",
                "text": "OPENAI_API_KEY=not-stored",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["revision_id"] is None
        source_file = ProjectSourceFile.objects.get(source=source, external_id="env-file")
        assert source_file.is_eligible is False
        assert source_file.exclusion_reason == "sensitive_filename"
        assert ProjectSourceRevision.objects.filter(source_file=source_file).exists() is False

    @pytest.mark.django_db
    def test_source_rejects_path_traversal_and_does_not_expand_selection(self, session_client, workspace, project):
        response = session_client.post(
            self._sources_url(workspace, project),
            {
                "provider": "manual",
                "root_external_id": "manual-root",
                "display_name": "Manual context",
                "selection_config": {"included_paths": ["../../.env"]},
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert ProjectContextSource.objects.filter(project=project).exists() is False

    @pytest.mark.django_db
    def test_google_drive_source_cannot_receive_untrusted_direct_file_content(self, session_client, workspace, project):
        source = ProjectContextSource.objects.create(
            workspace=workspace,
            project=project,
            provider=ProjectContextSource.PROVIDER_GOOGLE_DRIVE,
            root_external_id="drive-folder-id",
            display_name="Drive folder",
        )

        response = session_client.post(
            f"{self._sources_url(workspace, project)}{source.id}/manual-ingest/",
            {
                "external_id": "readme",
                "relative_path": "README.md",
                "text": "Must be rejected for a Drive source.",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert ProjectSourceFile.objects.filter(source=source).exists() is False

    @pytest.mark.django_db
    def test_source_file_list_never_returns_file_bodies(self, session_client, workspace, project):
        source = ProjectContextSource.objects.create(
            workspace=workspace,
            project=project,
            provider=ProjectContextSource.PROVIDER_MANUAL,
            root_external_id="manual-root",
            display_name="Manual context",
        )
        session_client.post(
            f"{self._sources_url(workspace, project)}{source.id}/manual-ingest/",
            {
                "external_id": "readme",
                "relative_path": "README.md",
                "text": "Private source text should be available only in a bounded context pack.",
            },
            format="json",
        )

        response = session_client.get(f"{self._sources_url(workspace, project)}{source.id}/files/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data[0]["relative_path"] == "README.md"
        assert "extracted_text" not in response.data[0]["latest_revision"]
