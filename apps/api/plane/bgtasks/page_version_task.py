# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only

import json

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from plane.db.models import Page, PageVersion
from plane.utils.exception_logger import log_exception

PAGE_VERSION_TASK_TIMEOUT = 600
PAGE_VERSION_LIMIT = 20


def _canonical_body(page_type, description_html, description_json):
    """Return the body representation that determines whether a page changed."""
    if page_type == Page.PAGE_TYPE_SHEET:
        return json.dumps(description_json or {}, sort_keys=True, separators=(",", ":"), default=str)
    return json.dumps(
        {
            "description_html": description_html or "",
            "description_json": description_json or {},
        },
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )


def _version_body(version):
    return _canonical_body(version.page_type, version.description_html, version.description_json)


@shared_task
def track_page_version(page_id, existing_instance, user_id):
    try:
        previous = json.loads(existing_instance) if existing_instance else {}

        with transaction.atomic():
            page = Page.objects.select_for_update().get(id=page_id)
            current_body = _canonical_body(page.page_type, page.description_html, page.description_json)
            previous_body = _canonical_body(
                previous.get("page_type", page.page_type),
                previous.get("description_html"),
                previous.get("description_json"),
            )
            if previous_body == current_body:
                return

            now = timezone.now()
            versions = PageVersion.objects.select_for_update().filter(page_id=page_id).order_by("-created_at")
            latest = versions.first()

            # A delayed task may observe a body already captured by an earlier task.
            if latest and _version_body(latest) == current_body:
                return

            # A restore is a change back to an older body. Never coalesce it into
            # the latest entry, otherwise the pre-restore state would be lost.
            is_restore = any(_version_body(version) == current_body for version in versions[1:PAGE_VERSION_LIMIT])
            can_coalesce = (
                latest is not None
                and str(latest.owned_by_id) == str(user_id)
                and (now - latest.created_at).total_seconds() <= PAGE_VERSION_TASK_TIMEOUT
                and not is_restore
            )

            snapshot = {
                "page_type": page.page_type,
                "description_html": page.description_html,
                "description_binary": page.description_binary,
                "description_json": page.description_json,
                "description_stripped": page.description_stripped,
                "sub_pages_data": {},
                "last_saved_at": now,
            }

            if can_coalesce:
                for field, value in snapshot.items():
                    setattr(latest, field, value)
                latest.save(update_fields=[*snapshot.keys(), "updated_at"])
            else:
                PageVersion.objects.create(
                    page_id=page_id,
                    workspace_id=page.workspace_id,
                    owned_by_id=user_id,
                    **snapshot,
                )

            stale_ids = list(versions.values_list("id", flat=True)[PAGE_VERSION_LIMIT:])
            if stale_ids:
                PageVersion.objects.filter(id__in=stale_ids).delete()
    except Page.DoesNotExist:
        return
    except Exception as error:
        log_exception(error)
