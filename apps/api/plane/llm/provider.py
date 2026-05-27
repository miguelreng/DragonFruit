# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""LLMProvider — the thin tool-use loop over LiteLLM.

This is intentionally minimal. The agent dispatcher and future LLM-backed
features both run the same loop:

    provider = LLMProvider.from_agent(agent)
    result = provider.run(
        system_prompt="...",
        user_prompt="...",
        tools=[post_comment_tool, read_task_tool, ...],
        max_iterations=10,
        is_cancelled=lambda: AgentRun.objects.filter(...).cancel_requested,
    )

LiteLLM handles vendor-specific quirks (Anthropic's content-blocks-vs-text
distinction, OpenAI's tool_calls vs functions, etc.); we expose a
normalised interface and add the safety rails (iteration cap, cancel,
cost accounting).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Iterable, List, Optional


logger = logging.getLogger(__name__)


OPENAI_COMPATIBLE_PROVIDER_PREFIXES = {"hermes", "openclaw"}


class LLMConfigError(ValueError):
    """Raised when an agent is missing credentials needed to make a call.

    Distinct from generic ValueError so callers can detect "this agent
    isn't configured yet" vs "the model returned garbage" and surface a
    friendlier error to the user.
    """


@dataclass
class LLMTool:
    """A single tool exposed to the model.

    `parameters_schema` is a JSON Schema object describing the tool's
    arguments; LiteLLM forwards it to the provider in whatever shape
    that provider expects (Anthropic's input_schema, OpenAI's parameters).

    `handler` is invoked with the validated argument dict and must return
    a string that gets fed back to the model as the tool's result.
    Handlers may raise; exceptions are caught and converted to a
    "tool_error" string so the model can recover.
    """

    name: str
    description: str
    parameters_schema: Dict[str, Any]
    handler: Callable[[Dict[str, Any]], str]


@dataclass
class LLMRunResult:
    """Outcome of an `LLMProvider.run()` call.

    `final_text` is the model's last assistant message (empty if the
    loop terminated on cancel or iteration cap before any text was
    produced). `tool_calls` is a flat list of `{name, arguments, result}`
    dicts in invocation order — useful for logging into `AgentRun` so
    the UI can show what the agent did. Token / cost totals come from
    LiteLLM's usage payload when the provider returns one.
    """

    final_text: str = ""
    tool_calls: List[Dict[str, Any]] = field(default_factory=list)
    iterations: int = 0
    cancelled: bool = False
    stopped_reason: str = ""  # "completed" | "cancelled" | "max_iterations" | "error"
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class LLMProvider:
    """BYOK adapter for Atlas model + credentials.

    Construct via `LLMProvider.from_agent(agent)` so legacy per-agent
    overrides and the workspace Settings → AI config resolve in one
    well-known place. Direct construction is also fine for tests.
    """

    def __init__(
        self,
        *,
        model: str,
        api_key: str,
        api_base_url: Optional[str] = None,
        default_max_iterations: int = 10,
    ) -> None:
        if not model:
            raise LLMConfigError("model is required (e.g. 'anthropic/claude-sonnet-4.6')")
        if not api_key:
            raise LLMConfigError("api_key is required — Dragon Fruit never falls back to a platform key")

        self.model = model
        self.api_key = api_key
        self.api_base_url = api_base_url or None
        self.default_max_iterations = default_max_iterations

    # ----------------------------------------------------------------- #
    # Construction helpers                                              #
    # ----------------------------------------------------------------- #

    @classmethod
    def from_agent(cls, agent) -> "LLMProvider":
        """Build a provider for Atlas, decrypting the configured BYOK key.

        Prefer the workspace-level Settings → AI configuration. Legacy rows
        may still carry per-agent model/key overrides; use those only as a
        fallback so older workspaces keep working until Settings → AI is set.
        """
        from plane.license.utils.encryption import decrypt_data

        from plane.app.views.external.base import get_llm_config

        api_key, model, provider = get_llm_config(workspace=agent.workspace)
        if api_key and model:
            provider_key = (provider or "").strip().lower()
            model_slug = model.strip()
            if provider_key and "/" not in model_slug:
                model_slug = f"{provider_key}/{model_slug}"

            return cls(
                model=model_slug,
                api_key=api_key,
                api_base_url=None,
            )

        if agent.provider_model and agent.api_key_encrypted:
            plaintext_key = decrypt_data(agent.api_key_encrypted) or ""
            if not plaintext_key:
                raise LLMConfigError("Atlas has an encrypted key on file that decrypts to empty; rotate the key")

            return cls(
                model=agent.provider_model.strip(),
                api_key=plaintext_key,
                api_base_url=(agent.api_base_url or "").strip() or None,
            )

        raise LLMConfigError("Atlas needs an LLM provider, model, and API key in Settings → AI.")

    def _litellm_model(self) -> str:
        provider, separator, model = self.model.partition("/")
        if separator and provider.lower() in OPENAI_COMPATIBLE_PROVIDER_PREFIXES and self.api_base_url:
            return f"openai/{model}"
        return self.model

    # ----------------------------------------------------------------- #
    # Single-shot chat (no tool use)                                    #
    # ----------------------------------------------------------------- #

    def chat(
        self,
        *,
        system_prompt: str,
        user_prompt,
    ) -> LLMRunResult:
        """One-shot generate — no tool loop. Useful for tests and for
        simple "summarise / draft" features that don't need tool use.

        `user_prompt` accepts either a plain string (the common case) or
        an OpenAI-style multimodal content list — e.g. a mix of
        `{"type": "text", "text": "..."}` and
        `{"type": "image_url", "image_url": {"url": "data:..."}}` blocks
        for vision-capable models. LiteLLM passes the list straight
        through so any provider that supports the OpenAI multimodal
        schema (Anthropic, Gemini, OpenAI, etc.) handles it natively.
        """
        return self.run(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            tools=[],
            max_iterations=1,
        )

    # ----------------------------------------------------------------- #
    # Tool-use loop                                                     #
    # ----------------------------------------------------------------- #

    def run(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        tools: Iterable[LLMTool] = (),
        max_iterations: Optional[int] = None,
        is_cancelled: Optional[Callable[[], bool]] = None,
        on_tool_call: Optional[Callable[[Dict[str, Any]], None]] = None,
    ) -> LLMRunResult:
        """Drive a multi-turn tool-use loop.

        - `tools` is a list of `LLMTool`. Empty list → behaves like
          `chat()`.
        - `max_iterations` caps how many model turns we'll run before
          giving up. Each tool-call cycle counts as one turn. Defaults to
          the provider's `default_max_iterations`.
        - `is_cancelled` is polled between turns; if it returns True we
          stop and mark the result as cancelled. The cancel check is
          per-turn rather than per-token because LiteLLM's
          non-streaming path doesn't expose a mid-call cancel.
        - `on_tool_call` (optional) is invoked after each tool call is
          executed and appended to `result.tool_calls`. Callers can use
          it for incremental persistence so a long run remains resumable.
        """
        import litellm  # local import — heavy module, only load when used

        max_iters = max_iterations if max_iterations is not None else self.default_max_iterations
        tools_by_name: Dict[str, LLMTool] = {t.name: t for t in tools}
        litellm_tools = _serialise_tools_for_litellm(tools_by_name.values())

        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        result = LLMRunResult()

        for iteration in range(max_iters):
            if is_cancelled and is_cancelled():
                result.cancelled = True
                result.stopped_reason = "cancelled"
                return result

            result.iterations = iteration + 1

            try:
                completion = litellm.completion(
                    model=self._litellm_model(),
                    api_key=self.api_key,
                    api_base=self.api_base_url,
                    messages=messages,
                    tools=litellm_tools if litellm_tools else None,
                    # Don't surface tool_choice='auto' explicitly — LiteLLM
                    # picks the right default per provider.
                )
            except Exception:  # noqa: BLE001 — surface any provider error
                logger.exception("llm call failed model=%s", self.model)
                result.stopped_reason = "error"
                # Re-raise so the dispatcher logs it on the AgentRun row;
                # the result is still returned via the exception's
                # __cause__ shouldn't be needed because we want a hard
                # stop, not silent partial output.
                raise

            _accumulate_usage(result, completion)

            choice = completion.choices[0]
            message = choice.message
            assistant_content = getattr(message, "content", None) or ""
            tool_calls = getattr(message, "tool_calls", None) or []

            # Append assistant turn to history regardless of whether it
            # used tools or just produced text.
            assistant_entry: Dict[str, Any] = {"role": "assistant", "content": assistant_content}
            provider_specific_fields = _read_field(message, "provider_specific_fields")
            if provider_specific_fields:
                assistant_entry["provider_specific_fields"] = provider_specific_fields
            if tool_calls:
                assistant_entry["tool_calls"] = [_serialise_tool_call_for_history(tc) for tc in tool_calls]
            messages.append(assistant_entry)

            if not tool_calls:
                # Model returned a plain text response — we're done.
                result.final_text = assistant_content
                result.stopped_reason = "completed"
                return result

            # Run each requested tool, append the result as a tool message,
            # then loop again so the model can react to the tool output.
            for tc in tool_calls:
                tool_name = tc.function.name
                tool = tools_by_name.get(tool_name)
                raw_args = tc.function.arguments or "{}"
                try:
                    import json as _json

                    args = _json.loads(raw_args) if isinstance(raw_args, str) else (raw_args or {})
                except Exception:  # noqa: BLE001
                    args = {}

                if tool is None:
                    tool_output = f"tool_error: unknown tool '{tool_name}'"
                else:
                    try:
                        tool_output = tool.handler(args)
                        if not isinstance(tool_output, str):
                            tool_output = str(tool_output)
                    except Exception as exc:  # noqa: BLE001
                        logger.exception("tool '%s' raised", tool_name)
                        tool_output = f"tool_error: {exc.__class__.__name__}: {exc}"

                result.tool_calls.append(
                    {
                        "name": tool_name,
                        "arguments": args,
                        "result": tool_output[:4000],  # cap to avoid runaway logs
                        "iteration": iteration + 1,
                    }
                )
                if on_tool_call is not None:
                    try:
                        on_tool_call(result.tool_calls[-1])
                    except Exception:  # noqa: BLE001
                        logger.exception("on_tool_call callback failed")

                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "name": tool_name,
                        "content": tool_output,
                    }
                )

        # Fell off the loop without a terminating text message.
        result.stopped_reason = "max_iterations"
        return result


# ===================================================================== #
# Helpers                                                               #
# ===================================================================== #


def _serialise_tools_for_litellm(tools: Iterable[LLMTool]) -> List[Dict[str, Any]]:
    """Convert our LLMTool dataclass to LiteLLM's OpenAI-style tool dict.

    LiteLLM accepts OpenAI's `{type: "function", function: {...}}` shape
    and translates it to each provider's native format internally.
    """
    return [
        {
            "type": "function",
            "function": {
                "name": t.name,
                "description": t.description,
                "parameters": t.parameters_schema,
            },
        }
        for t in tools
    ]


def _read_field(value: Any, field_name: str, default: Any = None) -> Any:
    """Read a field from LiteLLM objects that may be dicts or pydantic-ish models."""
    if isinstance(value, dict):
        return value.get(field_name, default)
    return getattr(value, field_name, default)


def _serialise_tool_call_for_history(tool_call: Any) -> Dict[str, Any]:
    """Preserve provider-specific metadata when replaying tool calls.

    Gemini 3 function-calling responses include thought signatures in
    `provider_specific_fields`; LiteLLM needs those fields in the next
    request when it converts the OpenAI-style history back to Gemini parts.
    """
    function = _read_field(tool_call, "function")
    function_entry: Dict[str, Any] = {
        "name": _read_field(function, "name"),
        "arguments": _read_field(function, "arguments"),
    }

    function_provider_specific_fields = _read_field(function, "provider_specific_fields")
    if function_provider_specific_fields:
        function_entry["provider_specific_fields"] = function_provider_specific_fields

    entry: Dict[str, Any] = {
        "id": _read_field(tool_call, "id"),
        "type": _read_field(tool_call, "type", "function") or "function",
        "function": function_entry,
    }

    provider_specific_fields = _read_field(tool_call, "provider_specific_fields")
    if provider_specific_fields:
        entry["provider_specific_fields"] = provider_specific_fields

    return entry


def _accumulate_usage(result: LLMRunResult, completion: Any) -> None:
    """Best-effort accumulation of token counts across a multi-turn loop.

    LiteLLM normalises usage onto the completion object as
    `completion.usage` with `prompt_tokens`, `completion_tokens`,
    `total_tokens`. Some providers don't return usage (e.g. some local
    Ollama setups); in that case the counts stay at zero.
    """
    usage = getattr(completion, "usage", None)
    if usage is None:
        return
    result.prompt_tokens += getattr(usage, "prompt_tokens", 0) or 0
    result.completion_tokens += getattr(usage, "completion_tokens", 0) or 0
    result.total_tokens += getattr(usage, "total_tokens", 0) or 0
