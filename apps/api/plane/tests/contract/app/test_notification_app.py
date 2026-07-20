# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for the workspace notification endpoints.

Guards the invariant that the unread-count endpoint and the list endpoint
agree on which entity types exist: every entity_name the badge counts must
also be renderable by the list, otherwise the bell shows "N unread" over an
empty panel (the agent_run regression).
"""

import uuid

import pytest
from rest_framework import status

from plane.db.models import Notification


def _make_notification(workspace, receiver, *, entity_name, sender, data=None, title="Test notification"):
    return Notification.objects.create(
        workspace=workspace,
        project=None,
        entity_identifier=uuid.uuid4(),
        entity_name=entity_name,
        title=title,
        sender=sender,
        receiver=receiver,
        data=data,
    )


@pytest.mark.contract
class TestNotificationListAndUnreadCount:
    @pytest.mark.django_db
    def test_agent_run_notifications_are_listed(self, session_client, workspace, create_user):
        _make_notification(
            workspace,
            create_user,
            entity_name="issue",
            sender="in_app:issue_activities",
            data={"issue_activity": {"field": "assignees"}},
        )
        _make_notification(
            workspace,
            create_user,
            entity_name="agent_run",
            sender="agent",
            data={"run_id": str(uuid.uuid4()), "issue_id": str(uuid.uuid4()), "kind": "needs_input", "message": "?"},
            title="Triage Bot needs your input on task: Fix login",
        )
        # entity type the list endpoint cannot render — must stay invisible
        _make_notification(workspace, create_user, entity_name="page", sender="in_app:page_activities")

        response = session_client.get(f"/api/workspaces/{workspace.slug}/users/notifications/")
        assert response.status_code == status.HTTP_200_OK
        listed_entities = sorted(n["entity_name"] for n in response.data)
        assert listed_entities == ["agent_run", "issue"]

    @pytest.mark.django_db
    def test_unread_count_matches_listable_entities(self, session_client, workspace, create_user):
        _make_notification(
            workspace,
            create_user,
            entity_name="issue",
            sender="in_app:issue_activities",
        )
        _make_notification(
            workspace,
            create_user,
            entity_name="agent_run",
            sender="agent",
            data={"run_id": str(uuid.uuid4()), "kind": "completed"},
        )
        # unlistable entity type must not inflate the badge count
        _make_notification(workspace, create_user, entity_name="page", sender="in_app:page_activities")
        # mention rides the separate mention counter, not the total
        _make_notification(
            workspace,
            create_user,
            entity_name="issue",
            sender="in_app:issue_activities:mentioned",
        )

        response = session_client.get(f"/api/workspaces/{workspace.slug}/users/notifications/unread/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["total_unread_notifications_count"] == 2
        assert response.data["mention_unread_notifications_count"] == 1
