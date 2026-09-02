# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for scan-to-doc (transcribe + create).

The vision call is always stubbed at `plane.app.views.page.scan` — these tests
are about the plumbing around the model (marker routing, sanitization, label
resolution, idempotency), not the model itself.
"""

import base64
import json
from unittest.mock import patch

import pytest
from rest_framework import status

from plane.db.models import Label, Page, PageLabel, Project, ProjectMember, ProjectPage
from plane.llm.provider import LLMConfigError

ONE_PIXEL_PNG = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"0" * 64).decode("ascii")


def photo(mime_type: str = "image/jpeg", content: str = ONE_PIXEL_PNG) -> dict:
    return {"content_base64": content, "mime_type": mime_type}


def model_reply(**overrides) -> str:
    payload = {
        "title": "Sprint planning",
        "language": "en",
        "project": "",
        "labels": [],
        "markdown": "## Agenda\n\n- Ship the scanner\n\n- [x] Draft the plan\n- [ ] Review it",
        "unreadable_pages": [],
    }
    payload.update(overrides)
    return json.dumps(payload)


def make_project(workspace, member, *, name="Marketing", identifier="MKT", role=20):
    project = Project.objects.create(name=name, identifier=identifier, workspace=workspace)
    if member is not None:
        ProjectMember.objects.create(
            project=project, workspace=workspace, member=member, role=role, is_active=True
        )
    return project


@pytest.mark.contract
class TestScannedNoteTranscribeAPI:
    def get_url(self, workspace_slug: str) -> str:
        return f"/api/workspaces/{workspace_slug}/scanned-notes/transcribe/"

    @pytest.mark.django_db
    def test_returns_structured_html_project_and_labels(
        self, session_client, workspace, create_user, monkeypatch
    ):
        project = make_project(workspace, create_user)
        monkeypatch.setattr(
            "plane.app.views.page.scan._run_scan_transcription",
            lambda **kwargs: model_reply(project="marketing", labels=["urgent", "q3"]),
        )

        response = session_client.post(
            self.get_url(workspace.slug), {"images": [photo(), photo()]}, format="json"
        )

        assert response.status_code == status.HTTP_200_OK
        html = response.data["description_html"]
        assert "<h2>Agenda</h2>" in html
        assert "<li><p>Ship the scanner</p></li>" in html
        assert 'data-type="taskList"' in html
        assert 'data-checked="true"' in html
        assert 'data-checked="false"' in html
        assert response.data["title"] == "Sprint planning"
        assert response.data["pages_read"] == 2
        assert response.data["project_marker"] == "marketing"
        assert response.data["detected_project"]["id"] == str(project.id)
        assert response.data["detected_labels"] == ["urgent", "q3"]

    @pytest.mark.django_db
    def test_slug_style_marker_resolves_to_a_spaced_project_name(
        self, session_client, workspace, create_user, monkeypatch
    ):
        project = make_project(workspace, create_user, name="Sprint Planning", identifier="SPR")
        monkeypatch.setattr(
            "plane.app.views.page.scan._run_scan_transcription",
            lambda **kwargs: model_reply(project="sprint-planning"),
        )

        response = session_client.post(
            self.get_url(workspace.slug), {"images": [photo()]}, format="json"
        )

        assert response.data["detected_project"]["id"] == str(project.id)

    @pytest.mark.django_db
    def test_markers_never_appear_in_the_body(
        self, session_client, workspace, create_user, monkeypatch
    ):
        make_project(workspace, create_user)
        monkeypatch.setattr(
            "plane.app.views.page.scan._run_scan_transcription",
            lambda **kwargs: model_reply(
                project="marketing",
                labels=["urgent"],
                markdown="Ship it /marketing before Friday #urgent\n\nSee item #3 in the backlog.",
            ),
        )

        response = session_client.post(
            self.get_url(workspace.slug), {"images": [photo()]}, format="json"
        )

        html = response.data["description_html"]
        assert "/marketing" not in html
        assert "#urgent" not in html
        assert "Ship it before Friday" in html
        # A legitimate "#3" is not a marker and must survive untouched.
        assert "See item #3 in the backlog." in html

    @pytest.mark.django_db
    def test_raw_html_from_the_model_is_neutralized(
        self, session_client, workspace, create_user, monkeypatch
    ):
        monkeypatch.setattr(
            "plane.app.views.page.scan._run_scan_transcription",
            lambda **kwargs: model_reply(markdown='Notes <script>alert("no")</script> end'),
        )

        response = session_client.post(
            self.get_url(workspace.slug), {"images": [photo()]}, format="json"
        )

        assert response.status_code == status.HTTP_200_OK
        assert "<script" not in response.data["description_html"]

    @pytest.mark.django_db
    def test_unknown_marker_returns_null_project_with_the_raw_marker(
        self, session_client, workspace, create_user, monkeypatch
    ):
        monkeypatch.setattr(
            "plane.app.views.page.scan._run_scan_transcription",
            lambda **kwargs: model_reply(project="nowhere"),
        )

        response = session_client.post(
            self.get_url(workspace.slug), {"images": [photo()]}, format="json"
        )

        assert response.data["detected_project"] is None
        assert response.data["project_marker"] == "nowhere"

    @pytest.mark.django_db
    def test_marker_for_a_project_the_user_is_not_in_is_not_resolved(
        self, session_client, workspace, create_user, monkeypatch
    ):
        make_project(workspace, None, name="Secret", identifier="SEC")
        monkeypatch.setattr(
            "plane.app.views.page.scan._run_scan_transcription",
            lambda **kwargs: model_reply(project="secret"),
        )

        response = session_client.post(
            self.get_url(workspace.slug), {"images": [photo()]}, format="json"
        )

        assert response.data["detected_project"] is None

    @pytest.mark.django_db
    def test_missing_llm_config_returns_409_not_500(
        self, session_client, workspace, create_user, monkeypatch
    ):
        def raise_config_error(**kwargs):
            raise LLMConfigError("Atlas needs an LLM provider, model, and API key in Settings → AI.")

        monkeypatch.setattr(
            "plane.app.views.page.scan._run_scan_transcription", raise_config_error
        )

        response = session_client.post(
            self.get_url(workspace.slug), {"images": [photo()]}, format="json"
        )

        assert response.status_code == status.HTTP_409_CONFLICT
        assert response.data["code"] == "llm_not_configured"
        assert "Settings" in response.data["error"]

    @pytest.mark.django_db
    def test_provider_failure_returns_502(
        self, session_client, workspace, create_user, monkeypatch
    ):
        def blow_up(**kwargs):
            raise RuntimeError("provider exploded")

        monkeypatch.setattr("plane.app.views.page.scan._run_scan_transcription", blow_up)

        response = session_client.post(
            self.get_url(workspace.slug), {"images": [photo()]}, format="json"
        )

        assert response.status_code == status.HTTP_502_BAD_GATEWAY
        assert response.data["code"] == "transcription_failed"

    @pytest.mark.django_db
    def test_unparseable_output_falls_back_to_raw_markdown(
        self, session_client, workspace, create_user, monkeypatch
    ):
        monkeypatch.setattr(
            "plane.app.views.page.scan._run_scan_transcription",
            lambda **kwargs: "## Notes\n\n- One thing\n- Another thing",
        )

        response = session_client.post(
            self.get_url(workspace.slug), {"images": [photo()]}, format="json"
        )

        assert response.status_code == status.HTTP_200_OK
        assert "<h2>Notes</h2>" in response.data["description_html"]
        assert response.data["detected_project"] is None

    @pytest.mark.django_db
    def test_fenced_json_is_recovered(self, session_client, workspace, create_user, monkeypatch):
        monkeypatch.setattr(
            "plane.app.views.page.scan._run_scan_transcription",
            lambda **kwargs: f"```json\n{model_reply()}\n```",
        )

        response = session_client.post(
            self.get_url(workspace.slug), {"images": [photo()]}, format="json"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["title"] == "Sprint planning"

    @pytest.mark.django_db
    def test_empty_transcription_returns_400(
        self, session_client, workspace, create_user, monkeypatch
    ):
        monkeypatch.setattr(
            "plane.app.views.page.scan._run_scan_transcription",
            lambda **kwargs: model_reply(markdown="   "),
        )

        response = session_client.post(
            self.get_url(workspace.slug), {"images": [photo()]}, format="json"
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "No readable handwriting" in response.data["error"]

    @pytest.mark.django_db
    def test_no_images_returns_400(self, session_client, workspace, create_user):
        response = session_client.post(self.get_url(workspace.slug), {"images": []}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_page_cap_truncates_and_warns(
        self, session_client, workspace, create_user, monkeypatch
    ):
        monkeypatch.setattr(
            "plane.app.views.page.scan._run_scan_transcription", lambda **kwargs: model_reply()
        )

        response = session_client.post(
            self.get_url(workspace.slug), {"images": [photo() for _ in range(9)]}, format="json"
        )

        assert response.data["pages_read"] == 6
        assert any("first 6 photos" in warning for warning in response.data["warnings"])

    @pytest.mark.django_db
    def test_invalid_base64_and_oversize_photos_are_dropped(
        self, session_client, workspace, create_user, monkeypatch
    ):
        monkeypatch.setattr(
            "plane.app.views.page.scan._run_scan_transcription", lambda **kwargs: model_reply()
        )
        oversize = base64.b64encode(b"0" * 1_300_000).decode("ascii")

        response = session_client.post(
            self.get_url(workspace.slug),
            {"images": [photo(content="!!!not base64!!!"), photo(content=oversize), photo()]},
            format="json",
        )

        assert response.data["pages_read"] == 1
        assert len(response.data["warnings"]) == 2

    @pytest.mark.django_db
    def test_unsupported_mime_type_is_dropped(self, session_client, workspace, create_user):
        response = session_client.post(
            self.get_url(workspace.slug),
            {"images": [photo(mime_type="application/pdf")]},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.contract
class TestScannedNoteCreateAPI:
    def get_url(self, workspace_slug: str) -> str:
        return f"/api/workspaces/{workspace_slug}/scanned-notes/"

    def payload(self, project, **overrides) -> dict:
        body = {
            "project_id": str(project.id),
            "title": "Sprint planning",
            "description_html": "<h2>Agenda</h2><p>Ship the scanner.</p>",
            "labels": [],
            "client_request_id": "scan-1756-482913",
        }
        body.update(overrides)
        return body

    @pytest.mark.django_db
    @patch("plane.app.views.page.scan.page_transaction.delay")
    def test_creates_a_doc_page_linked_to_the_project(
        self, _mock_page_tx, session_client, workspace, create_user
    ):
        project = make_project(workspace, create_user)

        response = session_client.post(
            self.get_url(workspace.slug), self.payload(project), format="json"
        )

        assert response.status_code == status.HTTP_201_CREATED
        page = Page.objects.get(pk=response.data["id"])
        assert page.name == "Sprint planning"
        assert page.page_type == Page.PAGE_TYPE_DOC
        assert page.external_source == "notebook_scan"
        assert page.external_id == "scan-1756-482913"
        assert page.description_binary is None
        assert page.description_json == {}
        assert page.owned_by_id == create_user.id
        assert "Ship the scanner." in page.description_html
        assert ProjectPage.objects.filter(project=project, page=page, workspace=workspace).exists()
        assert response.data["project_id"] == str(project.id)
        assert response.data["web_url"].endswith(f"/pages/{page.id}")

    @pytest.mark.django_db
    @patch("plane.app.views.page.scan.page_transaction.delay")
    def test_falls_back_to_a_dated_title(
        self, _mock_page_tx, session_client, workspace, create_user
    ):
        project = make_project(workspace, create_user)

        response = session_client.post(
            self.get_url(workspace.slug), self.payload(project, title="  "), format="json"
        )

        assert response.data["name"].startswith("Scanned notes · ")

    @pytest.mark.django_db
    @patch("plane.app.views.page.scan.page_transaction.delay")
    def test_existing_label_is_matched_case_insensitively(
        self, _mock_page_tx, session_client, workspace, create_user
    ):
        project = make_project(workspace, create_user)
        existing = Label.objects.create(name="Urgent", project=project, workspace=workspace)

        response = session_client.post(
            self.get_url(workspace.slug), self.payload(project, labels=["urgent"]), format="json"
        )

        assert Label.objects.filter(project=project).count() == 1
        assert response.data["labels_applied"] == [
            {"id": str(existing.id), "name": "Urgent", "created": False}
        ]
        assert PageLabel.objects.filter(page_id=response.data["id"], label=existing).exists()

    @pytest.mark.django_db
    @patch("plane.app.views.page.scan.page_transaction.delay")
    def test_missing_label_is_created_in_the_target_project(
        self, _mock_page_tx, session_client, workspace, create_user
    ):
        project = make_project(workspace, create_user)

        response = session_client.post(
            self.get_url(workspace.slug), self.payload(project, labels=["q3", "q3"]), format="json"
        )

        label = Label.objects.get(project=project, name="q3")
        assert response.data["labels_applied"] == [
            {"id": str(label.id), "name": "q3", "created": True}
        ]
        assert PageLabel.objects.filter(page_id=response.data["id"]).count() == 1

    @pytest.mark.django_db
    @patch("plane.app.views.page.scan.page_transaction.delay")
    def test_duplicate_submit_updates_in_place(
        self, _mock_page_tx, session_client, workspace, create_user
    ):
        project = make_project(workspace, create_user)
        url = self.get_url(workspace.slug)

        created = session_client.post(url, self.payload(project, labels=["q3"]), format="json")
        assert created.status_code == status.HTTP_201_CREATED
        page = Page.objects.get(pk=created.data["id"])
        page.description_binary = b"stale-yjs"
        page.save(update_fields=["description_binary"])

        updated = session_client.post(
            url,
            self.payload(
                project,
                labels=["q3"],
                title="Sprint planning v2",
                description_html="<p>Fresh content.</p>",
            ),
            format="json",
        )

        assert updated.status_code == status.HTTP_200_OK
        assert updated.data["created"] is False
        assert updated.data["id"] == created.data["id"]
        assert Page.objects.filter(external_id="scan-1756-482913").count() == 1
        page.refresh_from_db()
        assert page.name == "Sprint planning v2"
        assert "Fresh content." in page.description_html
        assert page.description_binary is None
        assert PageLabel.objects.filter(page=page).count() == 1

    @pytest.mark.django_db
    @patch("plane.app.views.page.scan.page_transaction.delay")
    def test_resubmit_with_a_different_project_moves_the_doc(
        self, _mock_page_tx, session_client, workspace, create_user
    ):
        first = make_project(workspace, create_user)
        second = make_project(workspace, create_user, name="Personal", identifier="PER")
        url = self.get_url(workspace.slug)

        created = session_client.post(url, self.payload(first), format="json")
        moved = session_client.post(url, self.payload(second), format="json")

        assert moved.data["id"] == created.data["id"]
        page = Page.objects.get(pk=moved.data["id"])
        assert ProjectPage.objects.filter(page=page, project=second).exists()
        assert not ProjectPage.objects.filter(page=page, project=first).exists()

    @pytest.mark.django_db
    def test_project_without_membership_returns_403(self, session_client, workspace, create_user):
        project = make_project(workspace, None, name="Secret", identifier="SEC")

        response = session_client.post(
            self.get_url(workspace.slug), self.payload(project), format="json"
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert Page.objects.count() == 0

    @pytest.mark.django_db
    def test_guest_membership_returns_403(self, session_client, workspace, create_user):
        project = make_project(workspace, create_user, name="Guested", identifier="GST", role=5)

        response = session_client.post(
            self.get_url(workspace.slug), self.payload(project), format="json"
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    @patch("plane.app.views.page.scan.page_transaction.delay")
    def test_tampered_html_is_sanitized(
        self, _mock_page_tx, session_client, workspace, create_user
    ):
        project = make_project(workspace, create_user)

        response = session_client.post(
            self.get_url(workspace.slug),
            self.payload(project, description_html='<p>Hi</p><script>alert("no")</script>'),
            format="json",
        )

        page = Page.objects.get(pk=response.data["id"])
        assert "<script" not in page.description_html

    @pytest.mark.django_db
    def test_missing_project_id_returns_400(self, session_client, workspace, create_user):
        project = make_project(workspace, create_user)
        response = session_client.post(
            self.get_url(workspace.slug), self.payload(project, project_id=""), format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_malformed_project_id_returns_403(self, session_client, workspace, create_user):
        project = make_project(workspace, create_user)
        response = session_client.post(
            self.get_url(workspace.slug), self.payload(project, project_id="not-a-uuid"), format="json"
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_empty_html_returns_400(self, session_client, workspace, create_user):
        project = make_project(workspace, create_user)
        response = session_client.post(
            self.get_url(workspace.slug), self.payload(project, description_html=""), format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
