# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    AIConnectorInboundEndpoint,
    WorkspaceAIConnectorEndpoint,
    WorkspaceAIConnectorEventsEndpoint,
    WorkspaceAIConnectorIngestEndpoint,
    WorkspaceAIConnectorTestEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/integrations/ai-connectors/",
        WorkspaceAIConnectorEndpoint.as_view(),
        name="workspace-ai-connectors",
    ),
    path(
        "workspaces/<str:slug>/integrations/ai-connectors/<uuid:connector_id>/",
        WorkspaceAIConnectorEndpoint.as_view(),
        name="workspace-ai-connectors-detail",
    ),
    path(
        "workspaces/<str:slug>/integrations/ai-connectors/<uuid:connector_id>/events/",
        WorkspaceAIConnectorEventsEndpoint.as_view(),
        name="workspace-ai-connectors-events",
    ),
    path(
        "workspaces/<str:slug>/integrations/ai-connectors/<uuid:connector_id>/test/",
        WorkspaceAIConnectorTestEndpoint.as_view(),
        name="workspace-ai-connectors-test",
    ),
    path(
        "workspaces/<str:slug>/integrations/ai-connectors/ingest/",
        WorkspaceAIConnectorIngestEndpoint.as_view(),
        name="workspace-ai-connectors-ingest",
    ),
    path(
        "integrations/inbound/<str:provider>/",
        AIConnectorInboundEndpoint.as_view(),
        name="workspace-ai-connectors-inbound",
    ),
]
