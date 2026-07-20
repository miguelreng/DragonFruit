# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json
import re

# Third party imports
from celery import shared_task

# Module imports
from plane.db.models import ProjectBookmark
from plane.utils.exception_logger import log_exception

MAX_SUGGESTED_TAGS = 6
MAX_CONTEXT_CHARS = 4000
MAX_TAG_LENGTH = 32

AUTO_TAG_SYSTEM_PROMPT = (
    "You label saved bookmarks with short topical tags. "
    "Return STRICT JSON only: a single array of 3-6 lowercase tag strings, "
    "no surrounding prose, no markdown fences.\n"
    "Rules:\n"
    "- Each tag is 1-2 words, lowercase, no '#', no trailing punctuation.\n"
    "- Prefer durable topics, technologies, or domains over generic words like "
    "'article', 'website', or 'link'.\n"
    "- If there is not enough signal, return an empty array [].\n"
    'Example output: ["design", "typography", "inspiration"]'
)


def _extract_json_array(text):
    """LLM responses occasionally wrap JSON in fences or chatter. Pull the first [...] block."""
    if not text:
        return None
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\[.*\]", text, re.DOTALL)
        if not match:
            return None
        try:
            parsed = json.loads(match.group(0))
        except json.JSONDecodeError:
            return None
    return parsed if isinstance(parsed, list) else None


def _clean_tags(raw, existing):
    """Normalize model output and drop anything already on the bookmark."""
    existing_lower = {str(tag).strip().lower() for tag in existing}
    seen = set()
    cleaned = []
    for item in raw:
        if not isinstance(item, str):
            continue
        tag = item.strip().lstrip("#").strip().lower()
        if not tag or len(tag) > MAX_TAG_LENGTH:
            continue
        if tag in seen or tag in existing_lower:
            continue
        seen.add(tag)
        cleaned.append(tag)
        if len(cleaned) >= MAX_SUGGESTED_TAGS:
            break
    return cleaned


def _build_user_prompt(bookmark):
    metadata = bookmark.metadata or {}
    parts = [f"Title: {bookmark.title}"]
    if bookmark.url:
        parts.append(f"URL: {bookmark.url}")
    if bookmark.description:
        parts.append(f"Note: {bookmark.description}")
    if metadata.get("site_name"):
        parts.append(f"Site: {metadata['site_name']}")
    if metadata.get("og_title"):
        parts.append(f"Page title: {metadata['og_title']}")
    if metadata.get("og_description"):
        parts.append(f"Page description: {metadata['og_description']}")
    captured = metadata.get("captured_text")
    if isinstance(captured, str) and captured.strip():
        parts.append("Page text:\n" + captured.strip()[:MAX_CONTEXT_CHARS])
    return "\n".join(parts)


@shared_task
def auto_tag_bookmark_task(bookmark_id):
    """
    Ask the workspace's configured LLM for a few topical tags and store them as
    `metadata.suggested_tags` for the user to accept or dismiss. A no-op when no
    workspace BYOK configuration is present — auto-tagging is opt-in.
    """
    try:
        bookmark = ProjectBookmark.objects.select_related("workspace").filter(pk=bookmark_id).first()
        if bookmark is None or not bookmark.url:
            return

        # Lazy import keeps the LLM SDKs out of the web process import graph.
        from plane.app.views.external.base import call_llm_chat, get_llm_config

        api_key, model, provider = get_llm_config(workspace=bookmark.workspace)
        if not (api_key and model and provider):
            return

        raw_text, error = call_llm_chat(
            system=AUTO_TAG_SYSTEM_PROMPT,
            user=_build_user_prompt(bookmark),
            api_key=api_key,
            model=model,
            provider=provider,
            temperature=0.2,
            max_tokens=256,
        )
        if error or not raw_text:
            return

        parsed = _extract_json_array(raw_text)
        if parsed is None:
            return

        # Re-fetch so we don't clobber edits made while the LLM was running.
        fresh = ProjectBookmark.objects.filter(pk=bookmark_id).first()
        if fresh is None:
            return

        suggested = _clean_tags(parsed, fresh.tags or [])
        if not suggested:
            return

        metadata = fresh.metadata or {}
        metadata["suggested_tags"] = suggested
        fresh.metadata = metadata
        fresh.save(update_fields=["metadata"])
        return
    except Exception as e:
        log_exception(e)
        return
