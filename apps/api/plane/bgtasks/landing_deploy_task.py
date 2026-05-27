# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Background deployment triggers for the public landing site."""

import logging
import os

import requests
from celery import shared_task
from django.conf import settings


logger = logging.getLogger(__name__)

_LEGACY_DEPLOY_TIMEOUT_SECONDS = 10


@shared_task(
    name="plane.bgtasks.landing_deploy_task.trigger_landing_deploy",
    bind=True,
    autoretry_for=(requests.ConnectionError, requests.Timeout),
    retry_backoff=True,
    retry_backoff_max=60,
    max_retries=2,
)
def trigger_landing_deploy(self, page_id: str, workspace_slug: str, project_id: str) -> None:
    """Trigger the legacy landing deployment hook after an essay is published."""
    deploy_hook_url = os.environ.get("DRAGONFRUIT_LANDING_DEPLOY_HOOK_URL")
    if not deploy_hook_url:
        logger.info(
            "landing deploy skipped for page_id=%s: DRAGONFRUIT_LANDING_DEPLOY_HOOK_URL is not configured",
            page_id,
        )
        return

    try:
        response = requests.post(deploy_hook_url, timeout=_LEGACY_DEPLOY_TIMEOUT_SECONDS)
        if response.status_code >= 400:
            logger.warning(
                "landing deploy hook for page_id=%s returned %d: %s",
                page_id,
                response.status_code,
                response.text[:200],
            )
    except requests.RequestException:
        logger.exception("landing deploy hook for page_id=%s failed", page_id)


@shared_task(
    name="plane.bgtasks.landing_deploy_task.trigger_landing_redeploy",
    bind=True,
    autoretry_for=(requests.ConnectionError, requests.Timeout),
    retry_backoff=True,
    retry_backoff_max=30,
    max_retries=2,
)
def trigger_landing_redeploy(self, payload: dict) -> None:
    webhook_url = (getattr(settings, "LANDING_DEPLOY_WEBHOOK_URL", "") or "").strip()
    if not webhook_url:
        return

    headers = {"Content-Type": "application/json"}
    auth_header = (getattr(settings, "LANDING_DEPLOY_WEBHOOK_AUTH_HEADER", "") or "").strip()
    if auth_header:
        headers["Authorization"] = auth_header

    timeout_seconds = int(getattr(settings, "LANDING_DEPLOY_WEBHOOK_TIMEOUT_SECONDS", 5))
    try:
        response = requests.post(webhook_url, json=payload, headers=headers, timeout=timeout_seconds)
        if response.status_code >= 400:
            logger.warning(
                "landing deploy hook returned %s: %s",
                response.status_code,
                response.text[:200],
            )
    except requests.RequestException:
        logger.exception("landing deploy hook request failed")
