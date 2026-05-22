# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from .base import DynamicBaseSerializer
from plane.db.models import AIConnectorEvent, WorkspaceAIConnector


class WorkspaceAIConnectorSerializer(DynamicBaseSerializer):
    secret = serializers.CharField(write_only=True, required=False)
    has_secret = serializers.SerializerMethodField(read_only=True)

    def get_has_secret(self, obj):
        return bool(obj.secret_encrypted)

    class Meta:
        model = WorkspaceAIConnector
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "actor",
            "secret_encrypted",
            "last_synced_at",
            "last_error",
            "created_at",
            "updated_at",
            "deleted_at",
        ]


class AIConnectorEventSerializer(DynamicBaseSerializer):
    class Meta:
        model = AIConnectorEvent
        fields = "__all__"
        read_only_fields = fields
