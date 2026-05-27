# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json
from unittest.mock import patch

import pytest

from plane.bgtasks.essay_illustration_task import (
    ESSAY_ILLUSTRATION_ASPECT_RATIO,
    ESSAY_ILLUSTRATION_HEIGHT,
    ESSAY_ILLUSTRATION_STYLE,
    ESSAY_ILLUSTRATION_VIEW_PROPS_KEY,
    ESSAY_ILLUSTRATION_WIDTH,
    request_essay_illustration,
)
from plane.db.models import Page, Project, ProjectPage, WorkspaceAgentWebhook


@pytest.mark.unit
@pytest.mark.django_db
def test_request_essay_illustration_dispatches_to_webhook(settings, workspace, create_user):
    settings.ESSAY_ILLUSTRATION_AGENT_SELECTOR = "agent-1"
    WorkspaceAgentWebhook.objects.create(
        workspace=workspace,
        url="https://example.com/agent",
        secret_encrypted="secret",
        is_enabled=True,
    )
    essay_project = Project.objects.create(
        name="Essays",
        identifier="ESSAY",
        workspace=workspace,
    )
    settings.ESSAY_ILLUSTRATION_PROJECT_ID = str(essay_project.id)

    page = Page.objects.create(
        name="Published Essay",
        workspace=workspace,
        owned_by=create_user,
        access=Page.PUBLIC_ACCESS,
        page_type=Page.PAGE_TYPE_DOC,
    )
    ProjectPage.objects.create(project=essay_project, page=page, workspace=workspace)

    with (
        patch("plane.bgtasks.essay_illustration_task.dispatch_agent_webhook.delay") as mock_dispatch,
        patch("plane.bgtasks.essay_illustration_task.decrypt_data", return_value="shared-secret"),
    ):
        request_essay_illustration(str(page.id))

    mock_dispatch.assert_called_once()
    payload = json.loads(mock_dispatch.call_args.kwargs["body"].decode("utf-8"))
    assert payload["image_spec"] == {
        "width": ESSAY_ILLUSTRATION_WIDTH,
        "height": ESSAY_ILLUSTRATION_HEIGHT,
        "aspect_ratio": ESSAY_ILLUSTRATION_ASPECT_RATIO,
        "style": ESSAY_ILLUSTRATION_STYLE,
    }
    assert f"{ESSAY_ILLUSTRATION_WIDTH}x{ESSAY_ILLUSTRATION_HEIGHT}px" in payload["prompt"]
    assert ESSAY_ILLUSTRATION_STYLE in payload["prompt"]

    page.refresh_from_db()
    assert isinstance(page.view_props, dict)
    illustration = page.view_props.get(ESSAY_ILLUSTRATION_VIEW_PROPS_KEY)
    assert isinstance(illustration, dict)
    assert illustration.get("status") == "dispatched"
    assert illustration.get("agent") == "agent-1"


@pytest.mark.unit
@pytest.mark.django_db
def test_request_essay_illustration_skips_when_ready(settings, workspace, create_user):
    WorkspaceAgentWebhook.objects.create(
        workspace=workspace,
        url="https://example.com/agent",
        secret_encrypted="secret",
        is_enabled=True,
    )
    essay_project = Project.objects.create(
        name="Essays",
        identifier="ESSAY",
        workspace=workspace,
    )
    settings.ESSAY_ILLUSTRATION_PROJECT_ID = str(essay_project.id)

    page = Page.objects.create(
        name="Published Essay",
        workspace=workspace,
        owned_by=create_user,
        access=Page.PUBLIC_ACCESS,
        page_type=Page.PAGE_TYPE_DOC,
        view_props={
            ESSAY_ILLUSTRATION_VIEW_PROPS_KEY: {
                "status": "ready",
                "image": "https://assets.dragonfruit.sh/essays/cover.png",
            },
        },
    )
    ProjectPage.objects.create(project=essay_project, page=page, workspace=workspace)

    with patch("plane.bgtasks.essay_illustration_task.dispatch_agent_webhook.delay") as mock_dispatch:
        request_essay_illustration(str(page.id))

    mock_dispatch.assert_not_called()


@pytest.mark.unit
@pytest.mark.django_db
def test_request_essay_illustration_skips_private_pages(settings, workspace, create_user):
    WorkspaceAgentWebhook.objects.create(
        workspace=workspace,
        url="https://example.com/agent",
        secret_encrypted="secret",
        is_enabled=True,
    )
    essay_project = Project.objects.create(
        name="Essays",
        identifier="ESSAY",
        workspace=workspace,
    )
    settings.ESSAY_ILLUSTRATION_PROJECT_ID = str(essay_project.id)

    page = Page.objects.create(
        name="Private Essay",
        workspace=workspace,
        owned_by=create_user,
        access=Page.PRIVATE_ACCESS,
        page_type=Page.PAGE_TYPE_DOC,
    )
    ProjectPage.objects.create(project=essay_project, page=page, workspace=workspace)

    with patch("plane.bgtasks.essay_illustration_task.dispatch_agent_webhook.delay") as mock_dispatch:
        request_essay_illustration(str(page.id))

    mock_dispatch.assert_not_called()


@pytest.mark.unit
@pytest.mark.django_db
def test_request_essay_illustration_skips_pages_outside_essays_project(settings, workspace, create_user):
    settings.ESSAY_ILLUSTRATION_PROJECT_ID = "11111111-1111-1111-1111-111111111111"
    WorkspaceAgentWebhook.objects.create(
        workspace=workspace,
        url="https://example.com/agent",
        secret_encrypted="secret",
        is_enabled=True,
    )
    other_project = Project.objects.create(
        name="Other",
        identifier="OTHER",
        workspace=workspace,
    )

    with patch("plane.bgtasks.essay_illustration_task.dispatch_agent_webhook.delay") as mock_dispatch:
        page = Page.objects.create(
            name="Published Essay",
            workspace=workspace,
            owned_by=create_user,
            access=Page.PUBLIC_ACCESS,
            page_type=Page.PAGE_TYPE_DOC,
        )
        ProjectPage.objects.create(project=other_project, page=page, workspace=workspace)
        request_essay_illustration(str(page.id))

    mock_dispatch.assert_not_called()
