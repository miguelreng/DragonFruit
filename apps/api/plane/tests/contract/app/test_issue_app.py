# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from unittest.mock import patch
from rest_framework import status

from plane.db.models import Project, ProjectMember, Workspace, WorkspaceMember


@pytest.mark.contract
class TestIssueAPIPost:
    def get_issue_url(self, workspace_slug: str, project_id: str) -> str:
        return f"/api/workspaces/{workspace_slug}/projects/{project_id}/issues/"

    @pytest.mark.django_db
    @patch("plane.app.views.issue.base.issue_description_version_task.delay", side_effect=Exception("broker down"))
    @patch("plane.app.views.issue.base.model_activity.delay", side_effect=Exception("broker down"))
    @patch("plane.app.views.issue.base.issue_activity.delay", side_effect=Exception("broker down"))
    def test_create_issue_succeeds_when_async_dispatch_fails(
        self, _mock_issue_activity, _mock_model_activity, _mock_desc_version, session_client, workspace, create_user
    ):
        project = Project.objects.create(name="Issue Project", identifier="IP", workspace=workspace)
        ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
        url = self.get_issue_url(workspace.slug, str(project.id))

        response = session_client.post(url, {"name": "Issue with down broker"}, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "Issue with down broker"

    @pytest.mark.django_db
    def test_create_issue_returns_403_for_project_outside_workspace(self, session_client, workspace, create_user):
        other_workspace = Workspace.objects.create(name="Other Workspace", owner=create_user, slug="other-workspace")
        WorkspaceMember.objects.create(workspace=other_workspace, member=create_user, role=20)
        other_project = Project.objects.create(name="Other Project", identifier="OP", workspace=other_workspace)

        url = self.get_issue_url(workspace.slug, str(other_project.id))
        response = session_client.post(url, {"name": "Cross workspace issue"}, format="json")

        # Inaccessible projects return a uniform 403 (no resource-existence leak), not 404.
        assert response.status_code == status.HTTP_403_FORBIDDEN
