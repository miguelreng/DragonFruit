# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status

from plane.db.models import Issue, Project, ProjectMember, State


def _favorites_url(slug):
    return f"/api/workspaces/{slug}/user-favorites/"


@pytest.mark.contract
class TestIssueFavorite:
    def _project(self, workspace, user, name="Fav Project", identifier="FAV"):
        project = Project.objects.create(name=name, identifier=identifier, workspace=workspace)
        ProjectMember.objects.create(project=project, member=user, role=20, is_active=True)
        return project

    def _issue(self, workspace, project, name="Favorited task"):
        state = State.objects.create(
            name="Todo", color="#000000", group="unstarted", default=True, project=project, workspace=workspace
        )
        return Issue.objects.create(name=name, project=project, workspace=workspace, state=state)

    @pytest.mark.django_db
    def test_issue_favorite_round_trip_includes_entity_data(self, session_client, workspace, create_user):
        project = self._project(workspace, create_user)
        issue = self._issue(workspace, project)

        response = session_client.post(
            _favorites_url(workspace.slug),
            {
                "entity_type": "issue",
                "entity_identifier": str(issue.id),
                "project_id": str(project.id),
                "name": issue.name,
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK

        listing = session_client.get(_favorites_url(workspace.slug))
        assert listing.status_code == status.HTTP_200_OK
        favs = [f for f in listing.data if f["entity_type"] == "issue"]
        assert len(favs) == 1
        entity_data = favs[0]["entity_data"]
        assert entity_data["name"] == issue.name
        assert entity_data["sequence_id"] == issue.sequence_id
        assert str(entity_data["project_id"]) == str(project.id)

    @pytest.mark.django_db
    def test_issue_favorite_for_deleted_issue_returns_null_entity_data(self, session_client, workspace, create_user):
        project = self._project(workspace, create_user, name="Fav Project 2", identifier="FAV2")
        issue = self._issue(workspace, project, name="Doomed task")

        response = session_client.post(
            _favorites_url(workspace.slug),
            {
                "entity_type": "issue",
                "entity_identifier": str(issue.id),
                "project_id": str(project.id),
                "name": issue.name,
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK

        issue.delete()

        # The favorite row survives; the client falls back to the snapshot
        # `name` when entity_data can no longer be resolved.
        listing = session_client.get(_favorites_url(workspace.slug))
        assert listing.status_code == status.HTTP_200_OK
        favs = [f for f in listing.data if f["entity_type"] == "issue"]
        assert len(favs) == 1
        assert favs[0]["entity_data"] is None
        assert favs[0]["name"] == "Doomed task"
