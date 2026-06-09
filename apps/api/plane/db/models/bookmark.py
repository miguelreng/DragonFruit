# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from .project import ProjectBaseModel


class ProjectBookmark(ProjectBaseModel):
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    url = models.TextField(blank=True, default="")
    entity_type = models.CharField(max_length=50, blank=True, default="")
    entity_identifier = models.UUIDField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    tags = models.JSONField(default=list, blank=True)
    sort_order = models.FloatField(default=65535)
    class Meta:
        verbose_name = "Project Bookmark"
        verbose_name_plural = "Project Bookmarks"
        db_table = "project_bookmarks"
        ordering = ("-sort_order", "-created_at")
        indexes = [
            models.Index(fields=["workspace", "project"], name="bookmark_workspace_project_idx"),
            models.Index(fields=["entity_type", "entity_identifier"], name="bookmark_entity_idx"),
        ]

    def clean(self):
        super().clean()
        has_url = bool((self.url or "").strip())
        has_entity = bool(self.entity_type and self.entity_identifier)
        if not has_url and not has_entity:
            raise ValidationError("A bookmark requires either a URL or an internal entity reference.")

    def save(self, *args, **kwargs):
        if self._state.adding:
            if self.updated_by_id is None and self.created_by_id:
                self.updated_by = self.created_by
            largest = ProjectBookmark.objects.filter(project=self.project).aggregate(largest=models.Max("sort_order"))[
                "largest"
            ]
            if largest is not None:
                self.sort_order = largest + 10000
        if self.created_by_id or self.updated_by_id:
            kwargs.setdefault("disable_auto_set_user", True)
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.title


class ProjectBookmarkComment(ProjectBaseModel):
    bookmark = models.ForeignKey(ProjectBookmark, on_delete=models.CASCADE, related_name="comments")
    comment = models.TextField(blank=True, default="")
    # System/agents could author comments too, so the actor is nullable.
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="bookmark_comments",
        null=True,
    )
    edited_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Project Bookmark Comment"
        verbose_name_plural = "Project Bookmark Comments"
        db_table = "project_bookmark_comments"
        ordering = ("created_at",)
        indexes = [
            models.Index(fields=["bookmark", "created_at"], name="bookmark_comment_thread_idx"),
        ]

    def __str__(self):
        return f"{self.bookmark_id} {self.id}"
