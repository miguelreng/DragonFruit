from types import SimpleNamespace

from plane.app.views.external.base import call_llm_chat
from plane.llm.provider import _serialise_tool_call_for_history
from plane.llm.provider import LLMProvider


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
