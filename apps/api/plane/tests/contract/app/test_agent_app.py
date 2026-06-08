# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status

from plane.app.views.agent.chat import (
    _build_fallback_document_html,
    _looks_like_document_request,
    _make_create_document_tool,
    _normalise_document_subject,
    _should_use_agent_tools,
    _successful_tool_confirmation,
    _title_from_subject,
)
from plane.db.models import Agent, Page, Project, ProjectPage, WorkspaceMember


@pytest.mark.contract
class TestAgentAPI:
    @pytest.mark.django_db
    def test_delete_agent_soft_deletes_and_deactivates_bot(self, session_client, workspace):
        create_url = f"/api/workspaces/{workspace.slug}/agents/"
        create_payload = {
            "name": "Triage Bot",
            "description": "Bot for tests",
        }

        create_response = session_client.post(create_url, create_payload, format="json")
        assert create_response.status_code == status.HTTP_201_CREATED
        agent_id = create_response.data["id"]

        delete_url = f"/api/workspaces/{workspace.slug}/agents/{agent_id}/"
        delete_response = session_client.delete(delete_url)
        assert delete_response.status_code == status.HTTP_204_NO_CONTENT

        agent = Agent.objects.get(id=agent_id)
        assert agent.deleted_at is not None
        assert agent.bot_user.is_active is False
        assert (
            WorkspaceMember.objects.filter(
                workspace=workspace,
                member=agent.bot_user,
                is_active=True,
            ).exists()
            is False
        )

    @pytest.mark.django_db
    def test_chat_create_document_tool_creates_project_doc(self, workspace, create_user):
        project = Project.objects.create(name="Docs Project", identifier="DP", workspace=workspace)
        tool = _make_create_document_tool(
            workspace=workspace,
            user=create_user,
            project_id=str(project.id),
        )

        result = tool.handler(
            {
                "title": "Benefits of Meditation",
                "description_html": (
                    "<h1>Benefits of Meditation</h1>"
                    "<p>Meditation can support attention and stress regulation.</p>"
                    "<h2>Sources</h2>"
                    '<ul><li><a href="https://www.nccih.nih.gov/">NCCIH</a></li></ul>'
                ),
            }
        )

        page = Page.objects.get(name="Benefits of Meditation")
        assert result.startswith("ok: created document")
        assert page.page_type == Page.PAGE_TYPE_DOC
        assert page.workspace == workspace
        assert page.owned_by == create_user
        assert "Sources" in page.description_html
        assert ProjectPage.objects.filter(project=project, page=page, workspace=workspace).exists()

    @pytest.mark.django_db
    def test_chat_create_document_tool_requires_project_context(self, workspace, create_user):
        tool = _make_create_document_tool(workspace=workspace, user=create_user, project_id=None)

        result = tool.handler({"title": "Benefits of Meditation", "description_html": "<p>Draft</p>"})

        assert result.startswith("tool_error: no project is currently open")
        assert Page.objects.filter(name="Benefits of Meditation").exists() is False

    def test_chat_prefers_created_document_confirmation_from_successful_tool(self):
        class Result:
            tool_calls = [
                {
                    "name": "create_document",
                    "arguments": {"title": "Benefits of Meditation"},
                    "result": "ok: created document 'Benefits of Meditation' (id=page-id, url=/w/projects/p/pages/page-id)",
                }
            ]

        assert (
            _successful_tool_confirmation(Result(), "create_document")
            == "Created [Benefits of Meditation](/w/projects/p/pages/page-id)."
        )

    def test_chat_document_subject_cleanup_handles_user_phrasing(self):
        subject = _normalise_document_subject(
            "Can you create a document where displayed the benefits of meditating please"
        )

        assert subject == "benefits of meditation"
        assert _title_from_subject(subject) == "Benefits of Meditation"

    def test_chat_document_subject_cleanup_handles_spanish_phrasing(self):
        subject = _normalise_document_subject(
            "Crea un documento sobre los beneficios de votar informado por favor"
        )

        assert subject == "los beneficios de votar informado"
        assert _title_from_subject(subject) == "Los Beneficios De Votar Informado"

    def test_chat_fallback_document_writes_body_and_sources(self):
        html = _build_fallback_document_html(
            title="Benefits of Meditation",
            subject="benefits of meditation",
            research_results=[
                {
                    "title": "Mayo Clinic: Meditation, a simple fast way to reduce stress",
                    "url": "https://www.mayoclinic.org/tests-procedures/meditation/in-depth/meditation/art-20045858",
                }
            ],
        )

        assert "<h1>Benefits of Meditation</h1>" in html
        assert "Reduced stress" in html
        assert "<h2>Sources</h2>" in html
        assert "mayoclinic.org" in html

    @pytest.mark.parametrize(
        ("prompt", "expected"),
        [
            ("create a document about launch plan", True),
            ("draft a page for onboarding", True),
            ("crea un documento sobre plan de lanzamiento", True),
            ("what document explains onboarding?", False),
            ("que documento explica onboarding?", False),
            ("get the launch notes from Project X", False),
            ("show me the page about pricing", False),
        ],
    )
    def test_chat_document_request_detector_requires_explicit_creation(self, prompt, expected):
        assert _looks_like_document_request(prompt) is expected

    @pytest.mark.parametrize(
        ("tool_mode", "expected"),
        [
            ("none", False),
            ("NONE", False),
            ("", True),
            (None, True),
            ("auto", True),
        ],
    )
    def test_chat_tool_mode_can_disable_agent_tools(self, tool_mode, expected):
        assert _should_use_agent_tools(tool_mode) is expected
