# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Background trigger for landing-site redeploys.

When a public doc used as a landing essay changes, we optionally notify an
external deploy hook (for example Vercel's Deploy Hook URL) so static landing
pages rebuild automatically.
"""

import logging

import requests
from celery import shared_task
from django.conf import settings


logger = logging.getLogger(__name__)


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
