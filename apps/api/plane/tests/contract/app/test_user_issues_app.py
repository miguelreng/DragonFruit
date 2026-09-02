# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status

from plane.db.models import Issue, IssueAssignee, Project, ProjectMember, State


@pytest.mark.contract
class TestWorkspaceUserProfileIssues:
    @pytest.mark.django_db
    def test_assigned_issue_visible_without_project_membership(self, session_client, workspace, create_user):
        member_project = Project.objects.create(name="Mine", identifier="MP", workspace=workspace)
        ProjectMember.objects.create(project=member_project, member=create_user, role=20, is_active=True)
        foreign_project = Project.objects.create(name="Theirs", identifier="TP", workspace=workspace)

        state_a = State.objects.create(name="Todo", group="unstarted", project=member_project, workspace=workspace)
        state_b = State.objects.create(name="Todo", group="unstarted", project=foreign_project, workspace=workspace)

        mine = Issue.objects.create(name="in my project", project=member_project, workspace=workspace, state=state_a)
        theirs = Issue.objects.create(name="in their project", project=foreign_project, workspace=workspace, state=state_b)
        for issue in (mine, theirs):
            IssueAssignee.objects.create(issue=issue, assignee=create_user, project=issue.project, workspace=workspace)

        url = f"/api/workspaces/{workspace.slug}/user-issues/{create_user.id}/"
        response = session_client.get(url, {"assignees": str(create_user.id), "per_page": 100})

        assert response.status_code == status.HTTP_200_OK
        names = [r["name"] for r in response.data["results"]]
        assert sorted(names) == ["in my project", "in their project"]
        # no duplicate rows from the OR'd visibility checks
        assert len(names) == len(set(names))

    @pytest.mark.django_db
    def test_unassigned_issue_in_foreign_project_stays_hidden(self, session_client, workspace, create_user):
        foreign_project = Project.objects.create(name="Theirs", identifier="TP", workspace=workspace)
        state = State.objects.create(name="Todo", group="unstarted", project=foreign_project, workspace=workspace)
        Issue.objects.create(
            name="not mine", project=foreign_project, workspace=workspace, state=state, created_by=create_user
        )

        url = f"/api/workspaces/{workspace.slug}/user-issues/{create_user.id}/"
        response = session_client.get(url, {"per_page": 100})

        assert response.status_code == status.HTTP_200_OK
        assert [r["name"] for r in response.data["results"]] == []

    @pytest.mark.django_db
    def test_pagination_cursor_walks_all_pages(self, session_client, workspace, create_user):
        project = Project.objects.create(name="Mine", identifier="MP", workspace=workspace)
        ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
        state = State.objects.create(name="Todo", group="unstarted", project=project, workspace=workspace)
        for i in range(7):
            issue = Issue.objects.create(name=f"task {i}", project=project, workspace=workspace, state=state)
            IssueAssignee.objects.create(issue=issue, assignee=create_user, project=project, workspace=workspace)

        url = f"/api/workspaces/{workspace.slug}/user-issues/{create_user.id}/"
        seen = []
        cursor = None
        for _ in range(10):
            params = {"assignees": str(create_user.id), "per_page": 3, "state_group": "backlog,unstarted,started"}
            if cursor:
                params["cursor"] = cursor
            response = session_client.get(url, params)
            assert response.status_code == status.HTTP_200_OK
            seen.extend(r["name"] for r in response.data["results"])
            if not response.data.get("next_page_results"):
                break
            cursor = response.data["next_cursor"]

        assert sorted(seen) == sorted(f"task {i}" for i in range(7))
