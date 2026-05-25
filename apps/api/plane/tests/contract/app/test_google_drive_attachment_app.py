# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status

from plane.db.models import FileAsset, Issue, Project, ProjectMember


@pytest.mark.contract
class TestGoogleDriveAttachmentAPI:
    @pytest.mark.django_db
    def test_google_drive_attachment_create_and_duplicate(self, session_client, workspace, create_user, monkeypatch):
        monkeypatch.setattr("plane.app.views.issue.attachment.issue_activity.delay", lambda *args, **kwargs: None)

        project = Project.objects.create(name="Research", identifier="RES", workspace=workspace, created_by=create_user)
        ProjectMember.objects.create(project=project, workspace=workspace, member=create_user, role=20)
        issue = Issue.objects.create(name="Collect references", project=project, workspace=workspace, created_by=create_user)

        url = f"/api/assets/v2/workspaces/{workspace.slug}/projects/{project.id}/issues/{issue.id}/attachments/google-drive/"
        payload = {
            "file_id": "drive-file-123",
            "name": "Product brief",
            "mime_type": "application/vnd.google-apps.document",
            "web_view_link": "https://docs.google.com/document/d/drive-file-123/edit",
            "icon_link": "https://drive-thirdparty.googleusercontent.com/icon",
            "thumbnail_link": "https://drive.google.com/thumbnail?id=drive-file-123",
        }

        response = session_client.post(url, payload, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["external_source"] == "google_drive"
        assert response.data["external_id"] == "drive-file-123"
        assert response.data["is_uploaded"] is True
        assert response.data["attributes"]["webViewLink"] == payload["web_view_link"]

        asset = FileAsset.objects.get(id=response.data["id"])
        assert asset.issue_id == issue.id
        assert asset.entity_type == FileAsset.EntityTypeContext.ISSUE_ATTACHMENT

        duplicate_response = session_client.post(url, payload, format="json")

        assert duplicate_response.status_code == status.HTTP_409_CONFLICT
        assert duplicate_response.data["id"] == response.data["id"]
