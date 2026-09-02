# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from types import SimpleNamespace

import pytest
from django.core.cache import cache
from rest_framework.test import APIRequestFactory

from plane.throttles.resource import AgentChatRateThrottle, AssetUploadRateThrottle


@pytest.mark.unit
class TestResourceThrottles:
    def setup_method(self):
        cache.clear()

    def test_agent_chat_is_scoped_by_user_and_workspace(self):
        request = APIRequestFactory().post("/")
        request.user = SimpleNamespace(is_authenticated=True, pk="user-1")
        first_view = SimpleNamespace(kwargs={"slug": "workspace-a"})
        second_view = SimpleNamespace(kwargs={"slug": "workspace-b"})
        throttle = AgentChatRateThrottle()

        assert throttle.get_cache_key(request, first_view) != throttle.get_cache_key(request, second_view)

    def test_asset_throttle_only_applies_to_upload_issuance(self):
        view = SimpleNamespace(kwargs={"slug": "workspace-a"})
        throttle = AssetUploadRateThrottle()

        get_request = APIRequestFactory().get("/")
        get_request.user = SimpleNamespace(is_authenticated=True, pk="user-1")
        post_request = APIRequestFactory().post("/")
        post_request.user = SimpleNamespace(is_authenticated=True, pk="user-1")

        assert throttle.get_cache_key(get_request, view) is None
        assert throttle.get_cache_key(post_request, view) is not None
