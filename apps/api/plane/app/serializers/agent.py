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
    has_effective_llm_config = serializers.SerializerMethodField()
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
            "has_effective_llm_config",
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
            # Identity & personality are fixed in code (Atlas is one canonical
            # companion across every workspace), so these are read-only.
            "name",
            "description",
            "avatar_url",
            "system_prompt",
            "has_api_key",
            "has_effective_llm_config",
            "mcp_servers",
            "created_at",
            "updated_at",
        ]

    def get_has_api_key(self, obj: Agent) -> bool:
        return bool(obj.api_key_encrypted)

    def get_has_effective_llm_config(self, obj: Agent) -> bool:
        """Expose Atlas readiness without exposing any workspace or legacy key."""
        from plane.llm.provider import LLMConfigError, LLMProvider

        try:
            LLMProvider.from_agent(obj)
        except LLMConfigError:
            return False
        return True

    def get_mcp_servers(self, obj: Agent) -> list:
        """Public view of mcp_servers. Strips the ciphertext, exposes
        only `has_auth_header: bool` per entry. Never returns the raw
        encrypted blob — even ciphertext shouldn't leak through API
        responses (see BYOK rule).
        """
        out = []
        for entry in obj.mcp_servers or []:
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
    user_display_name = serializers.SerializerMethodField()
    user_avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = AgentChatMessage
        fields = [
            "id",
            "session",
            "user",
            "user_display_name",
            "user_avatar_url",
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
            "user",
            "user_display_name",
            "user_avatar_url",
            "prompt_tokens",
            "completion_tokens",
            "total_tokens",
            "cost_usd",
            "error_message",
            "created_at",
        ]

    def get_user_display_name(self, obj: AgentChatMessage) -> str:
        user = obj.user
        if user is None:
            return ""
        return user.display_name or user.get_full_name() or user.email

    def get_user_avatar_url(self, obj: AgentChatMessage) -> str:
        user = obj.user
        if user is None:
            return ""
        return user.avatar_url or ""


# Titles clients stamp on brand-new sessions before any real content
# ("Atlas Chat"/"Atlas Voice" come from the mac app). They read as noise in a
# sessions list, so both the send-time auto-title backfill and `display_title`
# treat them as "untitled".
GENERIC_AGENT_CHAT_TITLES = {"", "new chat", "atlas chat", "atlas voice"}


def generate_agent_chat_title(message_text: str) -> str:
    """Shape a chat message into a session title.

    Same heuristic as ChatGPT's auto-title: trim, collapse whitespace,
    cap at ~50 chars on a word boundary. The user can rename later.
    """
    text = " ".join((message_text or "").split())
    if len(text) <= 50:
        return text or "New chat"
    cut = text[:50]
    # Back off to the last word boundary so we don't slice "thinking"
    # into "think" mid-word.
    space = cut.rfind(" ")
    if space > 20:
        cut = cut[:space]
    return f"{cut}…"


class AgentChatSessionSerializer(serializers.ModelSerializer):
    # Lightweight read fields the list endpoint and detail endpoint
    # both return. The detail endpoint adds `messages` on top via the
    # view, not here, so the list query stays cheap.
    agent_name = serializers.CharField(source="agent.name", read_only=True)
    agent_avatar_url = serializers.URLField(source="agent.avatar_url", read_only=True)
    context_project_name = serializers.CharField(source="context_project.name", read_only=True)
    context_page_name = serializers.CharField(source="context_page.name", read_only=True)
    display_title = serializers.SerializerMethodField()

    def get_display_title(self, obj: AgentChatSession) -> str:
        """List-friendly name: the stored title unless it's a generic client
        default, in which case fall through to a title derived from the first
        user message (the list endpoint annotates `first_user_message`;
        elsewhere the annotation is absent and the stored title stands)."""
        title = (obj.title or "").strip()
        if title.lower() not in GENERIC_AGENT_CHAT_TITLES:
            return title
        first_message = getattr(obj, "first_user_message", None)
        if first_message:
            return generate_agent_chat_title(first_message)
        return title or "New chat"

    class Meta:
        model = AgentChatSession
        fields = [
            "id",
            "workspace",
            "user",
            "agent",
            "agent_name",
            "agent_avatar_url",
            "scope_type",
            "page",
            "title",
            "display_title",
            "context_project",
            "context_project_name",
            "context_page",
            "context_page_name",
            "context_updated_at",
            "context_updated_by_surface",
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
            "scope_type",
            "page",
            "context_project",
            "context_project_name",
            "context_page",
            "context_page_name",
            "context_updated_at",
            "context_updated_by_surface",
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
