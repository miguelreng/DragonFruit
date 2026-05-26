# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from .base import BaseSerializer
from plane.db.models import Sticky
from plane.utils.content_validator import validate_html_content, validate_binary_data


class StickySerializer(BaseSerializer):
    MAX_TAGS = 8
    MAX_TAG_LENGTH = 24

    class Meta:
        model = Sticky
        fields = "__all__"
        read_only_fields = ["workspace", "owner"]
        extra_kwargs = {"name": {"required": False}}

    def validate(self, data):
        # Validate description content for security
        if "description_html" in data and data["description_html"]:
            is_valid, error_msg, sanitized_html = validate_html_content(data["description_html"])
            if not is_valid:
                raise serializers.ValidationError({"error": "html content is not valid"})
            # Update the data with sanitized HTML if available
            if sanitized_html is not None:
                data["description_html"] = sanitized_html

        if "description_binary" in data and data["description_binary"]:
            is_valid, error_msg = validate_binary_data(data["description_binary"])
            if not is_valid:
                raise serializers.ValidationError({"description_binary": "Invalid binary data"})

        if "tags" in data:
            tags = data.get("tags", [])
            if tags is None:
                data["tags"] = []
            elif not isinstance(tags, list):
                raise serializers.ValidationError({"tags": "Tags must be a list of strings"})
            else:
                sanitized_tags = []
                seen = set()
                for tag in tags:
                    if not isinstance(tag, str):
                        raise serializers.ValidationError({"tags": "Each tag must be a string"})
                    cleaned_tag = " ".join(tag.strip().split())[: self.MAX_TAG_LENGTH]
                    if not cleaned_tag:
                        continue
                    lowered = cleaned_tag.lower()
                    if lowered in seen:
                        continue
                    seen.add(lowered)
                    sanitized_tags.append(cleaned_tag)
                    if len(sanitized_tags) >= self.MAX_TAGS:
                        break
                data["tags"] = sanitized_tags

        return data
