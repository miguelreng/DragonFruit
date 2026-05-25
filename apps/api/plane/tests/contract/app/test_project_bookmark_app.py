# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from django.db import DatabaseError
from rest_framework import status

from plane.app.serializers import ProjectBookmarkSerializer
from plane.db.models import Project, ProjectBookmark, ProjectMember


@pytest.mark.contract
class TestProjectBookmarkAPI:
    @pytest.mark.django_db
    def test_project_bookmark_crud_and_workspace_rollup(self, session_client, workspace, create_user):
        project = Project.objects.create(name="Research", identifier="RES", workspace=workspace, created_by=create_user)
        ProjectMember.objects.create(project=project, workspace=workspace, member=create_user, role=20)

        url = f"/api/workspaces/{workspace.slug}/projects/{project.id}/bookmarks/"
        create_response = session_client.post(
            url,
            {
                "title": "Design reference",
                "url": "example.com/reference",
                "description": "Useful layout pattern",
                "tags": ["design", "research"],
                "metadata": {"site_name": "Example"},
            },
            format="json",
        )

        assert create_response.status_code == status.HTTP_201_CREATED
        assert create_response.data["url"] == "https://example.com/reference"
        bookmark_id = create_response.data["id"]

        list_response = session_client.get(url)
        assert list_response.status_code == status.HTTP_200_OK
        assert list_response.data["results"][0]["id"] == bookmark_id

        rollup_response = session_client.get(f"/api/workspaces/{workspace.slug}/bookmarks/")
        assert rollup_response.status_code == status.HTTP_200_OK
        assert rollup_response.data["results"][0]["project_name"] == "Research"

        patch_response = session_client.patch(
            f"{url}{bookmark_id}/",
            {"title": "Updated reference", "tags": ["design"]},
            format="json",
        )
        assert patch_response.status_code == status.HTTP_200_OK
        assert patch_response.data["title"] == "Updated reference"

        delete_response = session_client.delete(f"{url}{bookmark_id}/")
        assert delete_response.status_code == status.HTTP_204_NO_CONTENT
        assert ProjectBookmark.objects.filter(id=bookmark_id).exists() is False

    @pytest.mark.django_db
    def test_project_bookmark_requires_url_or_entity(self, session_client, workspace, create_user):
        project = Project.objects.create(name="Research", identifier="RES", workspace=workspace, created_by=create_user)
        ProjectMember.objects.create(project=project, workspace=workspace, member=create_user, role=20)

        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/bookmarks/",
            {"title": "Broken bookmark"},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_project_bookmark_create_handles_missing_project(self, session_client, workspace):
        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/projects/00000000-0000-0000-0000-000000000000/bookmarks/",
            {"title": "Design reference", "url": "https://example.com/reference"},
            format="json",
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    @pytest.mark.django_db
    def test_project_bookmark_create_handles_storage_errors(self, monkeypatch, session_client, workspace, create_user):
        project = Project.objects.create(name="Research", identifier="RES", workspace=workspace, created_by=create_user)
        ProjectMember.objects.create(project=project, workspace=workspace, member=create_user, role=20)

        def raise_database_error(*args, **kwargs):
            raise DatabaseError("project_bookmarks is unavailable")

        monkeypatch.setattr(ProjectBookmarkSerializer, "save", raise_database_error)

        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/bookmarks/",
            {"title": "Design reference", "url": "https://example.com/reference"},
            format="json",
        )

        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
