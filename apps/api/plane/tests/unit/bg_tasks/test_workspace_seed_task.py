# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json

import pytest

from plane.bgtasks.workspace_seed_task import (
    create_pages,
    create_project_and_member,
    read_seed_file,
)
from plane.db.models import Page, Project, ProjectPage


def test_workspace_seed_copy_is_branded_for_dragonfruit():
    seed_names = ("projects.json", "issues.json", "pages.json", "cycles.json")

    combined_seed = " ".join(json.dumps(read_seed_file(name)) for name in seed_names)

    assert "DragonFruit" in combined_seed
    assert "Plane" not in combined_seed


@pytest.mark.django_db
def test_seed_project_disables_hidden_planning_features(workspace, create_user):
    project_map = create_project_and_member(workspace, create_user)

    project = Project.objects.get(id=project_map[1])
    assert project.cycle_view is False
    assert project.module_view is False
    assert project.issue_views_view is False


@pytest.mark.django_db
def test_seed_creates_populated_canonical_brief(workspace, create_user):
    project_map = create_project_and_member(workspace, create_user)

    create_pages(workspace, project_map, create_user)

    brief = Page.objects.get(workspace=workspace, is_brief=True)
    assert brief.name == "Project Brief"
    assert brief.page_type == Page.PAGE_TYPE_DOC
    assert "Welcome to DragonFruit" in brief.description_html
    assert "Atlas reads it" in brief.description_html
    assert ProjectPage.objects.filter(
        workspace=workspace,
        project_id=project_map[1],
        page=brief,
    ).exists()
