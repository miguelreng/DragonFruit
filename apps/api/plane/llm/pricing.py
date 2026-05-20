# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Per-model USD pricing table for cost-in-dollars on AgentRun.

LiteLLM ships a pricing table internally, but the surface is hard to
introspect deterministically and the data lags behind provider price
changes. We keep a small hand-maintained table here for the models
people actually use in Dragon Fruit agents. Anything not in the table
returns 0.0 cost (token counts are still tracked).

Pricing is per-1M tokens in USD, broken into prompt (input) and
completion (output). When you add a model, get the numbers from the
provider's pricing page on the date you add it, and put a date comment
so we know how stale it is.

Format: { "<litellm-model-string>": (prompt_per_1m, completion_per_1m) }
"""

from decimal import Decimal
from typing import Dict, Tuple


# As of 2026-05-19. Update when providers change pricing.
_PRICING_TABLE: Dict[str, Tuple[Decimal, Decimal]] = {
    # Anthropic
    "anthropic/claude-sonnet-4.6": (Decimal("3.00"), Decimal("15.00")),
    "anthropic/claude-sonnet-4.5": (Decimal("3.00"), Decimal("15.00")),
    "anthropic/claude-haiku-4.6": (Decimal("0.80"), Decimal("4.00")),
    "anthropic/claude-opus-4.5": (Decimal("15.00"), Decimal("75.00")),
    # OpenAI
    "openai/gpt-4o": (Decimal("2.50"), Decimal("10.00")),
    "openai/gpt-4o-mini": (Decimal("0.15"), Decimal("0.60")),
    "openai/gpt-4.1": (Decimal("2.00"), Decimal("8.00")),
    "openai/gpt-4.1-mini": (Decimal("0.40"), Decimal("1.60")),
    "openai/o1": (Decimal("15.00"), Decimal("60.00")),
    "openai/o3-mini": (Decimal("1.10"), Decimal("4.40")),
    # Google Gemini
    "gemini/gemini-2.5-flash": (Decimal("0.30"), Decimal("2.50")),
    "gemini/gemini-2.5-pro": (Decimal("1.25"), Decimal("10.00")),
    "gemini/gemini-2.0-flash": (Decimal("0.10"), Decimal("0.40")),
}


def estimate_cost_usd(model: str, prompt_tokens: int, completion_tokens: int) -> Decimal:
    """Estimate USD cost of a single completion.

    Returns Decimal("0") for unknown models — we don't want to display
    a wildly wrong number, and 0 is a clear signal in the UI that the
    pricing wasn't tracked.
    """
    if not model:
        return Decimal("0")

    pricing = _PRICING_TABLE.get(model)
    if pricing is None:
        # Try a normalised lookup — providers sometimes ship "gemini/x" vs
        # "gemini-x" depending on the SDK version.
        normalised = model.replace("-latest", "").strip().lower()
        for key, value in _PRICING_TABLE.items():
            if key.lower() == normalised:
                pricing = value
                break
    if pricing is None:
        return Decimal("0")

    prompt_per_1m, completion_per_1m = pricing
    cost = (
        Decimal(prompt_tokens) * prompt_per_1m
        + Decimal(completion_tokens) * completion_per_1m
    ) / Decimal("1000000")
    # Cap precision to 6 decimal places to match AgentRun.cost_usd column.
    return cost.quantize(Decimal("0.000001"))


__all__ = ["estimate_cost_usd"]
