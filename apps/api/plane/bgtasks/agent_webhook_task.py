# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Background dispatch for the workspace agent webhook.

The `/agent` slash command in the doc editor fires an HMAC-signed POST at
whatever URL the workspace admin has configured. Before this task existed,
the dispatch happened synchronously inside the view — which meant:

  - a slow or unreachable webhook held a gunicorn worker hostage for up to
    5 s (the request timeout) per editor invocation
  - any network blip surfaced as a 502 to the editor, even though the
    contract is fire-and-forget and the user doesn't really care
  - the editor UI couldn't return to the user until the HTTP round-trip
    finished, even though we never use the response

Moving the dispatch to Celery means the view does the cheap work (look
up the webhook, sign the body, build the headers) and returns 202
immediately. The worker handles the outbound POST on its own time and
just logs failures.
"""

import logging

import requests
from celery import shared_task


logger = logging.getLogger(__name__)


_DISPATCH_TIMEOUT_SECONDS = 5


@shared_task(
    name="plane.bgtasks.agent_webhook_task.dispatch_agent_webhook",
    bind=True,
    # Retry transient network failures a couple of times with backoff so a
    # flaky receiver doesn't drop dispatches outright. Won't retry on a 4xx
    # because that means the URL itself is bad and retrying won't help.
    autoretry_for=(requests.ConnectionError, requests.Timeout),
    retry_backoff=True,
    retry_backoff_max=30,
    max_retries=2,
)
def dispatch_agent_webhook(self, url: str, body: bytes, headers: dict, dispatch_id: str) -> None:
    """POST a signed payload to the workspace's agent webhook.

    `body` is the exact bytes used to compute the HMAC in the view — we
    re-send them verbatim so the receiver's signature check matches. All
    interesting state (the prompt, workspace, user, signature) is already
    in `body` and `headers`; this function intentionally knows nothing
    about agents.
    """
    try:
        resp = requests.post(url, data=body, headers=headers, timeout=_DISPATCH_TIMEOUT_SECONDS)
        if resp.status_code >= 400:
            logger.warning(
                "agent_webhook dispatch_id=%s -> %s returned %d: %s",
                dispatch_id,
                url,
                resp.status_code,
                resp.text[:200],
            )
    except requests.RequestException:
        # autoretry_for handles ConnectionError/Timeout. Anything else
        # (RequestException subclass we don't retry on) we log and drop.
        logger.exception("agent_webhook dispatch_id=%s -> %s failed", dispatch_id, url)
