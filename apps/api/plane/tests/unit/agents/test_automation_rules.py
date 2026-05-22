# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from types import SimpleNamespace

from plane.app.views.agent.base import _normalise_automation_conditions
from plane.db.models.agent import _automation_matches_issue


def test_normalise_automation_conditions_filters_unknown_keys_and_invalid_values():
    raw = {
        "project_ids": ["p1", " ", "p1"],
        "priorities": ["urgent", "invalid", "high"],
        "label_ids": ["l1", "", "l2"],
        "issue_type_ids": ["it1", "it1", "it2"],
        "unsupported": ["x"],
    }

    result = _normalise_automation_conditions(raw)

    assert result == {
        "project_ids": ["p1"],
        "priorities": ["urgent", "high"],
        "label_ids": ["l1", "l2"],
        "issue_type_ids": ["it1", "it2"],
    }


def test_automation_matches_issue_returns_false_on_project_or_priority_mismatch():
    automation = SimpleNamespace(
        conditions={"project_ids": ["project-a"], "priorities": ["urgent", "high"]},
    )
    issue = SimpleNamespace(project_id="project-b", priority="medium", type_id=None, id="issue-1")

    assert _automation_matches_issue(automation, issue) is False


def test_automation_matches_issue_returns_true_for_matching_project_priority_and_type():
    automation = SimpleNamespace(
        conditions={
            "project_ids": ["project-a"],
            "priorities": ["high"],
            "issue_type_ids": ["type-a"],
        },
    )
    issue = SimpleNamespace(project_id="project-a", priority="high", type_id="type-a", id="issue-1")

    assert _automation_matches_issue(automation, issue) is True
