# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from unittest.mock import patch
from rest_framework import status

from plane.db.models import Page, Project, ProjectPage


@pytest.mark.contract
class TestPageAPIPost:
    def get_pages_url(self, workspace_slug: str, project_id: str) -> str:
        return f"/api/workspaces/{workspace_slug}/projects/{project_id}/pages/"

    @pytest.mark.django_db
    @patch("plane.app.views.page.base.page_transaction.delay", side_effect=Exception("broker unavailable"))
    def test_create_page_succeeds_when_page_transaction_dispatch_fails(
        self, _mock_page_tx, session_client, workspace
    ):
        project = Project.objects.create(name="Pages Project", identifier="PP", workspace=workspace)
        url = self.get_pages_url(workspace.slug, str(project.id))

        response = session_client.post(url, {"name": "Whiteboard 1", "page_type": "whiteboard"}, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "Whiteboard 1"
        assert response.data["page_type"] == "whiteboard"


@pytest.mark.contract
class TestPageAPIGet:
    def get_pages_url(self, workspace_slug: str, project_id: str) -> str:
        return f"/api/workspaces/{workspace_slug}/projects/{project_id}/pages/"

    @pytest.mark.django_db
    @patch("plane.app.views.page.base.page_transaction.delay", side_effect=Exception("broker unavailable"))
    def test_list_pages_can_filter_by_page_type(self, _mock_page_tx, session_client, workspace):
        project = Project.objects.create(name="Pages Project", identifier="PP", workspace=workspace)
        url = self.get_pages_url(workspace.slug, str(project.id))

        doc_response = session_client.post(url, {"name": "Spec", "page_type": "doc"}, format="json")
        whiteboard_response = session_client.post(url, {"name": "Flow", "page_type": "whiteboard"}, format="json")

        assert doc_response.status_code == status.HTTP_201_CREATED
        assert whiteboard_response.status_code == status.HTTP_201_CREATED

        docs_response = session_client.get(f"{url}?page_type=doc")
        whiteboards_response = session_client.get(f"{url}?page_type=whiteboard")
        mixed_response = session_client.get(url)

        assert docs_response.status_code == status.HTTP_200_OK
        assert [page["page_type"] for page in docs_response.data] == ["doc"]
        assert [page["name"] for page in docs_response.data] == ["Spec"]

        assert whiteboards_response.status_code == status.HTTP_200_OK
        assert [page["page_type"] for page in whiteboards_response.data] == ["whiteboard"]
        assert [page["name"] for page in whiteboards_response.data] == ["Flow"]

        assert mixed_response.status_code == status.HTTP_200_OK
        assert {page["page_type"] for page in mixed_response.data} == {"doc", "whiteboard"}


@pytest.mark.contract
class TestPublicProjectPagesAPI:
    def get_public_pages_url(self, workspace_slug: str, project_id: str) -> str:
        return f"/api/public/workspaces/{workspace_slug}/projects/{project_id}/pages/"

    @pytest.mark.django_db
    def test_list_public_project_doc_pages_for_essays(self, api_client, workspace, create_user):
        project = Project.objects.create(name="Essays", identifier="ESSAY", workspace=workspace)
        other_project = Project.objects.create(name="Other", identifier="OTHER", workspace=workspace)

        public_page = Page.objects.create(
            name="Agentic Workflows",
            workspace=workspace,
            owned_by=create_user,
            access=Page.PUBLIC_ACCESS,
            page_type=Page.PAGE_TYPE_DOC,
            description_html="<p>Useful workflow notes.</p>",
            view_props={"public_slug": "agentic-workflows"},
        )
        private_page = Page.objects.create(
            name="Private Draft",
            workspace=workspace,
            owned_by=create_user,
            access=Page.PRIVATE_ACCESS,
            page_type=Page.PAGE_TYPE_DOC,
            description_html="<p>Not ready.</p>",
        )
        whiteboard_page = Page.objects.create(
            name="Sketch",
            workspace=workspace,
            owned_by=create_user,
            access=Page.PUBLIC_ACCESS,
            page_type=Page.PAGE_TYPE_WHITEBOARD,
        )
        other_project_page = Page.objects.create(
            name="Other Public Doc",
            workspace=workspace,
            owned_by=create_user,
            access=Page.PUBLIC_ACCESS,
            page_type=Page.PAGE_TYPE_DOC,
        )

        for page in [public_page, private_page, whiteboard_page]:
            ProjectPage.objects.create(project=project, page=page, workspace=workspace)
        ProjectPage.objects.create(project=other_project, page=other_project_page, workspace=workspace)

        response = api_client.get(self.get_public_pages_url(workspace.slug, str(project.id)))

        assert response.status_code == status.HTTP_200_OK
        assert [page["name"] for page in response.data] == ["Agentic Workflows"]
        assert response.data[0]["public_slug"] == "agentic-workflows"
        assert response.data[0]["description_stripped"] == "Useful workflow notes."
        assert response.data[0]["owned_by"]["display_name"] == create_user.display_name
