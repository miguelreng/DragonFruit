# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from unittest.mock import patch

import pytest

from plane.app.serializers import PageSerializer
from plane.db.models import Page, Project, ProjectPage, WorkspaceAgentWebhook


@pytest.mark.unit
@pytest.mark.django_db
def test_public_doc_page_create_enqueues_landing_redeploy(settings, workspace, create_user):
    settings.LANDING_DEPLOY_WEBHOOK_URL = "https://example.com/deploy-hook"
    settings.LANDING_DEPLOY_WEBHOOK_COOLDOWN_SECONDS = 0

    with patch("plane.bgtasks.landing_deploy_task.trigger_landing_redeploy.delay") as mock_delay:
        page = Page.objects.create(
            name="Test Essay",
            workspace=workspace,
            owned_by=create_user,
            access=Page.PUBLIC_ACCESS,
            page_type=Page.PAGE_TYPE_DOC,
            description_html="<p>Hello</p>",
            view_props={"public_slug": "test-essay"},
        )

    assert mock_delay.call_count == 1
    payload = mock_delay.call_args.kwargs["payload"]
    assert payload["event"] == "public_page_changed"
    assert payload["page_id"] == str(page.id)
    assert payload["is_public"] is True


@pytest.mark.unit
@pytest.mark.django_db
def test_private_doc_page_create_does_not_enqueue_landing_redeploy(settings, workspace, create_user):
    settings.LANDING_DEPLOY_WEBHOOK_URL = "https://example.com/deploy-hook"
    settings.LANDING_DEPLOY_WEBHOOK_COOLDOWN_SECONDS = 0

    with patch("plane.bgtasks.landing_deploy_task.trigger_landing_redeploy.delay") as mock_delay:
        Page.objects.create(
            name="Private Draft",
            workspace=workspace,
            owned_by=create_user,
            access=Page.PRIVATE_ACCESS,
            page_type=Page.PAGE_TYPE_DOC,
        )

    mock_delay.assert_not_called()


@pytest.mark.unit
@pytest.mark.django_db
def test_public_doc_edit_enqueues_landing_redeploy(settings, workspace, create_user):
    settings.LANDING_DEPLOY_WEBHOOK_URL = "https://example.com/deploy-hook"
    settings.LANDING_DEPLOY_WEBHOOK_COOLDOWN_SECONDS = 0

    page = Page.objects.create(
        name="Public Essay",
        workspace=workspace,
        owned_by=create_user,
        access=Page.PUBLIC_ACCESS,
        page_type=Page.PAGE_TYPE_DOC,
        description_html="<p>v1</p>",
    )

    with patch("plane.bgtasks.landing_deploy_task.trigger_landing_redeploy.delay") as mock_delay:
        page.description_html = "<p>v2</p>"
        page.save(update_fields=["description_html"])

    assert mock_delay.call_count == 1


@pytest.mark.unit
@pytest.mark.django_db
def test_private_doc_publish_enqueues_essay_illustration_task(settings, workspace, create_user):
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

    with patch("plane.db.models.page.request_essay_illustration.delay") as mock_delay:
        page = Page.objects.create(
            name="Essay Draft",
            workspace=workspace,
            owned_by=create_user,
            access=Page.PRIVATE_ACCESS,
            page_type=Page.PAGE_TYPE_DOC,
        )
        ProjectPage.objects.create(project=essay_project, page=page, workspace=workspace)

        page.access = Page.PUBLIC_ACCESS
        page.save(update_fields=["access"])

    assert mock_delay.call_count == 1


@pytest.mark.unit
@pytest.mark.django_db
def test_private_doc_publish_in_essays_project_sets_public_slug(settings, workspace, create_user):
    essay_project = Project.objects.create(
        name="Essays",
        identifier="ESSAY",
        workspace=workspace,
    )
    settings.ESSAY_ILLUSTRATION_PROJECT_ID = str(essay_project.id)

    page = Page.objects.create(
        name="Essay Draft",
        workspace=workspace,
        owned_by=create_user,
        access=Page.PRIVATE_ACCESS,
        page_type=Page.PAGE_TYPE_DOC,
    )
    ProjectPage.objects.create(project=essay_project, page=page, workspace=workspace)

    page.access = Page.PUBLIC_ACCESS
    page.save(update_fields=["access"])
    page.refresh_from_db()

    assert page.view_props["public_slug"] == "essay-draft"


@pytest.mark.unit
@pytest.mark.django_db
def test_public_doc_project_link_in_essays_project_sets_public_slug(settings, workspace, create_user):
    essay_project = Project.objects.create(
        name="Essays",
        identifier="ESSAY",
        workspace=workspace,
    )
    settings.ESSAY_ILLUSTRATION_PROJECT_ID = str(essay_project.id)

    page = Page.objects.create(
        name="Public Essay",
        workspace=workspace,
        owned_by=create_user,
        access=Page.PUBLIC_ACCESS,
        page_type=Page.PAGE_TYPE_DOC,
    )
    assert page.view_props.get("public_slug") is None

    ProjectPage.objects.create(project=essay_project, page=page, workspace=workspace)
    page.refresh_from_db()

    assert page.view_props["public_slug"] == "public-essay"


@pytest.mark.unit
@pytest.mark.django_db
def test_public_slug_generation_adds_suffix_for_duplicates(settings, workspace, create_user):
    essay_project = Project.objects.create(
        name="Essays",
        identifier="ESSAY",
        workspace=workspace,
    )
    settings.ESSAY_ILLUSTRATION_PROJECT_ID = str(essay_project.id)

    page_one = Page.objects.create(
        name="Same Title",
        workspace=workspace,
        owned_by=create_user,
        access=Page.PUBLIC_ACCESS,
        page_type=Page.PAGE_TYPE_DOC,
    )
    ProjectPage.objects.create(project=essay_project, page=page_one, workspace=workspace)
    page_one.refresh_from_db()

    page_two = Page.objects.create(
        name="Same Title",
        workspace=workspace,
        owned_by=create_user,
        access=Page.PUBLIC_ACCESS,
        page_type=Page.PAGE_TYPE_DOC,
    )
    ProjectPage.objects.create(project=essay_project, page=page_two, workspace=workspace)
    page_two.refresh_from_db()

    assert page_one.view_props["public_slug"] == "same-title"
    assert page_two.view_props["public_slug"] == "same-title-2"


@pytest.mark.unit
@pytest.mark.django_db
def test_public_doc_create_in_essays_project_enqueues_essay_illustration_task(settings, workspace, create_user):
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

    serializer = PageSerializer(
        data={
            "name": "Published Essay",
            "access": Page.PUBLIC_ACCESS,
            "page_type": Page.PAGE_TYPE_DOC,
        },
        context={
            "project_id": str(essay_project.id),
            "owned_by_id": create_user.id,
            "description_json": {},
            "description_binary": None,
            "description_html": "<p></p>",
        },
    )
    assert serializer.is_valid(), serializer.errors

    with patch("plane.db.models.page.request_essay_illustration.delay") as mock_delay:
        serializer.save()

    assert mock_delay.call_count == 1


@pytest.mark.unit
@pytest.mark.django_db
def test_private_doc_publish_does_not_enqueue_essay_illustration_task_outside_essays_project(
    settings, workspace, create_user
):
    settings.ESSAY_ILLUSTRATION_PROJECT_ID = "11111111-1111-1111-1111-111111111111"
    WorkspaceAgentWebhook.objects.create(
        workspace=workspace,
        url="https://example.com/agent",
        secret_encrypted="secret",
        is_enabled=True,
    )
    other_project = Project.objects.create(
        name="Personal",
        identifier="PER",
        workspace=workspace,
    )

    with patch("plane.db.models.page.request_essay_illustration.delay") as mock_delay:
        page = Page.objects.create(
            name="Essay Draft",
            workspace=workspace,
            owned_by=create_user,
            access=Page.PRIVATE_ACCESS,
            page_type=Page.PAGE_TYPE_DOC,
        )
        ProjectPage.objects.create(project=other_project, page=page, workspace=workspace)

        page.access = Page.PUBLIC_ACCESS
        page.save(update_fields=["access"])

    assert mock_delay.call_count == 0


@pytest.mark.unit
@pytest.mark.django_db
def test_public_doc_edit_does_not_enqueue_essay_illustration_task(workspace, create_user):
    WorkspaceAgentWebhook.objects.create(
        workspace=workspace,
        url="https://example.com/agent",
        secret_encrypted="secret",
        is_enabled=True,
    )

    page = Page.objects.create(
        name="Published Essay",
        workspace=workspace,
        owned_by=create_user,
        access=Page.PUBLIC_ACCESS,
        page_type=Page.PAGE_TYPE_DOC,
    )

    with patch("plane.db.models.page.request_essay_illustration.delay") as mock_delay:
        page.name = "Published Essay Updated"
        page.save(update_fields=["name"])

    assert mock_delay.call_count == 0


@pytest.mark.unit
@pytest.mark.django_db
def test_unpublishing_public_doc_enqueues_landing_redeploy(settings, workspace, create_user):
    settings.LANDING_DEPLOY_WEBHOOK_URL = "https://example.com/deploy-hook"
    settings.LANDING_DEPLOY_WEBHOOK_COOLDOWN_SECONDS = 0

    page = Page.objects.create(
        name="Public Essay",
        workspace=workspace,
        owned_by=create_user,
        access=Page.PUBLIC_ACCESS,
        page_type=Page.PAGE_TYPE_DOC,
    )

    with patch("plane.bgtasks.landing_deploy_task.trigger_landing_redeploy.delay") as mock_delay:
        page.access = Page.PRIVATE_ACCESS
        page.save(update_fields=["access"])

    assert mock_delay.call_count == 1
    payload = mock_delay.call_args.kwargs["payload"]
    assert payload["is_public"] is False


@pytest.mark.unit
@pytest.mark.django_db
def test_landing_redeploy_cooldown_skips_repeated_updates(settings, workspace, create_user):
    settings.LANDING_DEPLOY_WEBHOOK_URL = "https://example.com/deploy-hook"
    settings.LANDING_DEPLOY_WEBHOOK_COOLDOWN_SECONDS = 300

    page = Page.objects.create(
        name="Public Essay",
        workspace=workspace,
        owned_by=create_user,
        access=Page.PUBLIC_ACCESS,
        page_type=Page.PAGE_TYPE_DOC,
        description_html="<p>v1</p>",
    )

    with patch("plane.bgtasks.landing_deploy_task.trigger_landing_redeploy.delay") as mock_delay:
        page.description_html = "<p>v2</p>"
        page.save(update_fields=["description_html"])
        page.description_html = "<p>v3</p>"
        page.save(update_fields=["description_html"])

    assert mock_delay.call_count == 1
