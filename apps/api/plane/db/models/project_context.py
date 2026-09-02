# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only

"""Bounded external evidence attached to a DragonFruit project.

These records intentionally do not reuse AgentMemory. A context source is an
auditable copy of a user-selected external root; it may inform Atlas, but it
can never silently become canonical workspace or project guidance.
"""

from django.conf import settings
from django.db import models

from .base import BaseModel


class ProjectContextConnection(BaseModel):
    """An encrypted, user-owned credential for a context provider.

    Connections live at the workspace boundary so a person can reuse their
    Drive account across projects without sharing an OAuth token with other
    workspace members. Sources reference a connection but never serialize its
    secrets.
    """

    PROVIDER_GOOGLE_DRIVE = "google_drive"
    PROVIDER_CHOICES = ((PROVIDER_GOOGLE_DRIVE, "Google Drive"),)

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="project_context_connections",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="project_context_connections",
    )
    provider = models.CharField(max_length=32, choices=PROVIDER_CHOICES)
    account_email = models.EmailField(blank=True)
    access_token_encrypted = models.TextField()
    refresh_token_encrypted = models.TextField(blank=True)
    token_expires_at = models.DateTimeField(null=True, blank=True)
    scopes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "project_context_connections"
        verbose_name = "Project Context Connection"
        verbose_name_plural = "Project Context Connections"
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "user", "provider", "account_email"],
                condition=models.Q(deleted_at__isnull=True),
                name="project_context_connection_unique_account_when_active",
            ),
        ]
        indexes = [models.Index(fields=["workspace", "user", "provider", "is_active"])]

    def __str__(self) -> str:
        return f"{self.user_id}: {self.provider} ({self.account_email or 'unknown account'})"


class ProjectContextSource(BaseModel):
    """One selected external root, such as a Google Drive folder."""

    PROVIDER_GOOGLE_DRIVE = "google_drive"
    PROVIDER_MANUAL = "manual"
    PROVIDER_CHOICES = (
        (PROVIDER_GOOGLE_DRIVE, "Google Drive"),
        (PROVIDER_MANUAL, "Manual import"),
    )

    STATUS_PENDING = "pending"
    STATUS_ACTIVE = "active"
    STATUS_STALE = "stale"
    STATUS_ERROR = "error"
    STATUS_DISCONNECTED = "disconnected"
    STATUS_CHOICES = (
        (STATUS_PENDING, "Pending"),
        (STATUS_ACTIVE, "Active"),
        (STATUS_STALE, "Stale"),
        (STATUS_ERROR, "Error"),
        (STATUS_DISCONNECTED, "Disconnected"),
    )

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="project_context_sources",
    )
    project = models.ForeignKey(
        "db.Project",
        on_delete=models.CASCADE,
        related_name="context_sources",
    )
    connection = models.ForeignKey(
        ProjectContextConnection,
        on_delete=models.SET_NULL,
        related_name="sources",
        null=True,
        blank=True,
    )
    provider = models.CharField(max_length=32, choices=PROVIDER_CHOICES)
    # Provider-side id of the only root this source is allowed to read. It is
    # deliberately not a URL: callers cannot turn this API into an open proxy.
    root_external_id = models.CharField(max_length=255)
    display_name = models.CharField(max_length=255)
    status = models.CharField(max_length=24, choices=STATUS_CHOICES, default=STATUS_PENDING)
    # Compact, user-reviewable configuration (selected exact paths and a
    # manifest hash). Provider credentials never belong here.
    selection_config = models.JSONField(default=dict, blank=True)
    last_refreshed_at = models.DateTimeField(null=True, blank=True)
    last_error_code = models.CharField(max_length=64, blank=True, default="")

    class Meta:
        db_table = "project_context_sources"
        verbose_name = "Project Context Source"
        verbose_name_plural = "Project Context Sources"
        ordering = ("-updated_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["project", "provider", "root_external_id"],
                condition=models.Q(deleted_at__isnull=True),
                name="project_context_source_unique_root_when_active",
            ),
        ]
        indexes = [
            models.Index(fields=["workspace", "project", "status"]),
            models.Index(fields=["workspace", "provider"]),
        ]

    def __str__(self) -> str:
        return f"{self.project.name}: {self.display_name}"


class ProjectSourceFile(BaseModel):
    """A file discovered beneath one selected source root."""

    source = models.ForeignKey(
        ProjectContextSource,
        on_delete=models.CASCADE,
        related_name="files",
    )
    external_id = models.CharField(max_length=255)
    relative_path = models.CharField(max_length=1024)
    mime_type = models.CharField(max_length=255, blank=True, default="")
    size_bytes = models.PositiveBigIntegerField(default=0)
    is_eligible = models.BooleanField(default=False)
    exclusion_reason = models.CharField(max_length=96, blank=True, default="")

    class Meta:
        db_table = "project_source_files"
        verbose_name = "Project Source File"
        verbose_name_plural = "Project Source Files"
        ordering = ("relative_path",)
        constraints = [
            models.UniqueConstraint(
                fields=["source", "external_id"],
                condition=models.Q(deleted_at__isnull=True),
                name="project_source_file_unique_external_when_active",
            ),
            models.UniqueConstraint(
                fields=["source", "relative_path"],
                condition=models.Q(deleted_at__isnull=True),
                name="project_source_file_unique_path_when_active",
            ),
        ]
        indexes = [
            models.Index(fields=["source", "is_eligible"]),
            models.Index(fields=["source", "relative_path"]),
        ]

    def __str__(self) -> str:
        return self.relative_path


class ProjectSourceRevision(BaseModel):
    """Immutable extracted-text snapshot of a discovered source file."""

    source_file = models.ForeignKey(
        ProjectSourceFile,
        on_delete=models.CASCADE,
        related_name="revisions",
    )
    provider_revision = models.CharField(max_length=255, blank=True, default="")
    content_hash = models.CharField(max_length=64)
    extracted_text = models.TextField(blank=True, default="")
    size_bytes = models.PositiveBigIntegerField(default=0)
    is_truncated = models.BooleanField(default=False)

    class Meta:
        db_table = "project_source_revisions"
        verbose_name = "Project Source Revision"
        verbose_name_plural = "Project Source Revisions"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["source_file", "content_hash"],
                name="project_source_revision_unique_content_hash",
            ),
        ]
        indexes = [
            models.Index(fields=["source_file", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.source_file.relative_path} @ {self.content_hash[:12]}"
