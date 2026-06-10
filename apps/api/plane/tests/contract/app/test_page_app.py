# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from unittest.mock import patch
from rest_framework import status

from plane.db.models import FileAsset, Page, Project, ProjectMember, ProjectPage


def mock_presigned_post(file_type="application/pdf"):
    return {
        "url": "https://uploads.example.test/",
        "fields": {
            "Content-Type": file_type,
            "key": "workspace/file.pdf",
            "x-amz-algorithm": "AWS4-HMAC-SHA256",
            "x-amz-credential": "test",
            "x-amz-date": "20260101T000000Z",
            "policy": "test",
            "x-amz-signature": "test",
        },
    }


@pytest.mark.contract
class TestPageAPIPost:
    def get_pages_url(self, workspace_slug: str, project_id: str) -> str:
        return f"/api/workspaces/{workspace_slug}/projects/{project_id}/pages/"

    @pytest.mark.django_db
    @patch("plane.app.views.page.base.page_transaction.delay", side_effect=Exception("broker unavailable"))
    def test_create_page_succeeds_when_page_transaction_dispatch_fails(
        self, _mock_page_tx, session_client, workspace, create_user
    ):
        project = Project.objects.create(name="Pages Project", identifier="PP", workspace=workspace)
        ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
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
    def test_list_pages_can_filter_by_page_type(self, _mock_page_tx, session_client, workspace, create_user):
        project = Project.objects.create(name="Pages Project", identifier="PP", workspace=workspace)
        ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
        url = self.get_pages_url(workspace.slug, str(project.id))

        doc_response = session_client.post(url, {"name": "Spec", "page_type": "doc"}, format="json")
        whiteboard_response = session_client.post(url, {"name": "Flow", "page_type": "whiteboard"}, format="json")
        pdf_response = session_client.post(url, {"name": "Handbook", "page_type": "pdf"}, format="json")

        assert doc_response.status_code == status.HTTP_201_CREATED
        assert whiteboard_response.status_code == status.HTTP_201_CREATED
        assert pdf_response.status_code == status.HTTP_201_CREATED

        docs_response = session_client.get(f"{url}?page_type=doc")
        whiteboards_response = session_client.get(f"{url}?page_type=whiteboard")
        pdfs_response = session_client.get(f"{url}?page_type=pdf")
        mixed_response = session_client.get(url)

        assert docs_response.status_code == status.HTTP_200_OK
        assert [page["page_type"] for page in docs_response.data] == ["doc"]
        assert [page["name"] for page in docs_response.data] == ["Spec"]

        assert whiteboards_response.status_code == status.HTTP_200_OK
        assert [page["page_type"] for page in whiteboards_response.data] == ["whiteboard"]
        assert [page["name"] for page in whiteboards_response.data] == ["Flow"]

        assert pdfs_response.status_code == status.HTTP_200_OK
        assert [page["page_type"] for page in pdfs_response.data] == ["pdf"]
        assert [page["name"] for page in pdfs_response.data] == ["Handbook"]

        assert mixed_response.status_code == status.HTTP_200_OK
        assert {page["page_type"] for page in mixed_response.data} == {"doc", "whiteboard", "pdf"}

    @pytest.mark.django_db
    @patch("plane.app.views.page.base.copy_s3_objects_of_description_and_assets.delay")
    @patch("plane.app.views.page.base.page_transaction.delay")
    @patch("plane.bgtasks.copy_s3_object.S3Storage")
    def test_duplicate_pdf_page_rewrites_pdf_asset_id(
        self, mock_s3_storage, _mock_page_tx, _mock_copy_task, session_client, workspace, create_user
    ):
        project = Project.objects.create(name="Pages Project", identifier="PP", workspace=workspace)
        ProjectMember.objects.create(project=project, workspace=workspace, member=create_user, role=20)
        page = Page.objects.create(
            name="Research PDF",
            workspace=workspace,
            owned_by=create_user,
            page_type=Page.PAGE_TYPE_PDF,
        )
        ProjectPage.objects.create(project=project, page=page, workspace=workspace)
        asset = FileAsset.objects.create(
            attributes={"name": "research.pdf", "type": "application/pdf", "size": 1024},
            asset=f"{workspace.id}/research.pdf",
            size=1024,
            workspace=workspace,
            project=project,
            page=page,
            entity_type=FileAsset.EntityTypeContext.PAGE_DESCRIPTION,
            is_uploaded=True,
            created_by=create_user,
        )
        page.view_props = {
            "full_width": False,
            "pdf": {
                "asset_id": str(asset.id),
                "project_id": str(project.id),
                "name": "research.pdf",
                "size": 1024,
                "mime_type": "application/pdf",
            },
        }
        page.save(update_fields=["view_props"])

        response = session_client.post(
            f"{self.get_pages_url(workspace.slug, str(project.id))}{page.id}/duplicate/",
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["page_type"] == "pdf"
        assert response.data["view_props"]["pdf"]["asset_id"] != str(asset.id)
        duplicated_asset = FileAsset.objects.get(id=response.data["view_props"]["pdf"]["asset_id"])
        assert duplicated_asset.page_id == response.data["id"]
        assert duplicated_asset.entity_type == FileAsset.EntityTypeContext.PAGE_DESCRIPTION
        mock_s3_storage.return_value.copy_object.assert_called_once()


@pytest.mark.contract
class TestPageAssetAPI:
    @pytest.mark.django_db
    @patch("plane.app.views.asset.v2.S3Storage")
    def test_page_description_asset_accepts_pdf(self, mock_s3_storage, session_client, workspace, create_user):
        mock_s3_storage.return_value.generate_presigned_post.return_value = mock_presigned_post()
        project = Project.objects.create(name="Docs", identifier="DOC", workspace=workspace)
        ProjectMember.objects.create(project=project, workspace=workspace, member=create_user, role=20)
        page = Page.objects.create(name="PDF", workspace=workspace, owned_by=create_user, page_type=Page.PAGE_TYPE_PDF)
        ProjectPage.objects.create(project=project, page=page, workspace=workspace)

        response = session_client.post(
            f"/api/assets/v2/workspaces/{workspace.slug}/projects/{project.id}/",
            {
                "entity_type": FileAsset.EntityTypeContext.PAGE_DESCRIPTION,
                "entity_identifier": str(page.id),
                "name": "handbook.pdf",
                "type": "application/pdf",
                "size": 1024,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        asset = FileAsset.objects.get(id=response.data["asset_id"])
        assert asset.page_id == page.id
        assert asset.attributes["type"] == "application/pdf"

    @pytest.mark.django_db
    @patch("plane.app.views.asset.v2.S3Storage")
    def test_project_cover_asset_rejects_pdf(self, mock_s3_storage, session_client, workspace, create_user):
        mock_s3_storage.return_value.generate_presigned_post.return_value = mock_presigned_post()
        project = Project.objects.create(name="Docs", identifier="DOC", workspace=workspace)
        ProjectMember.objects.create(project=project, workspace=workspace, member=create_user, role=20)

        response = session_client.post(
            f"/api/assets/v2/workspaces/{workspace.slug}/projects/{project.id}/",
            {
                "entity_type": FileAsset.EntityTypeContext.PROJECT_COVER,
                "entity_identifier": str(project.id),
                "name": "cover.pdf",
                "type": "application/pdf",
                "size": 1024,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    @patch("plane.app.views.asset.v2.S3Storage")
    def test_project_asset_inline_url_uses_inline_disposition(
        self, mock_s3_storage, session_client, workspace, create_user
    ):
        mock_s3_storage.return_value.generate_presigned_url.return_value = "https://assets.example.test/inline.pdf"
        project = Project.objects.create(name="Docs", identifier="DOC", workspace=workspace)
        ProjectMember.objects.create(project=project, workspace=workspace, member=create_user, role=20)
        page = Page.objects.create(name="PDF", workspace=workspace, owned_by=create_user, page_type=Page.PAGE_TYPE_PDF)
        ProjectPage.objects.create(project=project, page=page, workspace=workspace)
        asset = FileAsset.objects.create(
            attributes={"name": "inline.pdf", "type": "application/pdf", "size": 1024},
            asset=f"{workspace.id}/inline.pdf",
            size=1024,
            workspace=workspace,
            project=project,
            page=page,
            entity_type=FileAsset.EntityTypeContext.PAGE_DESCRIPTION,
            is_uploaded=True,
            created_by=create_user,
        )

        response = session_client.get(
            f"/api/assets/v2/workspaces/{workspace.slug}/projects/{project.id}/{asset.id}/?disposition=inline"
        )

        assert response.status_code == status.HTTP_302_FOUND
        mock_s3_storage.return_value.generate_presigned_url.assert_called_once_with(
            object_name=asset.asset.name,
            disposition="inline",
            filename="inline.pdf",
        )


@pytest.mark.contract
class TestPageAccessAPI:
    def get_page_access_url(self, workspace_slug: str, project_id: str, page_id: str) -> str:
        return f"/api/workspaces/{workspace_slug}/projects/{project_id}/pages/{page_id}/access/"

    @pytest.mark.django_db
    @patch("plane.app.views.page.base.trigger_landing_deploy.delay")
    def test_publishing_essay_doc_triggers_landing_deploy(
        self, mock_trigger_landing_deploy, monkeypatch, session_client, workspace, create_user
    ):
        project = Project.objects.create(name="Essays", identifier="ESSAY", workspace=workspace)
        ProjectMember.objects.create(project=project, workspace=workspace, member=create_user, role=20)
        page = Page.objects.create(
            name="Agentic Workflows",
            workspace=workspace,
            owned_by=create_user,
            access=Page.PRIVATE_ACCESS,
            page_type=Page.PAGE_TYPE_DOC,
        )
        ProjectPage.objects.create(project=project, page=page, workspace=workspace)

        monkeypatch.setenv("DRAGONFRUIT_ESSAYS_WORKSPACE_SLUG", workspace.slug)
        monkeypatch.setenv("DRAGONFRUIT_ESSAYS_PROJECT_ID", str(project.id))

        response = session_client.post(
            self.get_page_access_url(workspace.slug, str(project.id), str(page.id)),
            {"access": Page.PUBLIC_ACCESS},
            format="json",
        )

        assert response.status_code == status.HTTP_204_NO_CONTENT
        mock_trigger_landing_deploy.assert_called_once_with(str(page.id), workspace.slug, str(project.id))

    @pytest.mark.django_db
    @patch("plane.app.views.page.base.trigger_landing_deploy.delay")
    def test_publishing_non_essay_doc_does_not_trigger_landing_deploy(
        self, mock_trigger_landing_deploy, monkeypatch, session_client, workspace, create_user
    ):
        project = Project.objects.create(name="Product Docs", identifier="DOCS", workspace=workspace)
        ProjectMember.objects.create(project=project, workspace=workspace, member=create_user, role=20)
        page = Page.objects.create(
            name="Internal Spec",
            workspace=workspace,
            owned_by=create_user,
            access=Page.PRIVATE_ACCESS,
            page_type=Page.PAGE_TYPE_DOC,
        )
        ProjectPage.objects.create(project=project, page=page, workspace=workspace)

        monkeypatch.setenv("DRAGONFRUIT_ESSAYS_WORKSPACE_SLUG", workspace.slug)
        monkeypatch.setenv("DRAGONFRUIT_ESSAYS_PROJECT_ID", "00000000-0000-0000-0000-000000000000")

        response = session_client.post(
            self.get_page_access_url(workspace.slug, str(project.id), str(page.id)),
            {"access": Page.PUBLIC_ACCESS},
            format="json",
        )

        assert response.status_code == status.HTTP_204_NO_CONTENT
        mock_trigger_landing_deploy.assert_not_called()


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
            view_props={
                "public_slug": "agentic-workflows",
                "essay_illustration": {
                    "status": "ready",
                    "image": "https://assets.dragonfruit.sh/essays/agentic-workflows/cover.png",
                },
            },
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
        assert response.data[0]["view_props"]["essay_illustration"]["status"] == "ready"
        assert response.data[0]["owned_by"]["display_name"] == create_user.display_name
