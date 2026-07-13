# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Unit tests for Atlas document-edit scope inference."""

import pytest

from plane.app.views.agent.doc_write import infer_doc_write_scope


@pytest.mark.unit
class TestInferDocWriteScope:
    @pytest.mark.parametrize(
        "prompt",
        [
            "Fix spacing in all the document",
            "Fix spacing throughout the document",
            "Polish the entire page",
            "Make every heading consistent",
            "Corrige el espaciado en todo el documento",
            "Revisa la página completa",
            "Pon todos los títulos en sentence case",
        ],
    )
    def test_explicit_global_language_targets_entire_document(self, prompt):
        assert infer_doc_write_scope(prompt) == "entire_document"

    def test_explicit_global_scope_overrides_a_retained_editor_selection(self):
        assert (
            infer_doc_write_scope(
                "Fix spacing in all the document",
                selection_text="<p>This old selection should not limit the edit.</p>",
            )
            == "entire_document"
        )

    def test_local_request_uses_the_selection_when_present(self):
        assert infer_doc_write_scope("Make this more concise", selection_text="<p>Selected copy</p>") == "selection"

    def test_unselected_request_targets_the_open_document(self):
        assert infer_doc_write_scope("Add a conclusion") == "document"

    @pytest.mark.parametrize(
        "prompt",
        [
            "Rewrite this paragraph",
            "Change the page title",
            "Add a section about the full customer journey",
        ],
    )
    def test_non_global_language_does_not_accidentally_expand_scope(self, prompt):
        assert infer_doc_write_scope(prompt, selection_text="<p>Selected copy</p>") == "selection"
