# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from plane.app.views.external.base import get_llm_config
from plane.license.utils.encryption import encrypt_data


def test_get_llm_config_defaults_openrouter_model(workspace):
    workspace.llm_provider = "openrouter"
    workspace.llm_model = None
    workspace.llm_api_key_encrypted = encrypt_data("openrouter-secret")
    workspace.save(update_fields=["llm_provider", "llm_model", "llm_api_key_encrypted"])

    api_key, model, provider = get_llm_config(workspace=workspace)

    assert api_key == "openrouter-secret"
    assert provider == "openrouter"
    assert model == "openai/gpt-5.4-mini"


def test_get_llm_config_keeps_freeform_openrouter_model(workspace):
    workspace.llm_provider = "openrouter"
    workspace.llm_model = "google/gemini-3.1-flash-lite"
    workspace.llm_api_key_encrypted = encrypt_data("openrouter-secret")
    workspace.save(update_fields=["llm_provider", "llm_model", "llm_api_key_encrypted"])

    api_key, model, provider = get_llm_config(workspace=workspace)

    assert api_key == "openrouter-secret"
    assert provider == "openrouter"
    assert model == "google/gemini-3.1-flash-lite"
