# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import models

from .base import BaseModel


class WorkspaceAgentWebhook(BaseModel):
    """Per-workspace agent integration endpoint.

    DragonFruit doesn't bundle an LLM for `/agent` slash commands in the doc
    editor. Instead, when a user invokes the command, the dispatch endpoint
    builds a signed payload and POSTs it to this URL. Whatever sits on the
    other end (an Anthropic-backed worker, an OpenAI agent, n8n, a teammate's
    Cloudflare worker) is free to use the regular Pages/Issues API to write
    back. Fire-and-forget — the editor confirms dispatch, the agent has no
    response contract beyond a 2xx.

    The HMAC secret is stored Fernet-encrypted; receivers verify the
    `X-Dragonfruit-Signature` header (sha256=...) before trusting the body.
    """

    workspace = models.OneToOneField(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="agent_webhook",
    )
    url = models.URLField(max_length=2048)
    # Fernet-encrypted HMAC secret. Plaintext is never persisted. Use
    # plane.license.utils.encryption.decrypt_data() to read.
    secret_encrypted = models.TextField()
    is_enabled = models.BooleanField(default=True)

    class Meta:
        db_table = "workspace_agent_webhooks"
        verbose_name = "Workspace Agent Webhook"
        verbose_name_plural = "Workspace Agent Webhooks"

    def __str__(self) -> str:
        return f"{self.workspace.slug} -> {self.url}"
