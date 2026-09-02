# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only

from rest_framework import serializers

from plane.db.models import ProjectContextSource, ProjectSourceFile, ProjectSourceRevision


class ProjectContextSourceSerializer(serializers.ModelSerializer):
    file_count = serializers.SerializerMethodField()

    def get_file_count(self, obj: ProjectContextSource) -> int:
        return int(getattr(obj, "file_count", obj.files.count()))

    class Meta:
        model = ProjectContextSource
        fields = [
            "id",
            "workspace",
            "project",
            "connection",
            "provider",
            "root_external_id",
            "display_name",
            "status",
            "selection_config",
            "last_refreshed_at",
            "last_error_code",
            "file_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "workspace",
            "project",
            "connection",
            "status",
            "last_refreshed_at",
            "last_error_code",
            "file_count",
            "created_at",
            "updated_at",
        ]


class ProjectSourceFileSerializer(serializers.ModelSerializer):
    latest_revision = serializers.SerializerMethodField()

    class Meta:
        model = ProjectSourceFile
        fields = [
            "id",
            "source",
            "external_id",
            "relative_path",
            "mime_type",
            "size_bytes",
            "is_eligible",
            "exclusion_reason",
            "latest_revision",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_latest_revision(self, obj: ProjectSourceFile):
        revisions = list(obj.revisions.all()) if hasattr(obj, "revisions") else []
        revision = next((item for item in revisions if item.deleted_at is None), None)
        if revision is None:
            return None
        return ProjectSourceRevisionSerializer(revision).data


class ProjectSourceRevisionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectSourceRevision
        fields = [
            "id",
            "source_file",
            "provider_revision",
            "content_hash",
            "size_bytes",
            "is_truncated",
            "created_at",
        ]
        read_only_fields = fields
