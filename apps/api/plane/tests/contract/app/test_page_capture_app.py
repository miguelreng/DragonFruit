# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from unittest.mock import patch

import pytest
from rest_framework import status

from plane.db.models import Page, Project, ProjectMember, ProjectPage


@pytest.mark.contract
class TestCapturedPageIngestAPI:
    def get_url(self, workspace_slug: str, project_id: str) -> str:
        return f"/api/workspaces/{workspace_slug}/projects/{project_id}/captured-pages/"

    def make_project(self, workspace, create_user):
        project = Project.objects.create(name="Imports", identifier="IMP", workspace=workspace)
        ProjectMember.objects.create(
            project=project,
            workspace=workspace,
            member=create_user,
            role=20,
            is_active=True,
        )
        return project

    @pytest.mark.django_db
    @patch("plane.app.views.page.capture.page_transaction.delay")
    def test_notion_capture_creates_sanitized_doc(
        self, _mock_page_tx, session_client, workspace, create_user
    ):
        project = self.make_project(workspace, create_user)

        response = session_client.post(
            self.get_url(workspace.slug, str(project.id)),
            {
                "source": "notion",
                "external_id": "1860881512a7815bb180f17201bf180b",
                "source_url": "https://app.notion.com/p/miguelreng/example-1860881512a7815bb180f17201bf180b",
                "title": "Imported advice",
                "html": '<h3>Advice</h3><p>Start now.</p><script>alert("no")</script>',
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        page = Page.objects.get(pk=response.data["id"])
        assert page.name == "Imported advice"
        assert page.page_type == Page.PAGE_TYPE_DOC
        assert page.is_captured_chat is False
        assert page.external_source == "notion"
        assert page.external_id == "1860881512a7815bb180f17201bf180b"
        assert "Imported from Notion" in page.description_html
        assert "https://app.notion.com/" in page.description_html
        assert "Start now." in page.description_html
        assert "<script" not in page.description_html
        assert ProjectPage.objects.filter(project=project, page=page, workspace=workspace).exists()

    @pytest.mark.django_db
    @patch("plane.app.views.page.capture.page_transaction.delay")
    def test_recapture_updates_existing_doc_in_place(
        self, _mock_page_tx, session_client, workspace, create_user
    ):
        project = self.make_project(workspace, create_user)
        url = self.get_url(workspace.slug, str(project.id))
        payload = {
            "source": "notion",
            "external_id": "notion-page-id",
            "source_url": "https://app.notion.com/p/example",
            "title": "First title",
            "html": "<p>Old content.</p>",
        }

        created = session_client.post(url, payload, format="json")
        assert created.status_code == status.HTTP_201_CREATED
        page = Page.objects.get(pk=created.data["id"])
        page.description_binary = b"stale-yjs"
        page.save(update_fields=["description_binary"])

        payload.update({"title": "Updated title", "html": "<p>Fresh content.</p>"})
        updated = session_client.post(url, payload, format="json")

        assert updated.status_code == status.HTTP_200_OK
        assert updated.data["id"] == created.data["id"]
        assert updated.data["created"] is False
        page.refresh_from_db()
        assert page.name == "Updated title"
        assert "Fresh content." in page.description_html
        assert "Old content." not in page.description_html
        assert page.description_binary is None
        assert Page.objects.filter(external_source="notion", external_id="notion-page-id").count() == 1
