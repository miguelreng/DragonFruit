# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status


@pytest.mark.contract
class TestWorkspaceMCPAPI:
    @pytest.mark.django_db
    def test_read_only_manifest_exposes_only_read_tools(self, api_client, api_token, workspace):
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {api_token.token}")

        response = api_client.get(f"/api/workspaces/{workspace.slug}/mcp/read-only/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["mode"] == "read-only"
        tool_names = {tool["name"] for tool in response.data["tools"]}
        assert tool_names == {"list_tasks", "get_task", "list_projects", "search_pages", "get_page"}
        assert "create_task" not in tool_names
        assert "update_task" not in tool_names
        assert "add_comment" not in tool_names

    @pytest.mark.django_db
    def test_read_only_tools_list_hides_write_tools(self, api_client, api_token, workspace):
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {api_token.token}")

        response = api_client.post(
            f"/api/workspaces/{workspace.slug}/mcp/read-only/",
            {"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        tool_names = {tool["name"] for tool in response.data["result"]["tools"]}
        assert tool_names == {"list_tasks", "get_task", "list_projects", "search_pages", "get_page"}

    @pytest.mark.django_db
    def test_read_only_endpoint_rejects_write_tool_calls(self, api_client, api_token, workspace):
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {api_token.token}")

        response = api_client.post(
            f"/api/workspaces/{workspace.slug}/mcp/read-only/",
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {"name": "create_task", "arguments": {"project_id": "p", "name": "Write attempt"}},
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["error"]["code"] == -32601
        assert "not available on the read-only MCP endpoint" in response.data["error"]["message"]

    @pytest.mark.django_db
    def test_full_endpoint_still_exposes_write_tools_for_atlas_and_write_clients(
        self, api_client, api_token, workspace
    ):
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {api_token.token}")

        response = api_client.post(
            f"/api/workspaces/{workspace.slug}/mcp/",
            {"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        tool_names = {tool["name"] for tool in response.data["result"]["tools"]}
        assert {"create_task", "update_task", "add_comment"}.issubset(tool_names)
