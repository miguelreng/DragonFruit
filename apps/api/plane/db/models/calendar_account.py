# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.conf import settings
from django.db import models

from .base import BaseModel


class UserCalendarAccount(BaseModel):
    """A third-party calendar that a DragonFruit user has connected.

    Only Google is supported in v1. Tokens are Fernet-encrypted; the
    plaintext is never persisted. The "primary" calendar id is cached
    so the events list endpoint can hit Google immediately without an
    extra round trip.
    """

    PROVIDER_GOOGLE = "google"
    PROVIDER_CHOICES = ((PROVIDER_GOOGLE, "Google"),)

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="calendar_accounts",
    )
    provider = models.CharField(max_length=16, choices=PROVIDER_CHOICES, default=PROVIDER_GOOGLE)
    account_email = models.EmailField(blank=True)
    primary_calendar_id = models.CharField(max_length=255, blank=True)

    access_token_encrypted = models.TextField()
    refresh_token_encrypted = models.TextField(blank=True)
    token_expires_at = models.DateTimeField(null=True, blank=True)

    scopes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "user_calendar_accounts"
        verbose_name = "User Calendar Account"
        verbose_name_plural = "User Calendar Accounts"
        unique_together = ("user", "provider", "account_email")

    def __str__(self) -> str:
        return f"{self.user_id} :: {self.provider} :: {self.account_email}"
