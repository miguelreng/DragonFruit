# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import models
from django.db.models import Q

from plane.db.models.base import BaseModel


class AIConnectorProvider(models.TextChoices):
    CLAUDE = "claude", "Claude"
    CHATGPT = "chatgpt", "ChatGPT"
    OPENCLAW = "openclaw", "OpenClaw"
    HERMES = "hermes", "Hermes"


class AIConnectorAuthMode(models.TextChoices):
    OAUTH = "oauth", "OAuth"
    API_KEY = "api_key", "API key"
    TOKEN = "token", "Token"


class AIConnectorStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    PAUSED = "paused", "Paused"
    REVOKED = "revoked", "Revoked"
    ERROR = "error", "Error"


class WorkspaceAIConnector(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="ai_connectors")
    actor = models.ForeignKey("db.User", on_delete=models.CASCADE, related_name="workspace_ai_connectors")
    provider = models.CharField(max_length=32, choices=AIConnectorProvider.choices)
    auth_mode = models.CharField(max_length=32, choices=AIConnectorAuthMode.choices)
    status = models.CharField(max_length=16, choices=AIConnectorStatus.choices, default=AIConnectorStatus.ACTIVE)
    external_workspace_id = models.CharField(max_length=255)
    external_workspace_name = models.CharField(max_length=255, blank=True)
    external_user_id = models.CharField(max_length=255)
    # Secret/token is encrypted using Fernet; never persisted in plaintext.
    secret_encrypted = models.TextField()
    default_project = models.ForeignKey(
        "db.Project", null=True, blank=True, on_delete=models.SET_NULL, related_name="ai_connectors"
    )
    metadata = models.JSONField(default=dict)
    last_synced_at = models.DateTimeField(null=True)
    last_error = models.TextField(blank=True, null=True)

    class Meta:
        db_table = "workspace_ai_connectors"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "provider", "external_workspace_id", "external_user_id"],
                condition=Q(deleted_at__isnull=True),
                name="workspace_ai_connector_unique_active",
            )
        ]


class AIConnectorEventStatus(models.TextChoices):
    RECEIVED = "received", "Received"
    PROCESSING = "processing", "Processing"
    PROCESSED = "processed", "Processed"
    FAILED = "failed", "Failed"


class AIConnectorEvent(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="ai_connector_events")
    connector = models.ForeignKey("db.WorkspaceAIConnector", on_delete=models.CASCADE, related_name="events")
    source_message_id = models.CharField(max_length=255)
    dedupe_key = models.CharField(max_length=512)
    payload = models.JSONField(default=dict)
    status = models.CharField(max_length=16, choices=AIConnectorEventStatus.choices)
    error = models.TextField(blank=True, null=True)
    created_issue = models.ForeignKey("db.Issue", null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        db_table = "ai_connector_events"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["connector", "source_message_id"],
                condition=Q(deleted_at__isnull=True),
                name="ai_connector_event_unique_source_message",
            )
        ]
