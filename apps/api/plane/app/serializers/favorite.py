# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from plane.db.models import UserFavorite, Cycle, Module, Issue, IssueView, Page, Project


class ProjectFavoriteLiteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = ["id", "name", "logo_props"]


class PageFavoriteLiteSerializer(serializers.ModelSerializer):
    project_id = serializers.SerializerMethodField()

    class Meta:
        model = Page
        # `page_type` lets the client render docs-folder favorites (a folder
        # never opens in an editor — it deep-links the Docs gallery instead).
        fields = ["id", "name", "logo_props", "page_type", "project_id"]

    def get_project_id(self, obj):
        project = obj.projects.first()  # This gets the first project related to the Page
        return project.id if project else None


class CycleFavoriteLiteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cycle
        fields = ["id", "name", "logo_props", "project_id"]


class ModuleFavoriteLiteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Module
        fields = ["id", "name", "logo_props", "project_id"]


class ViewFavoriteSerializer(serializers.ModelSerializer):
    # Surface the saved layout so the favorites sidebar can render the
    # matching layout icon (timeline / list / board / etc.) without the
    # frontend having to fetch the view's full filters separately.
    view_layout = serializers.SerializerMethodField()

    class Meta:
        model = IssueView
        fields = ["id", "name", "logo_props", "project_id", "view_layout"]

    def get_view_layout(self, obj):
        display_filters = getattr(obj, "display_filters", None) or {}
        return display_filters.get("layout")


def get_entity_model_and_serializer(entity_type):
    entity_map = {
        "cycle": (Cycle, CycleFavoriteLiteSerializer),
        "issue": (Issue, None),
        "module": (Module, ModuleFavoriteLiteSerializer),
        "view": (IssueView, ViewFavoriteSerializer),
        "page": (Page, PageFavoriteLiteSerializer),
        "project": (Project, ProjectFavoriteLiteSerializer),
        "folder": (None, None),
    }
    return entity_map.get(entity_type, (None, None))


class UserFavoriteSerializer(serializers.ModelSerializer):
    entity_data = serializers.SerializerMethodField()
    # Accept a layout snapshot on create so the favorites sidebar can render
    # the matching layout icon. Only meaningful for entity_type="project"
    # favorites added from inside the Tasks page — plain project favorites
    # leave this null and keep their emoji. The field is read back through
    # `entity_data.view_layout` below for a uniform shape on the wire.
    view_layout = serializers.CharField(
        required=False, allow_null=True, allow_blank=True, max_length=50, write_only=True
    )

    class Meta:
        model = UserFavorite
        fields = [
            "id",
            "entity_type",
            "entity_identifier",
            "entity_data",
            "name",
            "is_folder",
            "sequence",
            "parent",
            "workspace_id",
            "project_id",
            "view_layout",
        ]
        read_only_fields = ["workspace", "created_by", "updated_by"]

    def create(self, validated_data):
        # Extract the layout snapshot from the writable field so it lands on
        # the model column rather than getting confused with the read-side
        # `entity_data` projection.
        view_layout = validated_data.pop("view_layout", None)
        instance = super().create(validated_data)
        if view_layout:
            instance.view_layout = view_layout
            instance.save(update_fields=["view_layout"])
        return instance

    def get_entity_data(self, obj):
        entity_type = obj.entity_type
        entity_identifier = obj.entity_identifier

        entity_model, entity_serializer = get_entity_model_and_serializer(entity_type)
        data = None
        if entity_model and entity_serializer:
            try:
                entity = entity_model.objects.get(pk=entity_identifier)
                data = entity_serializer(entity).data
            except entity_model.DoesNotExist:
                data = None

        # Always include the favorite's own `view_layout` snapshot in the
        # returned entity_data, even when the entity itself doesn't carry a
        # layout — that's the whole point of storing it on the favorite.
        # The ViewFavoriteSerializer already returns its own `view_layout`
        # from the View's display_filters; if both exist, prefer the
        # favorite's snapshot since that's what the user explicitly starred.
        snapshot = obj.view_layout
        if snapshot:
            if data is None:
                data = {"view_layout": snapshot}
            else:
                data = {**data, "view_layout": snapshot}
        return data
