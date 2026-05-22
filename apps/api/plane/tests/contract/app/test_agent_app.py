# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status

from plane.db.models import Agent, WorkspaceMember


@pytest.mark.contract
class TestAgentAPI:
    @pytest.mark.django_db
    def test_delete_agent_soft_deletes_and_deactivates_bot(self, session_client, workspace):
        create_url = f"/api/workspaces/{workspace.slug}/agents/"
        create_payload = {
            "name": "Triage Bot",
            "description": "Bot for tests",
        }

        create_response = session_client.post(create_url, create_payload, format="json")
        assert create_response.status_code == status.HTTP_201_CREATED
        agent_id = create_response.data["id"]

        delete_url = f"/api/workspaces/{workspace.slug}/agents/{agent_id}/"
        delete_response = session_client.delete(delete_url)
        assert delete_response.status_code == status.HTTP_204_NO_CONTENT

        agent = Agent.objects.get(id=agent_id)
        assert agent.deleted_at is not None
        assert agent.bot_user.is_active is False
        assert (
            WorkspaceMember.objects.filter(
                workspace=workspace,
                member=agent.bot_user,
                is_active=True,
            ).exists()
            is False
        )
