import json

import pytest

from plane.bgtasks.page_version_task import track_page_version
from plane.db.models import Page, PageVersion


def previous_body(page_type, description_html="<p></p>", description_json=None):
    return json.dumps(
        {
            "page_type": page_type,
            "description_html": description_html,
            "description_json": description_json or {},
        }
    )


@pytest.mark.unit
@pytest.mark.django_db
def test_sheet_json_change_creates_typed_version(workspace, create_user):
    old_snapshot = {"sheet_snapshot": {"rows": 1, "cols": 1, "cells": {"A1": "old"}}}
    new_snapshot = {"sheet_snapshot": {"rows": 1, "cols": 1, "cells": {"A1": "new"}}}
    page = Page.objects.create(
        name="Budget",
        workspace=workspace,
        owned_by=create_user,
        page_type=Page.PAGE_TYPE_SHEET,
        description_json=new_snapshot,
    )

    track_page_version(str(page.id), previous_body(Page.PAGE_TYPE_SHEET, description_json=old_snapshot), create_user.id)

    version = PageVersion.objects.get(page=page)
    assert version.page_type == Page.PAGE_TYPE_SHEET
    assert version.description_json == new_snapshot


@pytest.mark.unit
@pytest.mark.django_db
def test_same_author_changes_coalesce_inside_window(workspace, create_user):
    page = Page.objects.create(
        name="Notes",
        workspace=workspace,
        owned_by=create_user,
        page_type=Page.PAGE_TYPE_DOC,
        description_html="<p>two</p>",
    )
    track_page_version(str(page.id), previous_body(Page.PAGE_TYPE_DOC, "<p>one</p>"), create_user.id)

    page.description_html = "<p>three</p>"
    page.save(update_fields=["description_html"])
    track_page_version(str(page.id), previous_body(Page.PAGE_TYPE_DOC, "<p>two</p>"), create_user.id)

    assert PageVersion.objects.filter(page=page).count() == 1
    assert PageVersion.objects.get(page=page).description_html == "<p>three</p>"


@pytest.mark.unit
@pytest.mark.django_db
def test_restore_to_older_body_preserves_pre_restore_version(workspace, create_user):
    page = Page.objects.create(
        name="Recovery",
        workspace=workspace,
        owned_by=create_user,
        page_type=Page.PAGE_TYPE_DOC,
        description_html="<p>old</p>",
    )
    PageVersion.objects.create(
        page=page,
        workspace=workspace,
        owned_by=create_user,
        page_type=Page.PAGE_TYPE_DOC,
        description_html="<p>old</p>",
    )
    PageVersion.objects.create(
        page=page,
        workspace=workspace,
        owned_by=create_user,
        page_type=Page.PAGE_TYPE_DOC,
        description_html="<p>current</p>",
    )

    track_page_version(str(page.id), previous_body(Page.PAGE_TYPE_DOC, "<p>current</p>"), create_user.id)

    versions = list(PageVersion.objects.filter(page=page).order_by("created_at"))
    assert len(versions) == 3
    assert versions[-2].description_html == "<p>current</p>"
    assert versions[-1].description_html == "<p>old</p>"
