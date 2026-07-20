# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from types import SimpleNamespace

from plane.app.views.external.base import get_llm_config
from plane.license.utils.encryption import encrypt_data


def test_get_llm_config_defaults_openrouter_model():
    workspace = SimpleNamespace(
        llm_provider="openrouter",
        llm_model=None,
        llm_api_key_encrypted=encrypt_data("openrouter-secret"),
    )

    api_key, model, provider = get_llm_config(workspace=workspace)

    assert api_key == "openrouter-secret"
    assert provider == "openrouter"
    assert model == "openai/gpt-5.4-mini"


def test_get_llm_config_keeps_freeform_openrouter_model():
    workspace = SimpleNamespace(
        llm_provider="openrouter",
        llm_model="google/gemini-3.1-flash-lite",
        llm_api_key_encrypted=encrypt_data("openrouter-secret"),
    )

    api_key, model, provider = get_llm_config(workspace=workspace)

    assert api_key == "openrouter-secret"
    assert provider == "openrouter"
    assert model == "google/gemini-3.1-flash-lite"


def test_get_llm_config_does_not_fall_back_to_instance_key(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "instance-secret")
    monkeypatch.setenv("LLM_PROVIDER", "openai")
    monkeypatch.setenv("LLM_MODEL", "gpt-5.4-mini")
    workspace = SimpleNamespace(llm_api_key_encrypted=None)

    assert get_llm_config(workspace=workspace) == (None, None, None)
