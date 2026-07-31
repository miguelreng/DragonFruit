from types import SimpleNamespace

from plane.app.views.external.base import call_llm_chat
from plane.llm.provider import _serialise_tool_call_for_history
from plane.llm.provider import LLMProvider


def test_stream_run_emits_factual_tool_progress(monkeypatch):
    import litellm

    calls = [0]
    builds = [0]

    def mock_completion(**kwargs):
        calls[0] += 1
        text = "" if calls[0] == 1 else "Done"
        return [SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content=text))])]

    def mock_stream_chunk_builder(chunks, messages):
        builds[0] += 1
        tool_calls = (
            [
                SimpleNamespace(
                    id="tool-1",
                    function=SimpleNamespace(name="search_workspace", arguments='{"query":"launch"}'),
                )
            ]
            if builds[0] == 1
            else []
        )
        message = SimpleNamespace(
            content="" if tool_calls else "Done",
            tool_calls=tool_calls,
            provider_specific_fields=None,
        )
        return SimpleNamespace(choices=[SimpleNamespace(message=message)], usage=None)

    monkeypatch.setattr(litellm, "completion", mock_completion)
    monkeypatch.setattr(litellm, "stream_chunk_builder", mock_stream_chunk_builder)

    from plane.llm.provider import LLMTool

    provider = LLMProvider(model="openai/gpt-4o", api_key="test-key")
    events = list(
        provider.stream_run(
            system_prompt="Use tools when useful.",
            user_prompt="Find the launch notes.",
            tools=[
                LLMTool(
                    name="search_workspace",
                    description="Search",
                    parameters_schema={"type": "object", "properties": {}},
                    handler=lambda args: "one result",
                )
            ],
            max_iterations=3,
        )
    )

    progress = [value for kind, value in events if kind == "progress"]
    assert progress == [
        {"stage": "understanding", "iteration": 1},
        {"stage": "tool_started", "tool": "search_workspace", "iteration": 1},
        {"stage": "tool_completed", "tool": "search_workspace", "iteration": 1, "ok": True},
        {"stage": "synthesizing", "iteration": 2},
    ]
    assert events[-1][0] == "result"
    assert events[-1][1].final_text == "Done"


def test_serialise_tool_call_preserves_provider_specific_fields():
    tool_call = SimpleNamespace(
        id="call_123",
        type="function",
        provider_specific_fields={"thought_signature": "sig-tool"},
        function=SimpleNamespace(
            name="search_workspace",
            arguments='{"query": "essay"}',
            provider_specific_fields={"thought_signature": "sig-function"},
        ),
    )

    assert _serialise_tool_call_for_history(tool_call) == {
        "id": "call_123",
        "type": "function",
        "function": {
            "name": "search_workspace",
            "arguments": '{"query": "essay"}',
            "provider_specific_fields": {"thought_signature": "sig-function"},
        },
        "provider_specific_fields": {"thought_signature": "sig-tool"},
    }


def test_serialise_tool_call_supports_dict_shape():
    tool_call = {
        "id": "call_456",
        "type": "function",
        "provider_specific_fields": {"thought_signature": "sig-tool"},
        "function": {
            "name": "search_workspace",
            "arguments": '{"query": "LP essay"}',
            "provider_specific_fields": {"thought_signature": "sig-function"},
        },
    }

    assert _serialise_tool_call_for_history(tool_call) == tool_call


def test_from_agent_prefixes_openrouter_models(monkeypatch):
    import plane.app.views.external.base as external_base

    monkeypatch.setattr(
        external_base,
        "get_llm_config",
        lambda workspace=None: ("openrouter-secret", "openai/gpt-5.4-mini", "openrouter"),
    )

    agent = SimpleNamespace(workspace=SimpleNamespace())

    provider = LLMProvider.from_agent(agent)

    assert provider.api_key == "openrouter-secret"
    assert provider.model == "openrouter/openai/gpt-5.4-mini"


def test_call_llm_chat_uses_openrouter_litellm(monkeypatch):
    import litellm

    captured = {}

    class DummyMessage:
        content = "hello from openrouter"

    class DummyChoice:
        message = DummyMessage()

    class DummyCompletion:
        choices = [DummyChoice()]

    def mock_completion(**kwargs):
        captured.update(kwargs)
        return DummyCompletion()

    monkeypatch.setattr(litellm, "completion", mock_completion)

    text, error = call_llm_chat(
        system="system prompt",
        user="user prompt",
        api_key="openrouter-secret",
        model="openai/gpt-5.4-mini",
        provider="openrouter",
        temperature=0.4,
        max_tokens=256,
    )

    assert error is None
    assert text == "hello from openrouter"
    assert captured["model"] == "openrouter/openai/gpt-5.4-mini"
    assert captured["api_key"] == "openrouter-secret"
    assert captured["api_base"] == "https://openrouter.ai/api/v1"
    assert captured["temperature"] == 0.4
    assert captured["max_tokens"] == 256
    assert captured["messages"] == [
        {"role": "system", "content": "system prompt"},
        {"role": "user", "content": "user prompt"},
    ]
