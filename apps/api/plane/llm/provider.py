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
    """BYOK adapter for a single agent's model + credentials.

    Construct via `LLMProvider.from_agent(agent)` so the encrypted key
    is decrypted in one well-known place. Direct construction is also
    fine for tests and for non-agent code paths.
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
        """Build a provider from an `Agent` row, decrypting the key.

        Raises `LLMConfigError` if the agent has no provider_model or no
        api_key_encrypted set. Callers (dispatch task) should catch this
        and mark the AgentRun as failed with a helpful message.
        """
        from plane.license.utils.encryption import decrypt_data

        if not agent.provider_model:
            raise LLMConfigError(
                f"agent '{agent.name}' has no provider_model configured; "
                "set one in Workspace Settings → Agents"
            )
        if not agent.api_key_encrypted:
            raise LLMConfigError(
                f"agent '{agent.name}' has no API key configured; add a "
                "BYOK key in Workspace Settings → Agents"
            )

        plaintext_key = decrypt_data(agent.api_key_encrypted) or ""
        if not plaintext_key:
            raise LLMConfigError(
                f"agent '{agent.name}' has an encrypted key on file that "
                "decrypts to empty; rotate the key"
            )

        return cls(
            model=agent.provider_model.strip(),
            api_key=plaintext_key,
            api_base_url=(agent.api_base_url or "").strip() or None,
        )

    # ----------------------------------------------------------------- #
    # Single-shot chat (no tool use)                                    #
    # ----------------------------------------------------------------- #

    def chat(self, *, system_prompt: str, user_prompt: str) -> LLMRunResult:
        """One-shot generate — no tool loop. Useful for tests and for
        simple "summarise / draft" features that don't need tool use.
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
                    model=self.model,
                    api_key=self.api_key,
                    api_base=self.api_base_url,
                    messages=messages,
                    tools=litellm_tools if litellm_tools else None,
                    # Don't surface tool_choice='auto' explicitly — LiteLLM
                    # picks the right default per provider.
                )
            except Exception as exc:  # noqa: BLE001 — surface any provider error
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
            if tool_calls:
                assistant_entry["tool_calls"] = [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments,
                        },
                    }
                    for tc in tool_calls
                ]
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

                result.tool_calls.append({
                    "name": tool_name,
                    "arguments": args,
                    "result": tool_output[:4000],  # cap to avoid runaway logs
                })

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "name": tool_name,
                    "content": tool_output,
                })

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
