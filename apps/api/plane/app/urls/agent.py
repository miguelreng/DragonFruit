# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views.agent import (
    AgentCostSummaryEndpoint,
    AgentDetailEndpoint,
    AgentDraftCommentApproveEndpoint,
    AgentDraftCommentDiscardEndpoint,
    AgentEndpoint,
    AgentRunCancelEndpoint,
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
        "workspaces/<str:slug>/agents/cost-summary/",
        AgentCostSummaryEndpoint.as_view(),
        name="workspace-agent-cost-summary",
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
        "workspaces/<str:slug>/agents/<uuid:agent_id>/runs/<uuid:run_id>/cancel/",
        AgentRunCancelEndpoint.as_view(),
        name="workspace-agent-run-cancel",
    ),
    path(
        "workspaces/<str:slug>/agents/<uuid:agent_id>/stop/",
        AgentStopEndpoint.as_view(),
        name="workspace-agent-stop",
    ),
    path(
        "workspaces/<str:slug>/agent-drafts/<str:kind>/<uuid:comment_id>/approve/",
        AgentDraftCommentApproveEndpoint.as_view(),
        name="workspace-agent-draft-approve",
    ),
    path(
        "workspaces/<str:slug>/agent-drafts/<str:kind>/<uuid:comment_id>/discard/",
        AgentDraftCommentDiscardEndpoint.as_view(),
        name="workspace-agent-draft-discard",
    ),
]
