# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.core.validators import URLValidator
from django.core.exceptions import ValidationError
from rest_framework import serializers

from plane.app.serializers.base import BaseSerializer
from plane.db.models import ProjectBookmark


class ProjectBookmarkSerializer(BaseSerializer):
    project_name = serializers.CharField(source="project.name", read_only=True)
    workspace_slug = serializers.CharField(source="workspace.slug", read_only=True)
    created_by_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = ProjectBookmark
        fields = [
            "id",
            "workspace_id",
            "workspace_slug",
            "project_id",
            "project_name",
            "created_by_id",
            "title",
            "description",
            "url",
            "entity_type",
            "entity_identifier",
            "metadata",
            "tags",
            "sort_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["workspace", "project", "created_by", "created_at", "updated_at"]

    def validate_url(self, value):
        if not value:
            return ""
        normalized = value.strip()
        if normalized and not normalized.startswith(("http://", "https://")):
            normalized = "https://" + normalized
        try:
            URLValidator()(normalized)
        except ValidationError:
            raise serializers.ValidationError("Enter a valid URL.")
        return normalized

    def validate_tags(self, value):
        if value in (None, ""):
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError("Tags must be a list.")
        return [str(tag).strip() for tag in value if str(tag).strip()]

    def validate_metadata(self, value):
        if value in (None, ""):
            return {}
        if not isinstance(value, dict):
            raise serializers.ValidationError("Metadata must be an object.")
        return value

    def validate(self, data):
        url = data.get("url", getattr(self.instance, "url", ""))
        entity_type = data.get("entity_type", getattr(self.instance, "entity_type", ""))
        entity_identifier = data.get("entity_identifier", getattr(self.instance, "entity_identifier", None))
        if not url and not (entity_type and entity_identifier):
            raise serializers.ValidationError("A bookmark requires either a URL or an internal entity reference.")
        if not data.get("title") and not getattr(self.instance, "title", ""):
            raise serializers.ValidationError({"title": "Title is required."})
        return data
