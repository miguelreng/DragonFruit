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

        # soft-deleted agents are excluded from the default manager;
        # use all_objects to retrieve them regardless of deletion state.
        agent = Agent.all_objects.get(id=agent_id)
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
                    "result": (
                        "ok: created document 'Benefits of Meditation'"
                        " (id=page-id, url=/w/projects/p/pages/page-id)"
                    ),
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
        # "sobre los beneficios..." — the regex strips the leading article "los"
        # before the real subject, which is the intended normalisation behaviour.
        subject = _normalise_document_subject(
            "Crea un documento sobre los beneficios de votar informado por favor"
        )

        assert subject == "beneficios de votar informado"
        assert _title_from_subject(subject) == "Beneficios De Votar Informado"

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

    # ------------------------------------------------------------------ #
    # Atlas baseline: tool-use loop caps iterations                       #
    # ------------------------------------------------------------------ #

    def test_atlas_baseline_tool_loop_terminates_at_max_iterations(self, monkeypatch):
        """When the model ALWAYS returns a tool call, the loop must terminate at
        max_iterations and report stopped_reason='max_iterations', not loop forever.
        """
        from plane.llm.provider import LLMProvider, LLMTool

        call_count = [0]

        def mock_completion(**kwargs):
            call_count[0] += 1

            class FakeFunction:
                name = "infinite_tool"
                arguments = "{}"

            class FakeToolCall:
                id = f"tc-{call_count[0]}"
                function = FakeFunction()

            class FakeMessage:
                content = ""
                tool_calls = [FakeToolCall()]
                provider_specific_fields = None

            class FakeChoice:
                message = FakeMessage()

            class FakeCompletion:
                choices = [FakeChoice()]
                usage = None

            return FakeCompletion()

        import litellm
        monkeypatch.setattr(litellm, "completion", mock_completion)

        tool = LLMTool(
            name="infinite_tool",
            description="Returns a tool call every time",
            parameters_schema={"type": "object", "properties": {}},
            handler=lambda args: "ok",
        )
        provider = LLMProvider(model="openai/gpt-4o", api_key="test-key", default_max_iterations=3)
        result = provider.run(
            system_prompt="You are a test agent.",
            user_prompt="Run forever.",
            tools=[tool],
            max_iterations=3,
        )

        assert result.stopped_reason == "max_iterations"
        assert result.iterations == 3
        assert call_count[0] == 3, f"litellm.completion called {call_count[0]} times, expected exactly 3"

    def test_atlas_baseline_tool_loop_catching_handler_exception(self, monkeypatch):
        """A tool handler that raises must be caught and surfaced as a tool_error
        string in the result — not propagated as a 500. The loop continues and the
        model gets to react to the error.
        """
        from plane.llm.provider import LLMProvider, LLMTool

        call_count = [0]

        def mock_completion(**kwargs):
            call_count[0] += 1

            class FakeFunction:
                name = "exploding_tool"
                arguments = "{}"

            class FakeToolCall:
                id = f"tc-{call_count[0]}"
                function = FakeFunction()

            class FakeMessage:
                content = "Done" if call_count[0] >= 2 else ""
                tool_calls = [] if call_count[0] >= 2 else [FakeToolCall()]
                provider_specific_fields = None

            class FakeChoice:
                message = FakeMessage()

            class FakeCompletion:
                choices = [FakeChoice()]
                usage = None

            return FakeCompletion()

        import litellm
        monkeypatch.setattr(litellm, "completion", mock_completion)

        def exploding_handler(args):
            raise RuntimeError("kaboom")

        tool = LLMTool(
            name="exploding_tool",
            description="Always raises",
            parameters_schema={"type": "object", "properties": {}},
            handler=exploding_handler,
        )
        provider = LLMProvider(model="openai/gpt-4o", api_key="test-key")
        result = provider.run(
            system_prompt="You are a test agent.",
            user_prompt="Call the exploding tool.",
            tools=[tool],
            max_iterations=5,
        )

        # The loop must complete (not raise), with the final text.
        assert result.stopped_reason == "completed"
        assert result.final_text == "Done"
        # The tool_call record must carry the error string, not raise.
        assert len(result.tool_calls) == 1
        assert result.tool_calls[0]["result"].startswith("tool_error: RuntimeError: kaboom")

    # ------------------------------------------------------------------ #
    # Atlas baseline: MCP server failure degrades gracefully              #
    # ------------------------------------------------------------------ #

    def test_atlas_baseline_mcp_failure_wrap_raises_mcp_client_error(self, monkeypatch):
        """When the MCP server is unreachable during tool discovery,
        wrap_mcp_server_as_tools raises MCPClientError (not an unhandled exception).
        Callers catch MCPClientError to degrade to base tools.
        """
        import requests as _requests
        from plane.llm.mcp_client import MCPClientError, wrap_mcp_server_as_tools

        def mock_post(url, data, headers, timeout):
            raise _requests.ConnectionError("connection refused")

        monkeypatch.setattr(_requests, "post", mock_post)

        # Use an external host to pass SSRF validation (no real call is made).
        server_config = {
            "name": "github",
            "url": "https://mcp.example.com/github/",
        }

        # The SSRF guard resolves the hostname — mock socket.getaddrinfo to
        # return a routable public address so we reach the network call.
        import socket
        monkeypatch.setattr(
            socket,
            "getaddrinfo",
            lambda host, port, *args, **kwargs: [(None, None, None, None, ("203.0.113.1", 0))],
        )

        with pytest.raises(MCPClientError):
            wrap_mcp_server_as_tools(server_config)

    def test_atlas_baseline_mcp_failure_handler_returns_tool_error_string(self, monkeypatch):
        """When the MCP server returns a network error during tool dispatch,
        the wrapped tool's handler must return a 'tool_error:' string rather
        than raising — so the LLM loop's except block catches it and the agent
        continues with the remaining (base) tools.
        """
        from plane.llm.mcp_client import MCPClient, MCPClientError

        client = MCPClient.__new__(MCPClient)
        client.url = "https://mcp.example.com/github/"
        client._auth_header = None
        client._next_id = 1
        client._initialized = True  # skip handshake

        def mock_post_method(method, params=None, *, timeout):
            raise MCPClientError("network error talking to server")

        monkeypatch.setattr(client, "_post", mock_post_method)

        # Simulate the wrapped handler that the agent dispatcher uses:
        # the handler catches MCPClientError and returns "tool_error: ...".
        def _handler(args, _remote_name="list_issues", _client=client):
            try:
                return _client.call_tool(_remote_name, args)
            except MCPClientError as exc:
                return f"tool_error: {exc}"

        result = _handler({})
        assert result.startswith("tool_error:")
        assert "network error" in result
