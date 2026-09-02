from unittest.mock import patch

import pytest
from rest_framework import status

from plane.db.models import FileAsset, Page, Project, ProjectMember, ProjectPage, Workspace


def mock_presigned_upload():
    return {
        "url": "https://assets.example.test/upload",
        "fields": {"Content-Type": "image/png"},
        "method": "PUT",
    }


@pytest.mark.contract
class TestAssetSecurity:
    @pytest.mark.django_db
    @patch("plane.app.views.asset.v2.S3Storage")
    def test_workspace_logo_cannot_target_another_workspace(
        self, mock_storage, session_client, workspace, create_user
    ):
        mock_storage.return_value.generate_presigned_post.return_value = mock_presigned_upload()
        other_workspace = Workspace.objects.create(
            name="Other Workspace",
            slug="other-workspace",
            owner=create_user,
        )

        response = session_client.post(
            f"/api/assets/v2/workspaces/{workspace.slug}/",
            {
                "entity_type": FileAsset.EntityTypeContext.WORKSPACE_LOGO,
                "entity_identifier": str(other_workspace.id),
                "name": "logo.png",
                "type": "image/png",
                "size": 128,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert not FileAsset.objects.exists()

    @pytest.mark.django_db
    @patch("plane.app.views.asset.v2.S3Storage")
    def test_project_asset_cannot_reference_page_from_another_workspace(
        self, mock_storage, session_client, workspace, create_user
    ):
        mock_storage.return_value.generate_presigned_post.return_value = mock_presigned_upload()
        project = Project.objects.create(name="Current", identifier="CUR", workspace=workspace)
        ProjectMember.objects.create(project=project, workspace=workspace, member=create_user, role=20)
        other_workspace = Workspace.objects.create(
            name="Other Workspace",
            slug="other-workspace",
            owner=create_user,
        )
        other_page = Page.objects.create(name="Secret", workspace=other_workspace, owned_by=create_user)

        response = session_client.post(
            f"/api/assets/v2/workspaces/{workspace.slug}/projects/{project.id}/",
            {
                "entity_type": FileAsset.EntityTypeContext.PAGE_DESCRIPTION,
                "entity_identifier": str(other_page.id),
                "name": "secret.png",
                "type": "image/png",
                "size": 128,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert not FileAsset.objects.exists()

    @pytest.mark.django_db
    @patch("plane.utils.asset_upload.S3Storage")
    @patch("plane.app.views.asset.v2.S3Storage")
    def test_finalize_rejects_storage_metadata_mismatch(
        self, mock_view_storage, mock_verification_storage, session_client, workspace, create_user
    ):
        mock_view_storage.return_value.generate_presigned_post.return_value = mock_presigned_upload()
        mock_verification_storage.return_value.get_object_metadata.return_value = {
            "ContentLength": 128,
            "ContentType": "text/plain",
        }
        project = Project.objects.create(name="Current", identifier="CUR", workspace=workspace)
        ProjectMember.objects.create(project=project, workspace=workspace, member=create_user, role=20)
        page = Page.objects.create(name="Page", workspace=workspace, owned_by=create_user)
        ProjectPage.objects.create(project=project, page=page, workspace=workspace)

        create_response = session_client.post(
            f"/api/assets/v2/workspaces/{workspace.slug}/projects/{project.id}/",
            {
                "entity_type": FileAsset.EntityTypeContext.PAGE_DESCRIPTION,
                "entity_identifier": str(page.id),
                "name": "page.png",
                "type": "image/png",
                "size": 256,
            },
            format="json",
        )
        assert create_response.status_code == status.HTTP_200_OK

        asset_id = create_response.data["asset_id"]
        finalize_response = session_client.patch(
            f"/api/assets/v2/workspaces/{workspace.slug}/projects/{project.id}/{asset_id}/",
            {},
            format="json",
        )

        assert finalize_response.status_code == status.HTTP_400_BAD_REQUEST
        asset = FileAsset.objects.get(id=asset_id)
        assert asset.is_uploaded is False
        assert asset.storage_metadata == {}
