# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third Party Imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from .user import UserLiteSerializer
from plane.db.models import Workspace
from plane.utils.constants import RESTRICTED_WORKSPACE_SLUGS


class WorkspaceSerializer(BaseSerializer):
    owner = UserLiteSerializer(read_only=True)
    logo_url = serializers.CharField(read_only=True)
    total_projects = serializers.IntegerField(read_only=True)
    total_members = serializers.IntegerField(read_only=True)

    def validate_slug(self, value):
        # Check if the slug is restricted
        if value in RESTRICTED_WORKSPACE_SLUGS:
            raise serializers.ValidationError("Slug is not valid")
        # Check uniqueness case-insensitively
        if Workspace.objects.filter(slug__iexact=value).exists():
            raise serializers.ValidationError("Slug is already in use")
        return value

    class Meta:
        model = Workspace
        # See app.serializers.workspace.WorkSpaceSerializer — the Fernet
        # ciphertext for BYO LLM credentials must never appear in API output.
        exclude = ["llm_api_key_encrypted"]
        read_only_fields = [
            "id",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
            "owner",
            "logo_url",
        ]
