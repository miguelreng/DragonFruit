# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from .base import DynamicBaseSerializer
from plane.db.models import AIConnectorEvent, WorkspaceAIConnector
from plane.license.utils.encryption import encrypt_data


class WorkspaceAIConnectorSerializer(DynamicBaseSerializer):
    secret = serializers.CharField(write_only=True, required=False)
    has_secret = serializers.SerializerMethodField(read_only=True)

    def get_has_secret(self, obj):
        return bool(obj.secret_encrypted)

    def create(self, validated_data):
        secret = validated_data.pop("secret", None)
        instance = super().create(validated_data)
        if secret:
            instance.secret_encrypted = encrypt_data(secret)
            instance.save(update_fields=["secret_encrypted"])
        return instance

    def update(self, instance, validated_data):
        secret = validated_data.pop("secret", None)
        instance = super().update(instance, validated_data)
        if secret:
            instance.secret_encrypted = encrypt_data(secret)
            instance.save(update_fields=["secret_encrypted"])
        return instance

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
