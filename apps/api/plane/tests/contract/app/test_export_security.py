# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import ExporterHistory, User, WorkspaceMember


@pytest.mark.contract
class TestExportHistorySecurity:
    @pytest.mark.django_db
    def test_member_only_sees_own_export_urls(self, workspace, create_user):
        own_export = ExporterHistory.objects.create(
            workspace=workspace,
            project=[],
            initiated_by=create_user,
            provider="csv",
            type="issue_exports",
            status="completed",
            url="https://storage.example/own-export",
        )
        other_user = User.objects.create(
            email="other-exporter@plane.so",
            username="other-exporter",
        )
        WorkspaceMember.objects.create(
            workspace=workspace,
            member=other_user,
            role=15,
        )
        ExporterHistory.objects.create(
            workspace=workspace,
            project=[],
            initiated_by=other_user,
            provider="csv",
            type="issue_exports",
            status="completed",
            url="https://storage.example/private-export",
        )

        client = APIClient()
        client.force_authenticate(user=create_user)
        response = client.get(
            f"/api/workspaces/{workspace.slug}/export-issues/",
            {"per_page": 10, "cursor": "10:0:0"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert [str(item["id"]) for item in response.data["results"]] == [str(own_export.id)]
        assert "private-export" not in str(response.data)

    @pytest.mark.django_db
    @override_settings(EXPORT_MAX_PENDING_PER_USER=1)
    def test_rejects_when_user_already_has_max_pending_exports(self, workspace, create_user):
        ExporterHistory.objects.create(
            workspace=workspace,
            project=[],
            initiated_by=create_user,
            provider="csv",
            type="issue_exports",
            status="processing",
        )
        client = APIClient()
        client.force_authenticate(user=create_user)

        response = client.post(
            f"/api/workspaces/{workspace.slug}/export-issues/",
            {"provider": "csv", "project": []},
            format="json",
        )

        assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
