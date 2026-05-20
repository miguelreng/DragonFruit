# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from plane.db.models import Agent, AgentRun


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
            "is_enabled",
            "max_concurrent_runs",
            "draft_mode",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "workspace",
            "bot_user_id",
            "bot_user_email",
            "has_api_key",
            "created_at",
            "updated_at",
        ]

    def get_has_api_key(self, obj: Agent) -> bool:
        return bool(obj.api_key_encrypted)


class AgentRunSerializer(serializers.ModelSerializer):
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
            "created_at",
        ]
        read_only_fields = fields
