# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from types import SimpleNamespace

from plane.app.views.agent.chat import _persisted_chat_context


def test_persisted_context_guides_atlas_to_the_shared_project_and_document():
    session = SimpleNamespace(
        context_project_id="project-1",
        context_project=SimpleNamespace(name="Launch"),
        context_page_id="page-1",
        context_page=SimpleNamespace(name="Launch plan"),
    )

    context = _persisted_chat_context(session)

    assert "project 'Launch'" in context
    assert "document is 'Launch plan'" in context
    assert "workspace search tool" in context
