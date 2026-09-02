# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import os

from rest_framework.throttling import SimpleRateThrottle


class UserWorkspaceRateThrottle(SimpleRateThrottle):
    """Rate limit a user independently inside each workspace."""

    def get_cache_key(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return None

        workspace_slug = view.kwargs.get("slug", "global")
        return self.cache_format % {
            "scope": self.scope,
            "ident": f"{request.user.pk}:{workspace_slug}",
        }


class AgentChatRateThrottle(UserWorkspaceRateThrottle):
    scope = "agent_chat"
    rate = os.environ.get("AGENT_CHAT_RATE_LIMIT", "10/minute")


class ExportRateThrottle(UserWorkspaceRateThrottle):
    scope = "export"
    rate = os.environ.get("EXPORT_RATE_LIMIT", "5/hour")


class AssetUploadRateThrottle(UserWorkspaceRateThrottle):
    scope = "asset_upload"
    rate = os.environ.get("ASSET_UPLOAD_RATE_LIMIT", "30/minute")

    def get_cache_key(self, request, view):
        if request.method != "POST":
            return None
        return super().get_cache_key(request, view)
