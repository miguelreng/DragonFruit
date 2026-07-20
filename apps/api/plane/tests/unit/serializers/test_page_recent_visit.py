# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only

import pytest

from plane.app.serializers.workspace import PageRecentVisitSerializer
from plane.db.models import Page, User, Workspace


@pytest.mark.unit
class TestPageRecentVisitSerializer:
    def test_includes_page_type_for_typed_recent_icons(self, db):
        user = User.objects.create(email="page-recent@example.com", first_name="Page", last_name="Recent")
        workspace = Workspace.objects.create(name="Test Workspace", slug="page-recent-workspace", owner=user)
        page = Page.objects.create(
            workspace=workspace,
            owned_by=user,
            name="Financial plan",
            page_type=Page.PAGE_TYPE_SHEET,
        )

        serialized_data = PageRecentVisitSerializer(page).data

        assert serialized_data["page_type"] == Page.PAGE_TYPE_SHEET
