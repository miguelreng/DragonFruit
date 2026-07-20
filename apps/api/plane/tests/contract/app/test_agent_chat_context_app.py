# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status
from rest_framework.test import APIRequestFactory, force_authenticate

from plane.app.views.agent.chat import AgentChatSessionDetailEndpoint
from plane.db.models import Agent, AgentChatSession, Page, Project, ProjectMember, ProjectPage


@pytest.fixture
def atlas_context_rows(workspace, create_user, create_bot_user):
    project = Project.objects.create(
        workspace=workspace,
        name="Launch",
        identifier="LAUNCH",
        created_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    page = Page.objects.create(
        workspace=workspace,
        name="Launch plan",
        owned_by=create_user,
        created_by=create_user,
    )
    ProjectPage.objects.create(workspace=workspace, project=project, page=page)
    agent = Agent.objects.create(workspace=workspace, bot_user=create_bot_user, name="Atlas")
    session = AgentChatSession.objects.create(
        workspace=workspace,
        user=create_user,
        agent=agent,
        title="Launch chat",
    )
    return project, page, session


@pytest.mark.django_db
def test_personal_chat_context_can_be_persisted_for_cross_device_handoff(workspace, create_user, atlas_context_rows):
    project, page, session = atlas_context_rows
    request = APIRequestFactory().patch(
        "/",
        {
            "context_project_id": str(project.id),
            "context_page_id": str(page.id),
            "context_updated_by_surface": "web",
        },
        format="json",
    )
    force_authenticate(request, user=create_user)

    response = AgentChatSessionDetailEndpoint.as_view()(
        request,
        slug=workspace.slug,
        session_id=session.id,
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data["context_project"] == str(project.id)
    assert response.data["context_project_name"] == "Launch"
    assert response.data["context_page"] == str(page.id)
    assert response.data["context_page_name"] == "Launch plan"
    assert response.data["context_updated_by_surface"] == "web"
    assert response.data["context_updated_at"] is not None


@pytest.mark.django_db
def test_mobile_can_explicitly_clear_a_web_context(workspace, create_user, atlas_context_rows):
    project, page, session = atlas_context_rows
    session.context_project = project
    session.context_page = page
    session.context_updated_by_surface = "web"
    session.save(update_fields=["context_project", "context_page", "context_updated_by_surface"])
    request = APIRequestFactory().patch(
        "/",
        {
            "context_project_id": None,
            "context_page_id": None,
            "context_updated_by_surface": "mobile",
        },
        format="json",
    )
    force_authenticate(request, user=create_user)

    response = AgentChatSessionDetailEndpoint.as_view()(
        request,
        slug=workspace.slug,
        session_id=session.id,
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data["context_project"] is None
    assert response.data["context_page"] is None
    assert response.data["context_updated_by_surface"] == "mobile"
