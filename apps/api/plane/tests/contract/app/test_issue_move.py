# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from unittest.mock import patch
from rest_framework import status

from plane.db.models import (
    CycleIssue,
    Cycle,
    Issue,
    IssueLabel,
    Label,
    Project,
    ProjectMember,
    State,
)


def _move_url(slug, project_id, issue_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/issues/{issue_id}/move/"


@pytest.mark.contract
@patch("plane.app.views.issue.base.issue_activity.delay")
class TestMoveIssueToProject:
    def _project(self, workspace, user, name, identifier):
        project = Project.objects.create(name=name, identifier=identifier, workspace=workspace)
        ProjectMember.objects.create(project=project, member=user, role=20, is_active=True)
        return project

    def _state(self, workspace, project, name, group, default=False):
        return State.objects.create(
            name=name, color="#000000", group=group, default=default, project=project, workspace=workspace
        )

    @pytest.mark.django_db
    def test_moves_task_and_subtree_renumbering_and_remapping_state(
        self, _mock_activity, session_client, workspace, create_user
    ):
        source = self._project(workspace, create_user, "Source", "SRC")
        destination = self._project(workspace, create_user, "Destination", "DST")

        source_state = self._state(workspace, source, "Src Todo", "unstarted", default=True)
        dest_default = self._state(workspace, destination, "Dst Backlog", "backlog", default=True)

        parent = Issue.objects.create(name="Parent", project=source, workspace=workspace, state=source_state)
        child = Issue.objects.create(
            name="Child", project=source, workspace=workspace, state=source_state, parent=parent
        )

        # A source-project label + cycle membership that can't carry across projects.
        label = Label.objects.create(name="urgent", color="#ff0000", project=source, workspace=workspace)
        IssueLabel.objects.create(issue=parent, label=label, project=source, workspace=workspace)
        cycle = Cycle.objects.create(name="Sprint", project=source, workspace=workspace, owned_by=create_user)
        CycleIssue.objects.create(issue=parent, cycle=cycle, project=source, workspace=workspace)

        response = session_client.post(
            _move_url(workspace.slug, str(source.id), str(parent.id)),
            {"destination_project_id": str(destination.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["moved_count"] == 2

        parent.refresh_from_db()
        child.refresh_from_db()

        # Both moved to the destination, reassigned to its default state.
        assert parent.project_id == destination.id
        assert child.project_id == destination.id
        assert parent.state_id == dest_default.id
        assert child.state_id == dest_default.id

        # Root detaches from its old parent chain; the child keeps its parent within the subtree.
        assert parent.parent_id is None
        assert child.parent_id == parent.id

        # Renumbered in the destination project (fresh sequence: 1 and 2).
        assert {parent.sequence_id, child.sequence_id} == {1, 2}

        # Project-scoped associations are dropped on the move.
        assert IssueLabel.objects.filter(issue=parent).count() == 0
        assert CycleIssue.objects.filter(issue=parent).count() == 0

    @pytest.mark.django_db
    def test_rejects_move_into_same_project(self, _mock_activity, session_client, workspace, create_user):
        source = self._project(workspace, create_user, "Source", "SRC")
        state = self._state(workspace, source, "Todo", "unstarted", default=True)
        issue = Issue.objects.create(name="Task", project=source, workspace=workspace, state=state)

        response = session_client.post(
            _move_url(workspace.slug, str(source.id), str(issue.id)),
            {"destination_project_id": str(source.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_rejects_destination_the_user_is_not_member_of(
        self, _mock_activity, session_client, workspace, create_user
    ):
        source = self._project(workspace, create_user, "Source", "SRC")
        state = self._state(workspace, source, "Todo", "unstarted", default=True)
        issue = Issue.objects.create(name="Task", project=source, workspace=workspace, state=state)

        # Destination exists in the workspace but the user is NOT a member of it.
        destination = Project.objects.create(name="Closed", identifier="CLS", workspace=workspace)
        self._state(workspace, destination, "Backlog", "backlog", default=True)

        response = session_client.post(
            _move_url(workspace.slug, str(source.id), str(issue.id)),
            {"destination_project_id": str(destination.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
