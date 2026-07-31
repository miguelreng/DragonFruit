# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json
from time import perf_counter

import pytest
from rest_framework import status
from rest_framework.test import APIRequestFactory, force_authenticate

from plane.app.views.agent.chat import AgentChatDocWriteEndpoint
from plane.db.models import Agent, AgentChatSession, Page, Project, ProjectMember, ProjectPage


def _text_block(block_id, text):
    return {
        "type": "paragraph",
        "attrs": {"id": block_id},
        "content": [{"type": "text", "text": text}],
    }


def _events(response):
    body = b"".join(response.streaming_content).decode("utf-8")
    return [json.loads(line) for line in body.splitlines() if line.strip()]


@pytest.fixture
def doc_write_rows(workspace, create_user, create_bot_user):
    project = Project.objects.create(
        workspace=workspace,
        name="Atlas document checks",
        identifier="ATLAS",
        created_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    page = Page.objects.create(
        workspace=workspace,
        name="Renji launch brief",
        owned_by=create_user,
        created_by=create_user,
    )
    ProjectPage.objects.create(workspace=workspace, project=project, page=page)
    agent = Agent.objects.create(
        workspace=workspace,
        bot_user=create_bot_user,
        name="Atlas",
        provider_model="",
        api_key_encrypted="",
    )
    session = AgentChatSession.objects.create(
        workspace=workspace,
        user=create_user,
        agent=agent,
        title="Document review",
        scope_type="page",
        page=page,
    )
    return project, page, session


def _post_doc_write(*, workspace, user, project, page, session, prompt, title, body_text):
    request = APIRequestFactory().post(
        "/",
        {
            "prompt": prompt,
            "page_id": str(page.id),
            "project_id": str(project.id),
            "mode": "update",
            "intent": "replace",
            "document_snapshot": {
                "version": "snapshot-contract-1",
                "title": {"text": title, "json": {"type": "doc", "content": []}},
                "body": {
                    "markdown": body_text,
                    "json": {"type": "doc", "content": [_text_block("body-1", body_text)]},
                },
            },
        },
        format="json",
    )
    force_authenticate(request, user=user)
    return AgentChatDocWriteEndpoint.as_view()(
        request,
        slug=workspace.slug,
        session_id=session.id,
    )


@pytest.mark.django_db
def test_spanish_replace_covers_real_title_and_body_without_llm_configuration(
    workspace, create_user, doc_write_rows
):
    project, page, session = doc_write_rows

    response = _post_doc_write(
        workspace=workspace,
        user=create_user,
        project=project,
        page=page,
        session=session,
        prompt="Reemplaza 'Renji' por 'Rengi' en todo el documento. No cambies nada más.",
        title="Renji launch brief",
        body_text="Notes about Renji and the launch.",
    )

    assert response.status_code == status.HTTP_200_OK
    events = _events(response)
    completed = [event for event in events if event["event"] == "proposal_completed"]
    assert [(event["surface"], event["content_text"]) for event in completed] == [
        ("title", "Rengi launch brief"),
        ("body", "Notes about Rengi and the launch."),
    ]
    assert events[-1]["event"] == "session_completed"
    assert events[-1]["proposal_count"] == 2
    assert events[-1]["coverage"] == {"processed_blocks": 2, "total_blocks": 2}
    assert "I drafted" not in events[-1]["assistant_message"]["content"]


@pytest.mark.parametrize(
    ("prompt_template", "message_markers"),
    [
        (
            "Reemplaza '__missing_{index}__' por '__replacement_{index}__' en todo el documento.",
            ("No cambié nada", "intacto", "No se prepararon cambios"),
        ),
        (
            "Replace '__missing_{index}__' with '__replacement_{index}__' throughout the document.",
            ("nothing was changed", "left it untouched", "No changes were prepared"),
        ),
    ],
    ids=["es", "en"],
)
@pytest.mark.django_db
def test_literal_noop_endpoint_has_sub_two_second_p95_without_provider(
    workspace,
    create_user,
    doc_write_rows,
    prompt_template,
    message_markers,
):
    project, page, session = doc_write_rows
    durations = []

    for index in range(20):
        started_at = perf_counter()
        response = _post_doc_write(
            workspace=workspace,
            user=create_user,
            project=project,
            page=page,
            session=session,
            prompt=prompt_template.format(index=index),
            title="Launch brief",
            body_text="Nothing in this document matches the requested token.",
        )
        events = _events(response)
        durations.append(perf_counter() - started_at)

        assert response.status_code == status.HTTP_200_OK
        assert not any(event["event"] == "proposal_completed" for event in events)
        assert events[-1]["event"] == "session_completed"
        assert events[-1]["proposal_count"] == 0
        message = events[-1]["assistant_message"]["content"]
        assert any(marker in message for marker in message_markers)

    p95 = sorted(durations)[int(len(durations) * 0.95) - 1]
    assert p95 < 2
