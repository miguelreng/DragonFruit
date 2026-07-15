# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status

from plane.license.utils.encryption import decrypt_data


class TestWorkspaceLLMConfigAPI:
    @pytest.mark.django_db
    def test_workspace_llm_config_supports_openrouter_models(self, session_client, workspace):
        url = f"/api/workspaces/{workspace.slug}/llm-config/"

        get_response = session_client.get(url)
        assert get_response.status_code == status.HTTP_200_OK
        assert get_response.data["providers"]["openrouter"] == {
            "name": "OpenRouter",
            "models": [],
            "default_model": "openai/gpt-5.4-mini",
        }

        patch_response = session_client.patch(
            url,
            {
                "llm_provider": "openrouter",
                "llm_model": "google/gemini-3.1-flash-lite",
                "llm_api_key": "openrouter-secret",
            },
            format="json",
        )
        assert patch_response.status_code == status.HTTP_200_OK
        assert patch_response.data["llm_provider"] == "openrouter"
        assert patch_response.data["llm_model"] == "google/gemini-3.1-flash-lite"
        assert patch_response.data["has_workspace_override"] is True

        workspace.refresh_from_db()
        assert workspace.llm_provider == "openrouter"
        assert workspace.llm_model == "google/gemini-3.1-flash-lite"
        assert decrypt_data(workspace.llm_api_key_encrypted) == "openrouter-secret"
