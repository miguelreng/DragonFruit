from types import SimpleNamespace

from plane.llm.provider import _serialise_tool_call_for_history


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
