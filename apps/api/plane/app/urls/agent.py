# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views.agent import (
    AgentDetailEndpoint,
    AgentEndpoint,
    AgentRunListEndpoint,
    AgentStopEndpoint,
)


urlpatterns = [
    path(
        "workspaces/<str:slug>/agents/",
        AgentEndpoint.as_view(),
        name="workspace-agents",
    ),
    path(
        "workspaces/<str:slug>/agents/<uuid:agent_id>/",
        AgentDetailEndpoint.as_view(),
        name="workspace-agent-detail",
    ),
    path(
        "workspaces/<str:slug>/agents/<uuid:agent_id>/runs/",
        AgentRunListEndpoint.as_view(),
        name="workspace-agent-runs",
    ),
    path(
        "workspaces/<str:slug>/agents/<uuid:agent_id>/stop/",
        AgentStopEndpoint.as_view(),
        name="workspace-agent-stop",
    ),
]
