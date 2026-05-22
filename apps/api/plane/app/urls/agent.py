# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views.agent import (
    AgentChatMessageEndpoint,
    AgentChatSessionDetailEndpoint,
    AgentChatSessionEndpoint,
    AgentCostSummaryEndpoint,
    AgentDetailEndpoint,
    AgentAutomationDetailEndpoint,
    AgentAutomationEndpoint,
    AgentAutomationCloneEndpoint,
    AgentAutomationTestRunEndpoint,
    AgentDraftCommentApproveEndpoint,
    AgentDraftCommentDiscardEndpoint,
    AgentEndpoint,
    AgentMemoryDetailEndpoint,
    AgentMemoryEndpoint,
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
        "workspaces/<str:slug>/agent-automations/",
        AgentAutomationEndpoint.as_view(),
        name="workspace-agent-automations",
    ),
    path(
        "workspaces/<str:slug>/agent-automations/<uuid:automation_id>/",
        AgentAutomationDetailEndpoint.as_view(),
        name="workspace-agent-automation-detail",
    ),
    path(
        "workspaces/<str:slug>/agent-automations/<uuid:automation_id>/clone/",
        AgentAutomationCloneEndpoint.as_view(),
        name="workspace-agent-automation-clone",
    ),
    path(
        "workspaces/<str:slug>/agent-automations/<uuid:automation_id>/test/",
        AgentAutomationTestRunEndpoint.as_view(),
        name="workspace-agent-automation-test",
    ),
    path(
        "workspaces/<str:slug>/agent-memory/",
        AgentMemoryEndpoint.as_view(),
        name="workspace-agent-memory",
    ),
    path(
        "workspaces/<str:slug>/agent-memory/<uuid:memory_id>/",
        AgentMemoryDetailEndpoint.as_view(),
        name="workspace-agent-memory-detail",
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
    # Topbar "Talk to AI" — per-user chat sessions with any agent.
    path(
        "workspaces/<str:slug>/agent-chats/sessions/",
        AgentChatSessionEndpoint.as_view(),
        name="workspace-agent-chat-sessions",
    ),
    path(
        "workspaces/<str:slug>/agent-chats/sessions/<uuid:session_id>/",
        AgentChatSessionDetailEndpoint.as_view(),
        name="workspace-agent-chat-session-detail",
    ),
    path(
        "workspaces/<str:slug>/agent-chats/sessions/<uuid:session_id>/messages/",
        AgentChatMessageEndpoint.as_view(),
        name="workspace-agent-chat-messages",
    ),
]
