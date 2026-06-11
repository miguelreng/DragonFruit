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


# ------------------------------------------------------------------ #
# Helpers shared by resume tests                                      #
# ------------------------------------------------------------------ #


def _make_mock_completion(responses):
    """Return a litellm.completion mock that steps through `responses`.

    Each element of `responses` is one of:
      - None              → no tool call, empty text → completes loop
      - str               → no tool call, this text → completes loop
      - (tool_name, args) → one tool call, empty content
    """
    call_count = [0]

    def mock_completion(**kwargs):
        idx = min(call_count[0], len(responses) - 1)
        resp = responses[idx]
        call_count[0] += 1

        if resp is None or isinstance(resp, str):
            text = resp or ""

            class FakeMessage:
                content = text
                tool_calls = []
                provider_specific_fields = None

            class FakeChoice:
                message = FakeMessage()

            class FakeCompletion:
                choices = [FakeChoice()]
                usage = None

            return FakeCompletion()

        # (tool_name, args_dict) tuple
        tool_name, tool_args = resp
        import json

        class FakeFunction:
            name = tool_name
            arguments = json.dumps(tool_args)

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

    return mock_completion


def _make_agent_and_issue(workspace, bot_user):
    """Create a minimal Agent + Issue pair for dispatch tests."""
    from plane.db.models import Agent, Issue, Project, State

    agent = Agent.objects.create(
        workspace=workspace,
        bot_user=bot_user,
        name="Test Bot",
        provider_model="openai/gpt-4o",
        api_key_encrypted="",
    )

    # Minimal project + state.
    project = Project.objects.create(
        name="Test Project",
        identifier="TP",
        workspace=workspace,
        network=0,
    )
    state = State.objects.create(
        name="Open",
        group="started",
        project=project,
        workspace=workspace,
        color="#fff",
    )
    issue = Issue.objects.create(
        name="Test Issue",
        project=project,
        workspace=workspace,
        state=state,
    )
    return agent, issue


@pytest.mark.contract
class TestAgentResumeAPI:
    """Tests for the pausable/resumable agent run flow (plan 017)."""

    # ------------------------------------------------------------------ #
    # Step 2: request_help tool                                           #
    # ------------------------------------------------------------------ #

    @pytest.mark.django_db
    def test_request_help_tool_sets_needs_input_and_posts_comment(
        self, monkeypatch, workspace, create_bot_user
    ):
        """When the model calls request_help, the run enters needs_input and
        a comment is posted on the issue."""
        import litellm
        from plane.bgtasks.agent_dispatch_task import _run_agent_loop
        from plane.db.models import AgentRun, IssueComment

        agent, issue = _make_agent_and_issue(workspace, create_bot_user)

        run = AgentRun.objects.create(
            agent=agent,
            issue=issue,
            trigger_event="assigned",
            status="running",
            tool_calls=[{"kind": "lifecycle", "phase": "run_started", "trigger_event": "assigned"}],
        )

        # Model calls request_help on the first turn, then (if loop continued) returns text.
        mock = _make_mock_completion([
            ("request_help", {"question": "What is the acceptance criterion?"}),
            "Done",
        ])
        monkeypatch.setattr(litellm, "completion", mock)

        # Build a provider directly (bypasses BYOK lookup).
        from plane.llm.provider import LLMProvider
        provider = LLMProvider(model="openai/gpt-4o", api_key="test-key")

        _run_agent_loop(run, provider=provider, agent=agent, issue=issue)

        run.refresh_from_db()
        assert run.status == "needs_input", f"expected needs_input, got {run.status}"
        assert run.pending_request is not None
        assert run.pending_request["kind"] == "question"
        assert "acceptance criterion" in run.pending_request["message"]

        # A comment should have been posted.
        comment_exists = IssueComment.objects.filter(
            issue=issue,
            actor=agent.bot_user,
        ).exists()
        assert comment_exists, "request_help should post a comment"

    @pytest.mark.django_db
    def test_request_help_loop_stops_after_pause(self, monkeypatch, workspace, create_bot_user):
        """After request_help fires, the loop must NOT continue to a second LLM call."""
        import litellm
        from plane.bgtasks.agent_dispatch_task import _run_agent_loop
        from plane.db.models import AgentRun

        agent, issue = _make_agent_and_issue(workspace, create_bot_user)
        run = AgentRun.objects.create(
            agent=agent,
            issue=issue,
            trigger_event="assigned",
            status="running",
            tool_calls=[],
        )

        call_count = [0]
        original_mock = _make_mock_completion([
            ("request_help", {"question": "Need more info?"}),
            "Should never reach this",
        ])

        def counting_mock(**kwargs):
            call_count[0] += 1
            return original_mock(**kwargs)

        monkeypatch.setattr(litellm, "completion", counting_mock)

        from plane.llm.provider import LLMProvider
        provider = LLMProvider(model="openai/gpt-4o", api_key="test-key")

        _run_agent_loop(run, provider=provider, agent=agent, issue=issue)

        # Exactly 1 LLM call: the one that returned request_help. The loop
        # stopped before a second call was made.
        assert call_count[0] == 1, f"expected 1 LLM call, got {call_count[0]}"

    # ------------------------------------------------------------------ #
    # Step 3: approval-gate pauses the run                                #
    # ------------------------------------------------------------------ #

    @pytest.mark.django_db
    def test_approval_gate_pauses_run_without_executing_tool(
        self, monkeypatch, workspace, create_bot_user
    ):
        """When the model calls an ask-gated tool, the run pauses and the
        tool does NOT execute (the real tool's side-effect must not happen)."""
        import litellm
        from plane.bgtasks.agent_dispatch_task import _run_agent_loop
        from plane.db.models import AgentRun

        agent, issue = _make_agent_and_issue(workspace, create_bot_user)

        # configure change_state as ask-gated
        agent.tool_policies = {
            "change_state": "ask",
            "post_comment": "auto",
            "add_label": "auto",
            "search_issues": "auto",
            "list_attachments": "auto",
            "plan_next_steps": "auto",
            "record_step": "auto",
        }
        agent.save()

        run = AgentRun.objects.create(
            agent=agent,
            issue=issue,
            trigger_event="assigned",
            status="running",
            tool_calls=[],
        )

        mock = _make_mock_completion([
            ("change_state", {"state_name": "Done"}),
            "Done",
        ])
        monkeypatch.setattr(litellm, "completion", mock)

        from plane.llm.provider import LLMProvider
        provider = LLMProvider(model="openai/gpt-4o", api_key="test-key")

        original_state = issue.state

        _run_agent_loop(run, provider=provider, agent=agent, issue=issue)

        run.refresh_from_db()
        assert run.status == "needs_input"
        assert run.pending_request is not None
        assert run.pending_request["kind"] == "approval"
        assert run.pending_request["tool"] == "change_state"

        # The issue state must NOT have changed (tool didn't execute).
        issue.refresh_from_db()
        assert issue.state_id == original_state.id, "ask-gated tool must not execute before approval"

    # ------------------------------------------------------------------ #
    # Step 4: resume after question → loop continues and completes        #
    # ------------------------------------------------------------------ #

    @pytest.mark.django_db
    def test_resume_after_question_reruns_loop_to_completion(
        self, monkeypatch, workspace, create_bot_user
    ):
        """After request_help pauses the run, calling resume_agent_run with a
        human_response should re-dispatch the loop which then completes."""
        import litellm
        from plane.bgtasks.agent_dispatch_task import resume_agent_run
        from plane.db.models import AgentRun

        agent, issue = _make_agent_and_issue(workspace, create_bot_user)

        # Simulate a paused run.
        run = AgentRun.objects.create(
            agent=agent,
            issue=issue,
            trigger_event="assigned",
            status="needs_input",
            pending_request={
                "kind": "question",
                "message": "What is the acceptance criterion?",
                "tool": None,
                "arguments": None,
            },
            tool_calls=[{"kind": "lifecycle", "phase": "run_started", "trigger_event": "assigned"}],
        )

        # On resume the loop runs fresh and posts a comment then completes.
        mock = _make_mock_completion([
            ("post_comment", {"comment_html": "<p>Thanks, I'll proceed.</p>"}),
            "All done",
        ])
        monkeypatch.setattr(litellm, "completion", mock)

        # Patch LLMProvider.from_agent to avoid BYOK lookup.
        from plane.llm.provider import LLMProvider

        def mock_from_agent(ag):
            return LLMProvider(model="openai/gpt-4o", api_key="test-key")

        monkeypatch.setattr(LLMProvider, "from_agent", staticmethod(mock_from_agent))

        # Call synchronously (not via Celery in tests).
        resume_agent_run(str(run.id), human_response="The criterion is that the button turns green.")

        run.refresh_from_db()
        assert run.status == "completed", f"expected completed, got {run.status}"
        assert run.pending_request is None

    @pytest.mark.django_db
    def test_resume_approved_executes_tool_then_continues(
        self, monkeypatch, workspace, create_bot_user
    ):
        """When approved=True, the pending tool is executed and then the loop
        continues to completion."""
        import litellm
        from plane.bgtasks.agent_dispatch_task import resume_agent_run
        from plane.db.models import AgentRun, State

        agent, issue = _make_agent_and_issue(workspace, create_bot_user)

        # Create a "Done" state to transition to.
        State.objects.create(
            name="Done",
            group="completed",
            project=issue.project,
            workspace=workspace,
            color="#00ff00",
        )

        run = AgentRun.objects.create(
            agent=agent,
            issue=issue,
            trigger_event="assigned",
            status="needs_input",
            pending_request={
                "kind": "approval",
                "message": "Atlas wants to run `change_state`",
                "tool": "change_state",
                "arguments": {"state_name": "Done"},
            },
            tool_calls=[],
        )

        # After approval, loop resumes with a note and then posts a comment.
        mock = _make_mock_completion([
            ("post_comment", {"comment_html": "<p>State changed.</p>"}),
            "Finished",
        ])
        monkeypatch.setattr(litellm, "completion", mock)

        from plane.llm.provider import LLMProvider

        def mock_from_agent(ag):
            return LLMProvider(model="openai/gpt-4o", api_key="test-key")

        monkeypatch.setattr(LLMProvider, "from_agent", staticmethod(mock_from_agent))

        resume_agent_run(str(run.id), approved=True)

        run.refresh_from_db()
        assert run.status == "completed", f"expected completed, got {run.status}"

        # The state should have been updated by the approved tool execution.
        issue.refresh_from_db()
        assert issue.state.name == "Done", f"expected Done state, got {issue.state.name}"

    @pytest.mark.django_db
    def test_resume_declined_does_not_execute_tool(
        self, monkeypatch, workspace, create_bot_user
    ):
        """When approved=False, the tool must NOT execute and the loop
        continues with a decline note."""
        import litellm
        from plane.bgtasks.agent_dispatch_task import resume_agent_run
        from plane.db.models import AgentRun

        agent, issue = _make_agent_and_issue(workspace, create_bot_user)
        original_state_id = issue.state_id

        run = AgentRun.objects.create(
            agent=agent,
            issue=issue,
            trigger_event="assigned",
            status="needs_input",
            pending_request={
                "kind": "approval",
                "message": "Atlas wants to run `change_state`",
                "tool": "change_state",
                "arguments": {"state_name": "Done"},
            },
            tool_calls=[],
        )

        mock = _make_mock_completion([
            ("post_comment", {"comment_html": "<p>Understood, not changing state.</p>"}),
            "Finished",
        ])
        monkeypatch.setattr(litellm, "completion", mock)

        from plane.llm.provider import LLMProvider

        def mock_from_agent(ag):
            return LLMProvider(model="openai/gpt-4o", api_key="test-key")

        monkeypatch.setattr(LLMProvider, "from_agent", staticmethod(mock_from_agent))

        resume_agent_run(str(run.id), approved=False)

        # State unchanged.
        issue.refresh_from_db()
        assert issue.state_id == original_state_id, "declined approval must not change state"

    @pytest.mark.django_db
    def test_respond_endpoint_returns_202_for_needs_input_run(
        self, monkeypatch, session_client, workspace, create_bot_user
    ):
        """POST /agent-runs/{run_id}/respond/ returns 202 for a needs_input run."""
        from plane.db.models import AgentRun

        agent, issue = _make_agent_and_issue(workspace, create_bot_user)
        run = AgentRun.objects.create(
            agent=agent,
            issue=issue,
            trigger_event="assigned",
            status="needs_input",
            pending_request={"kind": "question", "message": "Need info", "tool": None, "arguments": None},
            tool_calls=[],
        )

        # Patch out the async Celery task so it doesn't actually run.
        from plane.bgtasks import agent_dispatch_task

        called_with = {}

        def mock_delay(run_id, **kwargs):
            called_with.update({"run_id": run_id, **kwargs})

        monkeypatch.setattr(agent_dispatch_task.resume_agent_run, "delay", mock_delay)

        url = f"/api/workspaces/{workspace.slug}/agent-runs/{run.id}/respond/"
        response = session_client.post(url, {"response": "Here is the info"}, format="json")

        assert response.status_code == status.HTTP_202_ACCEPTED
        assert called_with["run_id"] == str(run.id)
        assert called_with.get("human_response") == "Here is the info"

    @pytest.mark.django_db
    def test_respond_endpoint_returns_409_for_non_paused_run(
        self, session_client, workspace, create_bot_user
    ):
        """POST /agent-runs/{run_id}/respond/ returns 409 if run is not needs_input."""
        from plane.db.models import AgentRun

        agent, issue = _make_agent_and_issue(workspace, create_bot_user)
        run = AgentRun.objects.create(
            agent=agent,
            issue=issue,
            trigger_event="assigned",
            status="completed",
            tool_calls=[],
        )

        url = f"/api/workspaces/{workspace.slug}/agent-runs/{run.id}/respond/"
        response = session_client.post(url, {"response": "Too late"}, format="json")
        assert response.status_code == status.HTTP_409_CONFLICT

    # ------------------------------------------------------------------ #
    # Step 5: notifications on needs_input                                #
    # ------------------------------------------------------------------ #

    @pytest.mark.django_db
    def test_needs_input_creates_notification_for_issue_creator(
        self, monkeypatch, workspace, create_user, create_bot_user
    ):
        """Entering needs_input creates a Notification row for the issue creator."""
        import litellm
        from plane.bgtasks.agent_dispatch_task import _run_agent_loop
        from plane.db.models import AgentRun, Notification

        agent, issue = _make_agent_and_issue(workspace, create_bot_user)
        # Set issue creator to create_user (a human, not a bot).
        # Use disable_auto_set_user=True so BaseModel.save() doesn't wipe
        # the created_by field in the no-request test context.
        issue.created_by = create_user
        issue.save(update_fields=["created_by"], disable_auto_set_user=True)

        run = AgentRun.objects.create(
            agent=agent,
            issue=issue,
            trigger_event="assigned",
            status="running",
            tool_calls=[],
        )

        mock = _make_mock_completion([
            ("request_help", {"question": "What should I do?"}),
        ])
        monkeypatch.setattr(litellm, "completion", mock)

        from plane.llm.provider import LLMProvider
        provider = LLMProvider(model="openai/gpt-4o", api_key="test-key")

        _run_agent_loop(run, provider=provider, agent=agent, issue=issue)

        run.refresh_from_db()
        assert run.status == "needs_input"

        # A Notification row must exist for the issue creator.
        notif = Notification.objects.filter(
            receiver=create_user,
            entity_name="agent_run",
        ).first()
        assert notif is not None, "should have created a Notification for the issue creator"
        assert str(run.id) == str(notif.entity_identifier)
        assert notif.data is not None
        assert notif.data.get("kind") == "needs_input"
        assert notif.data.get("run_id") == str(run.id)


@pytest.mark.contract
class TestAgentRunInboxEndpoint:
    """Contract tests for GET /api/workspaces/{slug}/agent-runs/inbox/."""

    # ------------------------------------------------------------------ #
    # Helpers                                                              #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _make_agent_with_bot(workspace, bot_user):
        from plane.db.models import Agent

        bot_user.is_bot = True
        bot_user.save(update_fields=["is_bot"])

        agent = Agent.objects.create(
            workspace=workspace,
            bot_user=bot_user,
            name="Inbox Test Agent",
        )
        return agent

    @staticmethod
    def _make_issue(workspace, created_by):
        from plane.db.models import Issue, Project

        project, _ = Project.objects.get_or_create(
            name="Inbox Project", identifier="INBX", workspace=workspace,
            defaults={"created_by": created_by, "updated_by": created_by},
        )
        issue = Issue(
            name="Inbox test issue",
            project=project,
            workspace=workspace,
            created_by=created_by,
            updated_by=created_by,
        )
        issue.save(disable_auto_set_user=True)
        return issue

    @staticmethod
    def _make_run(agent, issue, status, pending_request=None):
        from plane.db.models import AgentRun

        run = AgentRun(
            agent=agent,
            issue=issue,
            trigger_event="assigned",
            status=status,
            pending_request=pending_request,
        )
        run.save(disable_auto_set_user=True)
        return run

    # ------------------------------------------------------------------ #
    # Test: needs_input run appears for the right user with message       #
    # ------------------------------------------------------------------ #

    @pytest.mark.django_db
    def test_inbox_returns_needs_input_run_for_issue_creator(
        self, session_client, workspace, create_user, create_bot_user
    ):
        """A needs_input run appears in the inbox for the issue creator
        and includes the pending_request message."""
        agent = self._make_agent_with_bot(workspace, create_bot_user)
        issue = self._make_issue(workspace, create_user)

        pending = {"kind": "question", "message": "Should I close this?", "tool": None, "arguments": None}
        run = self._make_run(agent, issue, "needs_input", pending_request=pending)

        url = f"/api/workspaces/{workspace.slug}/agent-runs/inbox/"
        resp = session_client.get(url)
        assert resp.status_code == status.HTTP_200_OK

        items = resp.data
        assert isinstance(items, list)
        run_ids = [item["run_id"] for item in items]
        assert str(run.id) in run_ids, "needs_input run must appear in inbox for issue creator"

        item = next(i for i in items if i["run_id"] == str(run.id))
        assert item["kind"] == "question"
        assert item["message"] == "Should I close this?"
        assert item["status"] == "needs_input"
        assert item["issue"] is not None
        assert item["issue"]["id"] == str(issue.id)

    # ------------------------------------------------------------------ #
    # Test: unrelated user does NOT see the run                           #
    # ------------------------------------------------------------------ #

    @pytest.mark.django_db
    def test_inbox_excludes_run_for_unrelated_user(
        self, workspace, create_user, create_bot_user
    ):
        """A needs_input run for an issue the requesting user didn't create
        and is not assigned to must NOT appear in their inbox."""
        from rest_framework.test import APIClient
        from plane.db.models import User, WorkspaceMember

        # Create a second "other" user who is not the issue creator.
        other_user = User.objects.create(
            email="other-inbox-test@plane.so",
            username="other-inbox-test",
        )
        other_user.set_password("pass")
        other_user.save()
        WorkspaceMember.objects.create(workspace=workspace, member=other_user, role=15)

        agent = self._make_agent_with_bot(workspace, create_bot_user)
        issue = self._make_issue(workspace, create_user)  # creator = create_user, not other_user

        pending = {"kind": "approval", "message": "Approve label?", "tool": "add_label", "arguments": {}}
        run = self._make_run(agent, issue, "needs_input", pending_request=pending)

        other_client = APIClient()
        other_client.force_authenticate(user=other_user)

        url = f"/api/workspaces/{workspace.slug}/agent-runs/inbox/"
        resp = other_client.get(url)
        assert resp.status_code == status.HTTP_200_OK

        run_ids = [item["run_id"] for item in resp.data]
        assert str(run.id) not in run_ids, "unrelated user must NOT see this needs_input run"
