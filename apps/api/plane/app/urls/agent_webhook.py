# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    WorkspaceAgentWebhookDispatchEndpoint,
    WorkspaceAgentWebhookEndpoint,
)


urlpatterns = [
    path(
        "workspaces/<str:slug>/agent-webhook/",
        WorkspaceAgentWebhookEndpoint.as_view(),
        name="workspace-agent-webhook",
    ),
    path(
        "workspaces/<str:slug>/agent-webhook/dispatch/",
        WorkspaceAgentWebhookDispatchEndpoint.as_view(),
        name="workspace-agent-webhook-dispatch",
    ),
]
