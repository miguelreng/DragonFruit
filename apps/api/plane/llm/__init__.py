# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Dragon Fruit's vendor-agnostic LLM abstraction.

Every LLM call in the product routes through `LLMProvider.chat()` so that:

1. **Providers are interchangeable** per-agent. The agent owner picks a
   model string like `"anthropic/claude-sonnet-4.6"`, `"openai/gpt-4o"`,
   or `"openrouter/google/gemini-pro"` and we route through LiteLLM,
   which normalises the request/response shape across ~100 providers.
2. **BYOK is enforced.** The provider object is constructed with a
   per-agent API key (Fernet-decrypted at call time) and optional
   per-agent `api_base_url` for self-hosted / proxied endpoints. The
   platform itself never holds an LLM credential and never falls back
   to a Dragon Fruit-owned key. See feedback_ai_byok.md.
3. **The dispatcher and any future LLM-backed feature share one tool-use
   contract.** A tool is `{name, description, parameters_json_schema,
   handler(args) -> str}`. Slice 2 of agents ships one tool
   (`post_comment`); Slice 3 will add `read_task`, `change_state`, etc.

This module is the single seam — search for `from plane.llm import` and
you've found every place in the codebase that talks to a model.
"""

from .composio import (
    ComposioClient,
    ComposioClientError,
    ComposioConfig,
    build_composio_tools,
    get_composio_config_for_workspace,
)
from .mcp_client import MCPClient, MCPClientError, wrap_mcp_server_as_tools
from .pricing import estimate_cost_usd
from .provider import (
    LLMConfigError,
    LLMProvider,
    LLMRunResult,
    LLMTool,
)


__all__ = [
    "LLMConfigError",
    "LLMProvider",
    "LLMRunResult",
    "LLMTool",
    "ComposioClient",
    "ComposioConfig",
    "ComposioClientError",
    "MCPClient",
    "MCPClientError",
    "build_composio_tools",
    "estimate_cost_usd",
    "get_composio_config_for_workspace",
    "wrap_mcp_server_as_tools",
]
