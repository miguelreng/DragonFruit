# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from unittest.mock import patch
from django.utils import timezone
from rest_framework import status

from plane.db.models import FileAsset, Page, Project, ProjectMember, ProjectPage, WorkspaceMember


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
class TestPageFolderAPI:
    """Folders = pages with page_type "folder"; docs join one via `parent`."""

    def get_pages_url(self, workspace_slug: str, project_id: str) -> str:
        return f"/api/workspaces/{workspace_slug}/projects/{project_id}/pages/"

    @pytest.mark.django_db
    @patch("plane.app.views.page.base.page_transaction.delay")
    def test_folder_lifecycle(self, _mock_page_tx, session_client, workspace, create_user):
        project = Project.objects.create(name="Pages Project", identifier="PP", workspace=workspace)
        ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
        url = self.get_pages_url(workspace.slug, str(project.id))

        # Create a folder and a doc, then file the doc into the folder.
        folder_response = session_client.post(url, {"name": "Research", "page_type": "folder"}, format="json")
        doc_response = session_client.post(url, {"name": "Spec", "page_type": "doc"}, format="json")
        assert folder_response.status_code == status.HTTP_201_CREATED
        assert folder_response.data["page_type"] == "folder"
        assert doc_response.status_code == status.HTTP_201_CREATED
        folder_id = folder_response.data["id"]
        doc_id = doc_response.data["id"]

        move_response = session_client.patch(f"{url}{doc_id}/", {"parent": folder_id}, format="json")
        assert move_response.status_code == status.HTTP_200_OK
        assert str(move_response.data["parent"]) == str(folder_id)

        # The parented doc must stay listable and retrievable.
        list_response = session_client.get(url)
        assert list_response.status_code == status.HTTP_200_OK
        listed_ids = {str(page["id"]) for page in list_response.data}
        assert {str(folder_id), str(doc_id)} <= listed_ids

        retrieve_response = session_client.get(f"{url}{doc_id}/")
        assert retrieve_response.status_code == status.HTTP_200_OK
        assert str(retrieve_response.data["parent"]) == str(folder_id)

        # The workspace docs list returns folders alongside a doc-typed filter.
        workspace_response = session_client.get(f"/api/workspaces/{workspace.slug}/pages/?page_type=doc")
        assert workspace_response.status_code == status.HTTP_200_OK
        workspace_types = {str(page["id"]): page["page_type"] for page in workspace_response.data}
        assert workspace_types.get(str(folder_id)) == "folder"
        assert workspace_types.get(str(doc_id)) == "doc"

        # Deleting the folder (archive first, per the API rule) unparents the doc.
        unfile_response = session_client.patch(f"{url}{doc_id}/", {"parent": None}, format="json")
        assert unfile_response.status_code == status.HTTP_200_OK
        assert unfile_response.data["parent"] is None

        archive_response = session_client.post(f"{url}{folder_id}/archive/", format="json")
        assert archive_response.status_code == status.HTTP_200_OK
        delete_response = session_client.delete(f"{url}{folder_id}/")
        assert delete_response.status_code == status.HTTP_204_NO_CONTENT

        assert Page.objects.filter(pk=doc_id, parent__isnull=True).exists()


@pytest.mark.contract
class TestPageDeletePermissionsAPI:
    """Delete permissions match the web app's inherited workspace-admin role."""

    @pytest.mark.django_db
    def test_workspace_admin_can_delete_page_as_project_member(
        self, session_client, workspace, create_user, create_bot_user
    ):
        project = Project.objects.create(name="Pages Project", identifier="PP", workspace=workspace)
        # The workspace fixture makes create_user a workspace admin. Their raw
        # project role is deliberately MEMBER to cover the permission mismatch.
        ProjectMember.objects.create(
            project=project,
            workspace=workspace,
            member=create_user,
            role=15,
            is_active=True,
        )
        page = Page.objects.create(
            name="Agent-owned doc",
            workspace=workspace,
            owned_by=create_bot_user,
            access=Page.PUBLIC_ACCESS,
        )
        ProjectPage.objects.create(project=project, page=page, workspace=workspace)

        archive_response = session_client.post(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/pages/{page.id}/archive/"
        )
        response = session_client.delete(f"/api/workspaces/{workspace.slug}/projects/{project.id}/pages/{page.id}/")

        assert archive_response.status_code == status.HTTP_200_OK
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not Page.objects.filter(id=page.id).exists()

    @pytest.mark.django_db
    def test_non_admin_project_member_cannot_delete_another_owners_page(
        self, session_client, workspace, create_user, create_bot_user
    ):
        WorkspaceMember.objects.filter(workspace=workspace, member=create_user).update(role=15)
        project = Project.objects.create(name="Pages Project", identifier="PP", workspace=workspace)
        ProjectMember.objects.create(
            project=project,
            workspace=workspace,
            member=create_user,
            role=15,
            is_active=True,
        )
        page = Page.objects.create(
            name="Protected doc",
            workspace=workspace,
            owned_by=create_bot_user,
            access=Page.PUBLIC_ACCESS,
            archived_at=timezone.now(),
        )
        ProjectPage.objects.create(project=project, page=page, workspace=workspace)

        response = session_client.delete(f"/api/workspaces/{workspace.slug}/projects/{project.id}/pages/{page.id}/")

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert Page.objects.filter(id=page.id).exists()


@pytest.mark.contract
class TestWorkspacePagesContentPreviewAPI:
    """The workspace pages list ships per-type `content_preview` payloads the
    docs gallery renders as thumbnails (doc blocks / sheet window / whiteboard
    elements; PDFs and empty bodies get None)."""

    @pytest.mark.django_db
    def test_content_preview_shapes_per_page_type(self, session_client, workspace, create_user):
        project = Project.objects.create(name="Preview", identifier="PRV", workspace=workspace)
        ProjectMember.objects.create(project=project, workspace=workspace, member=create_user, role=20, is_active=True)

        def make_page(name, **kwargs):
            page = Page.objects.create(name=name, workspace=workspace, owned_by=create_user, access=0, **kwargs)
            ProjectPage.objects.create(project=project, page=page, workspace=workspace)
            return page

        doc = make_page(
            "Doc",
            description_html=(
                "<h1>Title</h1><p>Body text</p>"
                '<ul data-type="taskList"><li data-checked="true"><p>Done item</p></li></ul>'
                "<ul><li>Bullet</li></ul>"
            ),
        )
        sheet = make_page(
            "Sheet",
            page_type=Page.PAGE_TYPE_SHEET,
            description_json={
                "sheet_snapshot": {
                    "activeId": "s1",
                    "sheets": [
                        {
                            "id": "s1",
                            "name": "Grid",
                            "rows": 100,
                            "cols": 30,
                            "cells": {"A1": "Label", "B2": "=1+1", "ZZ99": "far away"},
                            "formats": {"A1": {"bold": True}},
                            "colWidths": {"0": 120, "25": 80},
                        }
                    ],
                }
            },
        )
        whiteboard = make_page(
            "Board",
            page_type=Page.PAGE_TYPE_WHITEBOARD,
            description_json={
                "excalidraw_snapshot": {
                    "elements": [
                        {"type": "rectangle", "x": 1.4, "y": 2.6, "width": 10, "height": 5, "strokeColor": "#111"},
                        {"type": "rectangle", "x": 0, "y": 0, "width": 1, "height": 1, "isDeleted": True},
                        {"type": "text", "x": 0, "y": 0, "width": 4, "height": 2, "text": "hi", "fontSize": 20},
                    ],
                    "appState": {"viewBackgroundColor": "#fafafa"},
                }
            },
        )
        pdf = make_page("Pdf", page_type=Page.PAGE_TYPE_PDF)
        empty = make_page("Empty", description_html="")

        response = session_client.get(f"/api/workspaces/{workspace.slug}/pages/")
        assert response.status_code == status.HTTP_200_OK
        previews = {str(page["id"]): page["content_preview"] for page in response.data}

        doc_preview = previews[str(doc.id)]
        assert doc_preview["kind"] == "doc"
        assert [block["t"] for block in doc_preview["blocks"]] == ["h1", "p", "done", "li"]

        sheet_preview = previews[str(sheet.id)]
        assert sheet_preview["kind"] == "sheet"
        # Window trims to the serializer caps and drops out-of-window cells.
        assert sheet_preview["rows"] == 40 and sheet_preview["cols"] == 12
        assert set(sheet_preview["cells"]) == {"A1", "B2"}
        assert sheet_preview["formats"] == {"A1": {"bold": True}}
        assert sheet_preview["colWidths"] == {"0": 120}

        board_preview = previews[str(whiteboard.id)]
        assert board_preview["kind"] == "whiteboard"
        assert board_preview["bg"] == "#fafafa"
        assert [el["type"] for el in board_preview["els"]] == ["rectangle", "text"]
        assert board_preview["els"][0]["x"] == 1 and board_preview["els"][1]["text"] == "hi"

        assert previews[str(pdf.id)] is None
        assert previews[str(empty.id)] is None


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
