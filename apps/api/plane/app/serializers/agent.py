# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from plane.db.models import Agent, AgentAutomation, AgentChatMessage, AgentChatSession, AgentMemory, AgentRun


class AgentSerializer(serializers.ModelSerializer):
    """Public-facing agent serializer.

    Never exposes `api_key_encrypted` plaintext — even on read, the field is
    replaced by a boolean `has_api_key`. The write side accepts a plaintext
    `api_key` only at create/update time and the view layer encrypts it
    before persistence. See feedback_ai_byok.md for the BYOK rule.
    """

    bot_user_id = serializers.UUIDField(source="bot_user.id", read_only=True)
    bot_user_email = serializers.EmailField(source="bot_user.email", read_only=True)
    has_api_key = serializers.SerializerMethodField()
    mcp_servers = serializers.SerializerMethodField()

    class Meta:
        model = Agent
        fields = [
            "id",
            "workspace",
            "bot_user_id",
            "bot_user_email",
            "name",
            "description",
            "avatar_url",
            "system_prompt",
            "provider_model",
            "api_base_url",
            "has_api_key",
            "triggers",
            "tool_policies",
            "is_enabled",
            "max_concurrent_runs",
            "draft_mode",
            "mcp_servers",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "workspace",
            "bot_user_id",
            "bot_user_email",
            "has_api_key",
            "mcp_servers",
            "created_at",
            "updated_at",
        ]

    def get_has_api_key(self, obj: Agent) -> bool:
        return bool(obj.api_key_encrypted)

    def get_mcp_servers(self, obj: Agent) -> list:
        """Public view of mcp_servers. Strips the ciphertext, exposes
        only `has_auth_header: bool` per entry. Never returns the raw
        encrypted blob — even ciphertext shouldn't leak through API
        responses (see BYOK rule).
        """
        out = []
        for entry in (obj.mcp_servers or []):
            if not isinstance(entry, dict):
                continue
            out.append(
                {
                    "name": entry.get("name") or "",
                    "url": entry.get("url") or "",
                    "enabled": bool(entry.get("enabled", True)),
                    "has_auth_header": bool(entry.get("auth_header_encrypted")),
                }
            )
        return out


class AgentRunSerializer(serializers.ModelSerializer):
    # cost_usd is a DecimalField on the model; DRF serializes Decimal as
    # string by default. Override to a float so the UI can do arithmetic
    # without parseFloat ceremony. Sub-cent precision is preserved.
    cost_usd = serializers.FloatField(read_only=True)

    class Meta:
        model = AgentRun
        fields = [
            "id",
            "agent",
            "issue",
            "trigger_event",
            "status",
            "error",
            "dispatched_at",
            "completed_at",
            "cancel_requested",
            "iterations",
            "prompt_tokens",
            "completion_tokens",
            "total_tokens",
            "cost_usd",
            "tool_calls",
            "created_at",
        ]
        read_only_fields = fields


class AgentChatMessageSerializer(serializers.ModelSerializer):
    cost_usd = serializers.FloatField(read_only=True)

    class Meta:
        model = AgentChatMessage
        fields = [
            "id",
            "session",
            "role",
            "content",
            "attachments",
            "prompt_tokens",
            "completion_tokens",
            "total_tokens",
            "cost_usd",
            "error_message",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "session",
            "prompt_tokens",
            "completion_tokens",
            "total_tokens",
            "cost_usd",
            "error_message",
            "created_at",
        ]


class AgentChatSessionSerializer(serializers.ModelSerializer):
    # Lightweight read fields the list endpoint and detail endpoint
    # both return. The detail endpoint adds `messages` on top via the
    # view, not here, so the list query stays cheap.
    agent_name = serializers.CharField(source="agent.name", read_only=True)
    agent_avatar_url = serializers.URLField(source="agent.avatar_url", read_only=True)

    class Meta:
        model = AgentChatSession
        fields = [
            "id",
            "workspace",
            "user",
            "agent",
            "agent_name",
            "agent_avatar_url",
            "title",
            "created_at",
            "updated_at",
            "last_activity_at",
        ]
        read_only_fields = [
            "id",
            "workspace",
            "user",
            "agent_name",
            "agent_avatar_url",
            "created_at",
            "updated_at",
            "last_activity_at",
        ]


class AgentMemorySerializer(serializers.ModelSerializer):
    class Meta:
        model = AgentMemory
        fields = [
            "id",
            "workspace",
            "agent",
            "key",
            "value",
            "tags",
            "source",
            "use_count",
            "last_accessed_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "workspace",
            "use_count",
            "last_accessed_at",
            "created_at",
            "updated_at",
        ]


class AgentAutomationSerializer(serializers.ModelSerializer):
    agent_name = serializers.CharField(source="agent.name", read_only=True)

    class Meta:
        model = AgentAutomation
        fields = [
            "id",
            "workspace",
            "agent",
            "agent_name",
            "name",
            "trigger_event",
            "conditions",
            "is_enabled",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "workspace",
            "agent_name",
            "created_at",
            "updated_at",
        ]
