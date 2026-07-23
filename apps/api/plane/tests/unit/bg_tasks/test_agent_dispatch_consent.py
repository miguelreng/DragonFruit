# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from unittest.mock import patch

import pytest

from plane.bgtasks.agent_dispatch_task import dispatch_agent_event
from plane.bgtasks.workflow_task import enqueue_workflows_for_issue, run_workflow
from plane.db.models import (
    Agent,
    Issue,
    IssueAssignee,
    Project,
    State,
    Workflow,
    WorkflowNode,
    WorkflowRun,
)


def _make_agent_and_issue(workspace, bot_user):
    agent = Agent.objects.create(
        workspace=workspace,
        bot_user=bot_user,
        name="Atlas",
        triggers={
            "issue_created": True,
            "assigned": True,
            "mentioned": True,
            "state_change": False,
            "comment": False,
        },
    )
    project = Project.objects.create(
        name="Consent Project",
        identifier="CNS",
        workspace=workspace,
        network=0,
    )
    state = State.objects.create(
        name="Open",
        group="started",
        project=project,
        workspace=workspace,
        color="#fff",
    )
    issue = Issue.objects.create(
        name="Consent task",
        project=project,
        workspace=workspace,
        state=state,
    )
    return agent, issue


@pytest.mark.django_db
def test_direct_task_created_event_cannot_start_atlas(workspace, create_bot_user):
    agent, issue = _make_agent_and_issue(workspace, create_bot_user)

    with patch("plane.bgtasks.agent_dispatch_task.run_agent_on_issue") as mock_run:
        dispatch_agent_event(str(agent.id), str(issue.id), "issue_created")

    mock_run.assert_not_called()


@pytest.mark.django_db
def test_stale_assignment_event_cannot_start_unassigned_atlas(workspace, create_bot_user):
    agent, issue = _make_agent_and_issue(workspace, create_bot_user)

    with patch("plane.bgtasks.agent_dispatch_task.run_agent_on_issue") as mock_run:
        dispatch_agent_event(str(agent.id), str(issue.id), "assigned")

    mock_run.assert_not_called()


@pytest.mark.django_db
def test_active_assignment_can_start_atlas(workspace, create_bot_user):
    agent, issue = _make_agent_and_issue(workspace, create_bot_user)
    IssueAssignee.objects.create(
        issue=issue,
        assignee=agent.bot_user,
        project=issue.project,
        workspace=workspace,
    )

    with patch("plane.bgtasks.agent_dispatch_task.run_agent_on_issue") as mock_run:
        dispatch_agent_event(str(agent.id), str(issue.id), "assigned")

    mock_run.assert_called_once_with(agent, issue, "assigned")


@pytest.mark.django_db
@patch("plane.bgtasks.workflow_task.run_workflow.delay")
def test_disabled_workflow_is_not_enqueued(mock_delay, workspace, create_bot_user):
    agent, issue = _make_agent_and_issue(workspace, create_bot_user)
    workflow = Workflow.objects.create(
        workspace=workspace,
        agent=agent,
        name="Draft workflow",
        is_enabled=False,
    )
    WorkflowNode.objects.create(
        workflow=workflow,
        kind="trigger",
        config={"event": "issue_created", "object": "issue"},
    )

    enqueue_workflows_for_issue(issue, "issue_created")

    assert WorkflowRun.objects.filter(workflow=workflow, issue=issue).exists() is False
    mock_delay.assert_not_called()


@pytest.mark.django_db
def test_queued_workflow_is_cancelled_if_disabled_before_execution(workspace, create_bot_user):
    agent, issue = _make_agent_and_issue(workspace, create_bot_user)
    workflow = Workflow.objects.create(
        workspace=workspace,
        agent=agent,
        name="Recently disabled workflow",
        is_enabled=False,
    )
    WorkflowNode.objects.create(
        workflow=workflow,
        kind="trigger",
        config={"event": "issue_created", "object": "issue"},
    )
    workflow_run = WorkflowRun.objects.create(
        workflow=workflow,
        trigger_event="issue_created",
        issue=issue,
        status="pending",
    )

    run_workflow(str(workflow_run.id))

    workflow_run.refresh_from_db()
    assert workflow_run.status == "cancelled"
    assert workflow_run.error == "workflow was disabled before execution"


@pytest.mark.django_db
def test_explicit_test_can_run_a_draft_workflow(workspace, create_bot_user):
    agent, issue = _make_agent_and_issue(workspace, create_bot_user)
    workflow = Workflow.objects.create(
        workspace=workspace,
        agent=agent,
        name="Draft workflow test",
        is_enabled=False,
    )
    WorkflowNode.objects.create(
        workflow=workflow,
        kind="trigger",
        config={"event": "issue_created", "object": "issue"},
    )
    workflow_run = WorkflowRun.objects.create(
        workflow=workflow,
        trigger_event="issue_created",
        issue=issue,
        status="pending",
    )

    run_workflow(str(workflow_run.id), allow_disabled=True)

    workflow_run.refresh_from_db()
    assert workflow_run.status == "completed"
