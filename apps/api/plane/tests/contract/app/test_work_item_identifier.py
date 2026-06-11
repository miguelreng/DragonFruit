# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from unittest.mock import patch
from rest_framework import status

from plane.db.models import Issue, Project, ProjectMember


@pytest.mark.contract
class TestWorkItemIdentifierEndpoint:
    def create_issue(self, session_client, workspace, create_user, name="Browse me"):
        project = Project.objects.create(name="Browse Project", identifier="BRW", workspace=workspace)
        ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
        with (
            patch("plane.app.views.issue.base.issue_description_version_task.delay"),
            patch("plane.app.views.issue.base.model_activity.delay"),
            patch("plane.app.views.issue.base.issue_activity.delay"),
        ):
            response = session_client.post(
                f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/",
                {"name": name},
                format="json",
            )
        assert response.status_code == status.HTTP_201_CREATED
        return project, response.data

    @pytest.mark.django_db
    def test_retrieve_issue_by_identifier(self, session_client, workspace, create_user):
        project, issue = self.create_issue(session_client, workspace, create_user)

        response = session_client.get(f"/api/workspaces/{workspace.slug}/work-items/BRW-{issue['sequence_id']}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == issue["id"]

    @pytest.mark.django_db
    def test_meta_endpoint_resolves_identifier(self, session_client, workspace, create_user):
        project, issue = self.create_issue(session_client, workspace, create_user)

        response = session_client.get(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{issue['id']}/meta/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["project_identifier"] == "BRW"

    @pytest.mark.django_db
    def test_user_issues_excludes_soft_deleted_projects(self, session_client, workspace, create_user):
        project, issue = self.create_issue(session_client, workspace, create_user)
        Issue.objects.filter(id=issue["id"]).update(created_by=create_user)

        url = f"/api/workspaces/{workspace.slug}/user-issues/{create_user.id}/"
        response = session_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert any(r["id"] == issue["id"] for r in response.data["results"])

        project.delete()  # soft delete

        response = session_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert not any(r["id"] == issue["id"] for r in response.data["results"])
