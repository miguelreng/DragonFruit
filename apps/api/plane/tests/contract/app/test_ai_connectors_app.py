# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status

from plane.db.models import AIConnectorEvent, Issue, Project, WorkspaceAIConnector


@pytest.mark.contract
class TestAIConnectorsAPI:
    @pytest.mark.django_db
    def test_connector_crud_and_test_endpoint(self, session_client, workspace):
        project = Project.objects.create(
            name="Inbox",
            workspace=workspace,
            identifier="INB",
            network=2,
            created_by=workspace.owner,
        )

        create_url = f"/api/workspaces/{workspace.slug}/integrations/ai-connectors/"
        payload = {
            "provider": "chatgpt",
            "auth_mode": "api_key",
            "external_workspace_id": "ext-workspace-1",
            "external_workspace_name": "External Workspace",
            "external_user_id": "user-1",
            "default_project": str(project.id),
            "secret": "super-secret",
            "metadata": {"scope": "messages"},
        }

        create_response = session_client.post(create_url, payload, format="json")
        assert create_response.status_code == status.HTTP_201_CREATED
        connector_id = create_response.data["id"]

        list_response = session_client.get(create_url)
        assert list_response.status_code == status.HTTP_200_OK
        assert len(list_response.data) == 1

        test_response = session_client.post(
            f"/api/workspaces/{workspace.slug}/integrations/ai-connectors/{connector_id}/test/",
            {},
            format="json",
        )
        assert test_response.status_code == status.HTTP_200_OK
        assert test_response.data["ok"] is True

        patch_response = session_client.patch(
            f"/api/workspaces/{workspace.slug}/integrations/ai-connectors/{connector_id}/",
            {"status": "paused"},
            format="json",
        )
        assert patch_response.status_code == status.HTTP_200_OK
        assert patch_response.data["status"] == "paused"

        delete_response = session_client.delete(
            f"/api/workspaces/{workspace.slug}/integrations/ai-connectors/{connector_id}/"
        )
        assert delete_response.status_code == status.HTTP_204_NO_CONTENT

        connector = WorkspaceAIConnector.objects.get(id=connector_id)
        assert connector.deleted_at is not None
        assert connector.status == "revoked"

    @pytest.mark.django_db
    def test_inbound_creates_issue_and_is_idempotent(self, session_client, workspace):
        project = Project.objects.create(
            name="Inbox",
            workspace=workspace,
            identifier="INB",
            network=2,
            created_by=workspace.owner,
        )

        create_response = session_client.post(
            f"/api/workspaces/{workspace.slug}/integrations/ai-connectors/",
            {
                "provider": "claude",
                "auth_mode": "token",
                "external_workspace_id": "ext-workspace-2",
                "external_workspace_name": "Claude Team",
                "external_user_id": "user-2",
                "default_project": str(project.id),
                "secret": "connector-shared-secret",
            },
            format="json",
        )
        assert create_response.status_code == status.HTTP_201_CREATED
        connector_id = create_response.data["id"]

        inbound_url = "/api/integrations/inbound/claude/"
        inbound_payload = {
            "source_workspace_id": "ext-workspace-2",
            "user_id": "user-2",
            "source_message_id": "msg-1001",
            "content": "Create issue from Claude workspace",
            "metadata": {"conversation": "abc"},
            "actor": {"id": "user-2", "name": "Dev User"},
        }

        first_response = session_client.post(
            inbound_url,
            inbound_payload,
            format="json",
            HTTP_X_DRAGONFRUIT_CONNECTOR_SECRET="connector-shared-secret",
        )
        assert first_response.status_code == status.HTTP_202_ACCEPTED
        assert first_response.data["accepted"] is True
        assert first_response.data["enqueued"] is True

        second_response = session_client.post(
            inbound_url,
            inbound_payload,
            format="json",
            HTTP_X_DRAGONFRUIT_CONNECTOR_SECRET="connector-shared-secret",
        )
        assert second_response.status_code == status.HTTP_200_OK
        assert second_response.data["accepted"] is True
        assert second_response.data["enqueued"] is False

        assert Issue.objects.filter(project=project, name="Create issue from Claude workspace").count() == 1
        events = AIConnectorEvent.objects.filter(connector_id=connector_id, source_message_id="msg-1001")
        assert events.count() == 1
        assert events.first().status == "processed"
