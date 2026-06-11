# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Thin Wikipedia REST API client for Atlas grounding.

Two public helpers:
  - search_wikipedia(query, *, lang, limit) → list of hit dicts
  - wikipedia_summary(title, *, lang) → summary dict or None

Both are safe to call from the agent loop: they never raise — all
network/parsing errors are caught and return empty/None so the loop
can carry on without a citation.
"""

import logging

import requests

logger = logging.getLogger(__name__)

_USER_AGENT = "DragonFruit-Atlas/1.0 (https://dragonfruit.sh)"
_TIMEOUT = 6  # seconds


def search_wikipedia(query: str, *, lang: str = "en", limit: int = 3) -> list[dict]:
    """Search Wikipedia and return the top hits.

    Returns a list of dicts with keys ``title``, ``description``, and ``key``.
    Returns an empty list on any error (network, non-200, bad JSON).
    """
    query = (query or "").strip()
    if not query:
        return []
    url = f"https://{lang}.wikipedia.org/w/rest.php/v1/search/page"
    params = {"q": query, "limit": max(1, min(limit, 10))}
    try:
        response = requests.get(
            url,
            params=params,
            headers={"User-Agent": _USER_AGENT},
            timeout=_TIMEOUT,
        )
        if response.status_code != 200:
            logger.warning(
                "wikipedia search returned %s for query=%r", response.status_code, query
            )
            return []
        data = response.json()
        pages = data.get("pages") if isinstance(data, dict) else None
        if not isinstance(pages, list):
            return []
        results = []
        for page in pages:
            if not isinstance(page, dict):
                continue
            title = str(page.get("title") or "").strip()
            key = str(page.get("key") or title).strip()
            description = str(page.get("description") or "").strip()
            if title:
                results.append({"title": title, "description": description, "key": key})
        return results
    except Exception:  # noqa: BLE001
        logger.warning("wikipedia search failed for query=%r", query, exc_info=True)
        return []


def wikipedia_summary(title: str, *, lang: str = "en") -> dict | None:
    """Fetch the summary for a Wikipedia article by title.

    Returns a dict with keys ``title``, ``extract``, ``url``, and
    ``thumbnail`` (may be None), or None on any error.
    """
    title = (title or "").strip()
    if not title:
        return None
    encoded = requests.utils.quote(title, safe="")
    url = f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{encoded}"
    try:
        response = requests.get(
            url,
            headers={"User-Agent": _USER_AGENT},
            timeout=_TIMEOUT,
        )
        if response.status_code != 200:
            logger.warning(
                "wikipedia summary returned %s for title=%r", response.status_code, title
            )
            return None
        data = response.json()
        if not isinstance(data, dict):
            return None
        result_title = str(data.get("title") or title).strip()
        extract = str(data.get("extract") or "").strip()
        content_urls = data.get("content_urls")
        url_out = ""
        if isinstance(content_urls, dict):
            desktop = content_urls.get("desktop")
            if isinstance(desktop, dict):
                url_out = str(desktop.get("page") or "").strip()
        thumbnail_src = None
        thumbnail = data.get("thumbnail")
        if isinstance(thumbnail, dict):
            thumbnail_src = str(thumbnail.get("source") or "").strip() or None
        return {
            "title": result_title,
            "extract": extract,
            "url": url_out,
            "thumbnail": thumbnail_src,
        }
    except Exception:  # noqa: BLE001
        logger.warning("wikipedia summary failed for title=%r", title, exc_info=True)
        return None
