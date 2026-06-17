# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views.mcp import MCPEndpoint


class ReadOnlyMCPEndpoint(MCPEndpoint):
    read_only = True


urlpatterns = [
    path(
        "workspaces/<str:slug>/mcp/",
        MCPEndpoint.as_view(),
        name="workspace-mcp",
    ),
    path(
        "workspaces/<str:slug>/mcp/read-only/",
        ReadOnlyMCPEndpoint.as_view(),
        name="workspace-mcp-read-only",
    ),
]
