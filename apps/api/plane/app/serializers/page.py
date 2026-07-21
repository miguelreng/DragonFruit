# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers
import base64
import re

from bs4 import BeautifulSoup

# Module imports
from .base import BaseSerializer
from plane.utils.content_validator import (
    validate_binary_data,
    validate_html_content,
)
from plane.db.models import (
    Page,
    PageBlockComment,
    PageLabel,
    Label,
    ProjectPage,
    Project,
    PageTemplate,
    PageVersion,
)


class PageSerializer(BaseSerializer):
    is_favorite = serializers.BooleanField(read_only=True)
    labels = serializers.ListField(
        child=serializers.PrimaryKeyRelatedField(queryset=Label.objects.all()),
        write_only=True,
        required=False,
    )
    # Many to many
    label_ids = serializers.ListField(child=serializers.UUIDField(), required=False)
    project_ids = serializers.ListField(child=serializers.UUIDField(), required=False)

    class Meta:
        model = Page
        fields = [
            "id",
            "name",
            "page_type",
            "owned_by",
            "access",
            "color",
            "labels",
            "parent",
            "is_favorite",
            "is_locked",
            "is_brief",
            "is_captured_chat",
            "archived_at",
            "workspace",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "view_props",
            "logo_props",
            "label_ids",
            "project_ids",
        ]
        read_only_fields = ["workspace", "owned_by"]

    def create(self, validated_data):
        labels = validated_data.pop("labels", None)
        project_id = self.context["project_id"]
        owned_by_id = self.context["owned_by_id"]
        description_json = self.context["description_json"]
        description_binary = self.context["description_binary"]
        description_html = self.context["description_html"]

        # Get the workspace id from the project
        project = Project.objects.get(pk=project_id)

        # Create the page
        page = Page.objects.create(
            **validated_data,
            description_json=description_json,
            description_binary=description_binary,
            description_html=description_html,
            owned_by_id=owned_by_id,
            workspace_id=project.workspace_id,
        )

        # Create the project page
        ProjectPage.objects.create(
            workspace_id=page.workspace_id,
            project_id=project_id,
            page_id=page.id,
            created_by_id=page.created_by_id,
            updated_by_id=page.updated_by_id,
        )

        # Create page labels
        if labels is not None:
            PageLabel.objects.bulk_create(
                [
                    PageLabel(
                        label=label,
                        page=page,
                        workspace_id=page.workspace_id,
                        created_by_id=page.created_by_id,
                        updated_by_id=page.updated_by_id,
                    )
                    for label in labels
                ],
                batch_size=10,
            )
        return page

    def update(self, instance, validated_data):
        labels = validated_data.pop("labels", None)
        if labels is not None:
            PageLabel.objects.filter(page=instance).delete()
            PageLabel.objects.bulk_create(
                [
                    PageLabel(
                        label=label,
                        page=instance,
                        workspace_id=instance.workspace_id,
                        created_by_id=instance.created_by_id,
                        updated_by_id=instance.updated_by_id,
                    )
                    for label in labels
                ],
                batch_size=10,
            )

        return super().update(instance, validated_data)


class PageDetailSerializer(PageSerializer):
    description_html = serializers.CharField()
    # `description_json` carries the Excalidraw snapshot for whiteboard pages.
    # Doc pages keep their state in the Yjs blob (description_binary), so it's
    # harmless there too.
    description_json = serializers.JSONField(required=False, allow_null=True)

    class Meta(PageSerializer.Meta):
        fields = PageSerializer.Meta.fields + ["description_html", "description_json"]


class WorkspacePageListSerializer(PageSerializer):
    """List serializer for the workspace pages gallery.

    Adds a short plain-text snippet (first ~280 chars of the stripped HTML body)
    so the docs gallery can render a content preview without a per-page round
    trip. Kept distinct from `PageSerializer` to avoid bloating every other
    list response in the app.
    """

    SNIPPET_MAX_CHARS = 280
    # content_preview caps — the gallery renders small thumbnails, so trim
    # aggressively to keep the list payload light.
    PREVIEW_BLOCK_LIMIT = 10
    PREVIEW_TEXT_MAX = 160
    PREVIEW_HTML_MAX = 40000
    SHEET_PREVIEW_ROWS = 40
    SHEET_PREVIEW_COLS = 12
    SHEET_PREVIEW_CELL_CAP = 600
    WHITEBOARD_PREVIEW_ELEMENTS = 80
    WHITEBOARD_PREVIEW_POINTS = 24

    CELL_ID_RE = re.compile(r"^([A-Z]+)([0-9]+)$")

    description_snippet = serializers.SerializerMethodField()
    word_count = serializers.SerializerMethodField()
    content_preview = serializers.SerializerMethodField()

    class Meta(PageSerializer.Meta):
        fields = PageSerializer.Meta.fields + ["description_snippet", "word_count", "content_preview"]

    def get_description_snippet(self, obj):
        text = obj.description_stripped or ""
        text = " ".join(text.split())
        if not text:
            return ""
        if len(text) <= self.SNIPPET_MAX_CHARS:
            return text
        return text[: self.SNIPPET_MAX_CHARS].rstrip() + "…"

    def get_word_count(self, obj):
        # Counts the full stripped body (not the truncated snippet) so the
        # gallery can show an accurate length without a per-page fetch.
        return len((obj.description_stripped or "").split())

    def get_content_preview(self, obj):
        """Per-type thumbnail payload for the docs gallery preview cards.

        Docs → first blocks of the body (heading/paragraph/list structure),
        sheets → the active grid's top-left cell window, whiteboards → a light
        Excalidraw element list. PDFs need no payload (the client streams the
        asset itself). Best-effort: a malformed body yields None, never a 500.
        """
        try:
            if obj.page_type == Page.PAGE_TYPE_SHEET:
                return self._sheet_preview(obj)
            if obj.page_type == Page.PAGE_TYPE_WHITEBOARD:
                return self._whiteboard_preview(obj)
            if obj.page_type == Page.PAGE_TYPE_DOC:
                return self._doc_preview(obj)
        except Exception:
            return None
        return None

    def _doc_preview(self, obj):
        html = (obj.description_html or "")[: self.PREVIEW_HTML_MAX]
        if not html:
            return None
        soup = BeautifulSoup(html, "html.parser")
        blocks = []

        def push(kind, text):
            text = " ".join((text or "").split())
            if not text and kind != "img":
                return
            blocks.append({"t": kind, "x": text[: self.PREVIEW_TEXT_MAX]})

        root = soup.body or soup
        for node in root.children:
            if len(blocks) >= self.PREVIEW_BLOCK_LIMIT:
                break
            name = getattr(node, "name", None)
            if not name:
                continue
            if name in ("h1", "h2"):
                push(name, node.get_text(" ", strip=True))
            elif name in ("h3", "h4", "h5", "h6"):
                push("h3", node.get_text(" ", strip=True))
            elif name == "p":
                if node.find("img"):
                    push("img", "")
                else:
                    push("p", node.get_text(" ", strip=True))
            elif name in ("ul", "ol"):
                is_task_list = node.get("data-type") == "taskList"
                for li in node.find_all("li", recursive=False):
                    if len(blocks) >= self.PREVIEW_BLOCK_LIMIT:
                        break
                    if is_task_list:
                        checked = str(li.get("data-checked", "")).lower() == "true"
                        push("done" if checked else "todo", li.get_text(" ", strip=True))
                    else:
                        push("li", li.get_text(" ", strip=True))
            elif name == "blockquote":
                push("quote", node.get_text(" ", strip=True))
            elif name == "pre":
                push("code", node.get_text("\n", strip=True))
            elif name == "table":
                first_row = node.find("tr")
                if first_row:
                    cells = [c.get_text(" ", strip=True) for c in first_row.find_all(["td", "th"])]
                    push("table", " · ".join([c for c in cells if c][:4]))
            elif name in ("img", "figure", "image-component"):
                push("img", "")
            elif name == "div":
                if node.find("img"):
                    push("img", "")
                else:
                    push("p", node.get_text(" ", strip=True))
        if not blocks:
            return None
        return {"kind": "doc", "blocks": blocks}

    def _sheet_preview(self, obj):
        description_json = obj.description_json if isinstance(obj.description_json, dict) else {}
        snapshot = description_json.get("sheet_snapshot")
        if not isinstance(snapshot, dict):
            return None
        grids = [s for s in (snapshot.get("sheets") or []) if isinstance(s, dict)]
        if not grids:
            return None
        active = next((s for s in grids if s.get("id") == snapshot.get("activeId")), grids[0])

        def as_count(value, fallback):
            return value if isinstance(value, int) and value > 0 else fallback

        max_rows = min(as_count(active.get("rows"), 20), self.SHEET_PREVIEW_ROWS)
        max_cols = min(as_count(active.get("cols"), 8), self.SHEET_PREVIEW_COLS)

        def parse_cell_id(key):
            match = self.CELL_ID_RE.match(str(key))
            if not match:
                return None
            col = 0
            for char in match.group(1):
                col = col * 26 + (ord(char) - 64)
            return int(match.group(2)) - 1, col - 1

        raw_cells = active.get("cells") if isinstance(active.get("cells"), dict) else {}
        window = []
        for key, value in raw_cells.items():
            position = parse_cell_id(key)
            if position is None or not isinstance(value, str) or not value.strip():
                continue
            row, col = position
            if row < max_rows and col < max_cols:
                window.append((row, col, key, value))
        # Deterministic top-left-first trim when a sheet is dense.
        window.sort()
        cells = {key: value for (_, _, key, value) in window[: self.SHEET_PREVIEW_CELL_CAP]}

        raw_formats = active.get("formats") if isinstance(active.get("formats"), dict) else {}
        formats = {key: fmt for key, fmt in raw_formats.items() if key in cells and isinstance(fmt, dict)}

        col_widths = {}
        raw_widths = active.get("colWidths") if isinstance(active.get("colWidths"), dict) else {}
        for key, width in raw_widths.items():
            try:
                index = int(key)
            except (TypeError, ValueError):
                continue
            if 0 <= index < max_cols and isinstance(width, (int, float)):
                col_widths[str(index)] = width

        selects = {}
        raw_selects = active.get("selects") if isinstance(active.get("selects"), dict) else {}
        for key, select in raw_selects.items():
            try:
                index = int(key)
            except (TypeError, ValueError):
                continue
            if 0 <= index < max_cols and isinstance(select, dict):
                options = [o for o in (select.get("options") or []) if isinstance(o, dict)][:8]
                selects[str(index)] = {"options": options, "multi": bool(select.get("multi"))}

        return {
            "kind": "sheet",
            "name": str(active.get("name") or ""),
            "rows": max_rows,
            "cols": max_cols,
            "cells": cells,
            "formats": formats,
            "colWidths": col_widths,
            "selects": selects,
            "tabs": len(grids),
        }

    def _whiteboard_preview(self, obj):
        description_json = obj.description_json if isinstance(obj.description_json, dict) else {}
        snapshot = description_json.get("excalidraw_snapshot")
        if not isinstance(snapshot, dict):
            return None
        raw_elements = snapshot.get("elements")
        if not isinstance(raw_elements, list):
            return None

        elements = []
        for element in raw_elements:
            if len(elements) >= self.WHITEBOARD_PREVIEW_ELEMENTS:
                break
            if not isinstance(element, dict) or element.get("isDeleted"):
                continue
            element_type = element.get("type")
            if not isinstance(element_type, str):
                continue

            def as_number(value, fallback=0.0):
                return float(value) if isinstance(value, (int, float)) else fallback

            entry = {
                "type": element_type,
                "x": round(as_number(element.get("x"))),
                "y": round(as_number(element.get("y"))),
                "w": round(as_number(element.get("width"))),
                "h": round(as_number(element.get("height"))),
            }
            angle = element.get("angle")
            if isinstance(angle, (int, float)) and angle:
                entry["a"] = round(float(angle), 3)
            stroke = element.get("strokeColor")
            if isinstance(stroke, str):
                entry["stroke"] = stroke
            background = element.get("backgroundColor")
            if isinstance(background, str) and background != "transparent":
                entry["bg"] = background
            if element_type in ("line", "arrow", "freedraw", "draw"):
                points = element.get("points")
                if isinstance(points, list) and points:
                    stride = max(1, len(points) // self.WHITEBOARD_PREVIEW_POINTS)
                    sampled = points[::stride][: self.WHITEBOARD_PREVIEW_POINTS - 1] + [points[-1]]
                    entry["pts"] = [
                        [round(as_number(p[0])), round(as_number(p[1]))]
                        for p in sampled
                        if isinstance(p, (list, tuple)) and len(p) >= 2
                    ]
            if element_type == "text":
                text_value = element.get("text")
                if isinstance(text_value, str):
                    entry["text"] = text_value[:80]
                font_size = element.get("fontSize")
                if isinstance(font_size, (int, float)):
                    entry["fs"] = round(float(font_size))
            elements.append(entry)

        if not elements:
            return None
        app_state = snapshot.get("appState") if isinstance(snapshot.get("appState"), dict) else {}
        view_background = app_state.get("viewBackgroundColor")
        return {
            "kind": "whiteboard",
            "bg": view_background if isinstance(view_background, str) else "#ffffff",
            "els": elements,
        }


class PageVersionSerializer(BaseSerializer):
    class Meta:
        model = PageVersion
        fields = [
            "id",
            "workspace",
            "page",
            "page_type",
            "last_saved_at",
            "owned_by",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = ["workspace", "page"]


class PageVersionDetailSerializer(BaseSerializer):
    class Meta:
        model = PageVersion
        fields = [
            "id",
            "workspace",
            "page",
            "page_type",
            "last_saved_at",
            "description_binary",
            "description_html",
            "description_json",
            "owned_by",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = ["workspace", "page"]


class PageBinaryUpdateSerializer(serializers.Serializer):
    """Serializer for updating page binary description with validation"""

    description_binary = serializers.CharField(required=False, allow_blank=True)
    description_html = serializers.CharField(required=False, allow_blank=True)
    description_json = serializers.JSONField(required=False, allow_null=True)

    def validate_description_binary(self, value):
        """Validate the base64-encoded binary data"""
        if not value:
            return value

        try:
            # Decode the base64 data
            binary_data = base64.b64decode(value)

            # Validate the binary data
            is_valid, error_message = validate_binary_data(binary_data)
            if not is_valid:
                raise serializers.ValidationError(f"Invalid binary data: {error_message}")

            return binary_data
        except Exception as e:
            if isinstance(e, serializers.ValidationError):
                raise
            raise serializers.ValidationError("Failed to decode base64 data")

    def validate_description_html(self, value):
        """Validate the HTML content"""
        if not value:
            return value

        # Use the validation function from utils
        is_valid, error_message, sanitized_html = validate_html_content(value)
        if not is_valid:
            raise serializers.ValidationError(error_message)

        # Return sanitized HTML if available, otherwise return original
        return sanitized_html if sanitized_html is not None else value

    def update(self, instance, validated_data):
        """Update the page instance with validated data"""
        if "description_binary" in validated_data:
            instance.description_binary = validated_data.get("description_binary")

        if "description_html" in validated_data:
            instance.description_html = validated_data.get("description_html")

        if "description_json" in validated_data:
            instance.description_json = validated_data.get("description_json")

        instance.save()
        return instance


class PageTemplateListSerializer(BaseSerializer):
    """Compact shape used by the template picker dropdown and settings list."""

    class Meta:
        model = PageTemplate
        fields = [
            "id",
            "name",
            "description",
            "logo_props",
            "owned_by",
            "workspace",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = ["workspace", "owned_by", "created_by", "updated_by"]


class PageTemplateDetailSerializer(PageTemplateListSerializer):
    """Full template payload — includes the body. Used when editing a template
    or when instantiating one into a new Page."""

    class Meta(PageTemplateListSerializer.Meta):
        fields = PageTemplateListSerializer.Meta.fields + [
            "description_html",
            "description_json",
        ]


class PageBlockCommentSerializer(BaseSerializer):
    class Meta:
        model = PageBlockComment
        fields = [
            "id",
            "workspace",
            "page",
            "block_id",
            "parent",
            "content",
            "resolved_at",
            "resolved_by",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "workspace",
            "page",
            "created_by",
            "created_at",
            "updated_at",
            "resolved_by",
            "resolved_at",
        ]
