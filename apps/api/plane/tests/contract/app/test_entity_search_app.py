# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status

from plane.db.models import Page, Project, ProjectMember, ProjectPage, User


@pytest.mark.contract
class TestEntitySearchPages:
    """Project-scoped entity search for `page` covers the whole workspace so
    docs from other projects can be @-mentioned, with current-project docs
    ranked first."""

    def get_search_url(self, workspace_slug: str) -> str:
        return f"/api/workspaces/{workspace_slug}/entity-search/"

    def _create_project_with_page(self, workspace, user, name, identifier, page_name):
        project = Project.objects.create(name=name, identifier=identifier, workspace=workspace)
        ProjectMember.objects.create(project=project, member=user, role=20, is_active=True)
        page = Page.objects.create(name=page_name, workspace=workspace, owned_by=user, access=0)
        ProjectPage.objects.create(project=project, page=page, workspace=workspace)
        return project, page

    @pytest.mark.django_db
    def test_page_search_returns_docs_from_other_projects(self, session_client, workspace, create_user):
        current_project, current_page = self._create_project_with_page(
            workspace, create_user, "Current", "CUR", "Roadmap current"
        )
        _, other_page = self._create_project_with_page(workspace, create_user, "Other", "OTH", "Roadmap other")

        response = session_client.get(
            self.get_search_url(workspace.slug),
            {"query_type": "page", "query": "Roadmap", "project_id": str(current_project.id), "count": 5},
        )

        assert response.status_code == status.HTTP_200_OK
        page_ids = [str(page["id"]) for page in response.data["page"]]
        assert str(current_page.id) in page_ids
        assert str(other_page.id) in page_ids
        # Current-project docs rank before docs from other projects.
        assert page_ids.index(str(current_page.id)) < page_ids.index(str(other_page.id))

    @pytest.mark.django_db
    def test_page_search_excludes_projects_user_is_not_member_of(self, session_client, workspace, create_user):
        current_project, _ = self._create_project_with_page(workspace, create_user, "Current", "CUR", "Roadmap current")
        # A doc in a project the user is not a member of must never surface.
        foreign_project = Project.objects.create(name="Foreign", identifier="FOR", workspace=workspace)
        foreign_page = Page.objects.create(
            name="Roadmap foreign", workspace=workspace, owned_by=workspace.owner, access=0
        )
        ProjectPage.objects.create(project=foreign_project, page=foreign_page, workspace=workspace)

        response = session_client.get(
            self.get_search_url(workspace.slug),
            {"query_type": "page", "query": "Roadmap", "project_id": str(current_project.id), "count": 5},
        )

        assert response.status_code == status.HTTP_200_OK
        page_ids = [str(page["id"]) for page in response.data["page"]]
        assert str(foreign_page.id) not in page_ids

    @pytest.mark.django_db
    def test_page_search_excludes_other_members_private_docs(self, session_client, workspace, create_user):
        current_project, _ = self._create_project_with_page(workspace, create_user, "Current", "CUR", "Roadmap current")
        other_project = Project.objects.create(name="Other", identifier="OTH", workspace=workspace)
        ProjectMember.objects.create(project=other_project, member=create_user, role=20, is_active=True)
        # Private (access=1) doc owned by someone else stays hidden.
        other_user = User.objects.create(email="other-owner@plane.so", username="other-owner")
        private_page = Page.objects.create(
            name="Roadmap private", workspace=workspace, owned_by=other_user, access=1
        )
        ProjectPage.objects.create(project=other_project, page=private_page, workspace=workspace)

        response = session_client.get(
            self.get_search_url(workspace.slug),
            {"query_type": "page", "query": "Roadmap", "project_id": str(current_project.id), "count": 5},
        )

        assert response.status_code == status.HTTP_200_OK
        page_ids = [str(page["id"]) for page in response.data["page"]]
        assert str(private_page.id) not in page_ids
