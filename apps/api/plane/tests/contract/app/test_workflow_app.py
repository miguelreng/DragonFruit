# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from unittest.mock import patch

import pytest
from rest_framework import status

from plane.db.models import Issue, Project, Workflow, WorkflowNode, WorkflowRun


@pytest.mark.contract
class TestWorkflowAPI:
    @pytest.mark.django_db
    @patch("plane.bgtasks.workflow_task.run_workflow.delay")
    def test_test_endpoint_can_queue_draft_workflow(self, mock_run_workflow, session_client, workspace):
        project = Project.objects.create(name="Workflow Project", identifier="WFP", workspace=workspace)
        issue = Issue.objects.create(project=project, name="Run workflow test")
        workflow = Workflow.objects.create(workspace=workspace, name="Draft workflow", is_enabled=False)
        WorkflowNode.objects.create(
            workflow=workflow,
            kind="trigger",
            config={"event": "issue_created", "object": "issue"},
        )

        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/workflows/{workflow.id}/test/",
            {"issue_id": str(issue.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["queued"] is True
        run = WorkflowRun.objects.get(id=response.data["run_id"])
        assert run.workflow_id == workflow.id
        assert run.issue_id == issue.id
        mock_run_workflow.assert_called_once_with(str(run.id))
