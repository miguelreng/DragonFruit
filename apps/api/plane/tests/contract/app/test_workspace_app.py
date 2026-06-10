# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from django.urls import reverse
from rest_framework import status
from unittest.mock import patch

from plane.db.models import Workspace, WorkspaceMember


@pytest.mark.contract
class TestWorkspaceAPI:
    """Test workspace CRUD operations"""

    @pytest.mark.django_db
    def test_create_workspace_empty_data(self, session_client):
        """Test creating a workspace with empty data"""
        url = reverse("workspace")

        # Test with empty data
        response = session_client.post(url, {}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    @patch("plane.bgtasks.workspace_seed_task.workspace_seed.delay")
    def test_create_workspace_valid_data(self, mock_workspace_seed, session_client, create_user):
        """Test creating a workspace with valid data"""
        url = reverse("workspace")
        user = create_user  # Use the create_user fixture directly as it returns a user object

        # Test with valid data - include all required fields
        workspace_data = {
            "name": "Plane",
            "slug": "pla-ne-test",
            "company_name": "Plane Inc.",
        }

        # Make the request
        response = session_client.post(url, workspace_data, format="json")

        # Check response status
        assert response.status_code == status.HTTP_201_CREATED

        # Verify workspace was created
        assert Workspace.objects.filter(slug=workspace_data["slug"]).count() == 1

        # Check if the member is created
        workspace = Workspace.objects.get(slug=workspace_data["slug"])
        assert WorkspaceMember.objects.filter(workspace=workspace).count() == 1

        # Check other values
        workspace_member = WorkspaceMember.objects.filter(workspace=workspace, member=user).first()
        assert workspace.owner == user
        assert workspace_member.role == 20

        # Verify the workspace_seed task was called
        mock_workspace_seed.assert_called_once_with(response.data["id"])

    @pytest.mark.django_db
    @patch("plane.bgtasks.workspace_seed_task.workspace_seed.delay")
    def test_create_duplicate_workspace(self, mock_workspace_seed, session_client):
        """Test creating a duplicate workspace"""
        url = reverse("workspace")

        # Create first workspace
        session_client.post(url, {"name": "Plane", "slug": "pla-ne"}, format="json")

        # Try to create a workspace with the same slug
        response = session_client.post(url, {"name": "Plane", "slug": "pla-ne"}, format="json")

        # The API returns 400 BAD REQUEST for duplicate slugs, not 409 CONFLICT
        assert response.status_code == status.HTTP_400_BAD_REQUEST

        # Optionally check the error message to confirm it's related to the duplicate slug
        assert "slug" in response.data

    @pytest.mark.django_db
    def test_list_workspaces_without_slug_returns_200(self, session_client, workspace):
        """Test listing workspaces from /api/workspaces/ does not require slug kwargs."""
        url = reverse("workspace")

        response = session_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, list)

    @pytest.mark.django_db
    @patch("plane.app.views.workspace.base.track_event.delay", side_effect=Exception("broker unavailable"))
    @patch("plane.app.views.workspace.base.workspace_seed.delay", side_effect=Exception("broker unavailable"))
    def test_create_workspace_succeeds_when_background_tasks_fail(
        self, _mock_workspace_seed, _mock_track_event, session_client
    ):
        """Workspace creation should not fail if async queue is temporarily unavailable."""
        url = reverse("workspace")
        workspace_data = {
            "name": "Resilient Workspace",
            "slug": "resilient-workspace",
            "company_name": "Plane Inc.",
        }

        response = session_client.post(url, workspace_data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert Workspace.objects.filter(slug=workspace_data["slug"]).exists()
