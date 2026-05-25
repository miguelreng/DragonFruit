# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import models
from django.db.models import Q

from .project import ProjectBaseModel


class ProjectCustomField(ProjectBaseModel):
    FIELD_TYPE_CHOICES = (
        ("text", "Text"),
        ("number", "Number"),
        ("date", "Date"),
        ("boolean", "Boolean"),
        ("select", "Select"),
        ("multi_select", "Multi Select"),
    )

    name = models.CharField(max_length=255)
    field_type = models.CharField(max_length=40, choices=FIELD_TYPE_CHOICES, default="text")
    config = models.JSONField(default=dict, blank=True)
    sort_order = models.FloatField(default=65535)

    class Meta:
        verbose_name = "Project Custom Field"
        verbose_name_plural = "Project Custom Fields"
        db_table = "project_custom_fields"
        ordering = ("sort_order", "created_at")
        constraints = [
            models.UniqueConstraint(
                fields=["project", "name"],
                condition=Q(deleted_at__isnull=True),
                name="project_custom_field_unique_project_name_when_deleted_at_null",
            )
        ]

    def __str__(self):
        return f"{self.name} <{self.project.name}>"
