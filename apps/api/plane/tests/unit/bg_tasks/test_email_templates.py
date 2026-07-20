# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.conf import settings
from django.template.loader import render_to_string

from plane.license.utils.instance_value import get_email_configuration
from plane.license.api.views.configuration import EmailCredentialCheckEndpoint


LEGACY_EMAIL_MARKERS = (
    "media.docs.plane.so",
    "plane-marketing.s3",
    "forum.plane.so",
    "github.com/makeplane",
    "x.com/planepowers",
    "linkedin.com/company/planepowers",
    "team plane",
    "on plane",
    "plane software",
)


TEMPLATE_CASES = (
    (
        "emails/auth/forgot_password.html",
        {
            "email": "person@example.com",
            "forgot_password_url": "https://app.dragonfruit.sh/reset/test-token",
        },
        "https://app.dragonfruit.sh/reset/test-token",
    ),
    (
        "emails/auth/magic_signin.html",
        {"email": "person@example.com", "code": "123456"},
        "123456",
    ),
    ("emails/exports/analytics.html", {}, "CSV attached"),
    (
        "emails/invitations/project_invitation.html",
        {
            "email": "person@example.com",
            "first_name": "Miguel",
            "project_name": "Launch",
            "invitation_url": "https://app.dragonfruit.sh/project-invitations/test",
        },
        "https://app.dragonfruit.sh/project-invitations/test",
    ),
    (
        "emails/invitations/workspace_invitation.html",
        {
            "email": "person@example.com",
            "first_name": "Miguel",
            "workspace_name": "La Oficina",
            "abs_url": "https://app.dragonfruit.sh/workspace-invitations/test",
        },
        "https://app.dragonfruit.sh/workspace-invitations/test",
    ),
    (
        "emails/notifications/issue-updates.html",
        {
            "actors_involved": 2,
            "comments": [
                {
                    "actor_detail": {"first_name": "Ana", "last_name": "Rios"},
                    "actor_comments": {"new_value": ["<p>Looks good.</p>"]},
                }
            ],
            "data": [
                {
                    "actor_detail": {"first_name": "Miguel", "last_name": "Reng"},
                    "activity_time": "10:30 AM",
                    "changes": {
                        "name": {"new_value": ["Updated title"]},
                        "target_date": {
                            "old_value": ["2026-07-19"],
                            "new_value": ["2026-07-20"],
                        },
                        "assignees": {
                            "old_value": ["Ana"],
                            "new_value": ["Miguel"],
                        },
                        "labels": {
                            "old_value": ["Backlog"],
                            "new_value": ["Launch"],
                        },
                        "state": {
                            "old_value": ["Backlog"],
                            "new_value": ["In Progress"],
                        },
                        "priority": {
                            "old_value": ["low"],
                            "new_value": ["high"],
                        },
                        "duplicate": {"old_value": [], "new_value": ["DF-2"]},
                        "blocking": {"old_value": [], "new_value": ["DF-3"]},
                        "link": {
                            "old_value": [],
                            "new_value": ["https://app.dragonfruit.sh/docs/test"],
                        },
                    },
                }
            ],
            "entity_type": "work item",
            "issue": {"issue_identifier": "DF-1", "name": "Ship email refresh"},
            "issue_url": "https://app.dragonfruit.sh/la-oficina/issues/DF-1",
            "project": "DragonFruit",
            "receiver": {"email": "person@example.com"},
            "summary": "Updates were made by",
            "user_preference": "https://app.dragonfruit.sh/settings/notifications",
            "workspace": "la-oficina",
        },
        "DF-1",
    ),
    (
        "emails/notifications/project_addition.html",
        {
            "email": "person@example.com",
            "inviter_first_name": "Miguel",
            "project_name": "Launch",
            "project_url": "https://app.dragonfruit.sh/la-oficina/projects/launch",
            "workspace_name": "La Oficina",
        },
        "https://app.dragonfruit.sh/la-oficina/projects/launch",
    ),
    (
        "emails/notifications/webhook-deactivate.html",
        {
            "email": "person@example.com",
            "message": "Webhook deactivated",
            "webhook_url": "https://app.dragonfruit.sh/settings/webhooks/test",
        },
        "https://app.dragonfruit.sh/settings/webhooks/test",
    ),
    ("emails/test_email.html", {}, "Email is connected"),
    (
        "emails/user/email_updated.html",
        {"email": "person@example.com"},
        "person@example.com",
    ),
    (
        "emails/user/user_activation.html",
        {
            "email": "person@example.com",
            "profile_url": "https://app.dragonfruit.sh/profile",
        },
        "https://app.dragonfruit.sh/profile",
    ),
    (
        "emails/user/user_deactivation.html",
        {
            "email": "person@example.com",
            "login_url": "https://app.dragonfruit.sh/login",
        },
        "https://app.dragonfruit.sh/login",
    ),
)


@pytest.mark.unit
@pytest.mark.parametrize(("template_name", "context", "expected_content"), TEMPLATE_CASES)
def test_email_template_uses_dragonfruit_branding(template_name, context, expected_content):
    html = render_to_string(template_name, context)
    normalized_html = html.lower()

    assert "DragonFruit" in html
    assert "https://app.dragonfruit.sh/atlas-dragon.svg" in html
    assert "#aa0276" in html
    assert expected_content in html
    assert not any(marker in normalized_html for marker in LEGACY_EMAIL_MARKERS)


@pytest.mark.unit
def test_email_tasks_do_not_reintroduce_legacy_branding():
    task_directory = Path(settings.BASE_DIR) / "bgtasks"
    email_task_names = (
        "forgot_password_task.py",
        "magic_link_code_task.py",
        "project_add_user_email_task.py",
        "project_invitation_task.py",
        "user_activation_email_task.py",
        "user_deactivation_email_task.py",
        "user_email_update_task.py",
        "workspace_invitation_task.py",
    )

    task_sources = "\n".join((task_directory / name).read_text() for name in email_task_names).lower()
    email_configuration_sources = "\n".join(
        (
            (Path(settings.BASE_DIR) / "db" / "management" / "commands" / "test_email.py").read_text(),
            (Path(settings.BASE_DIR) / "license" / "api" / "views" / "configuration.py").read_text(),
        )
    ).lower()

    sources = task_sources + email_configuration_sources

    assert "on plane" not in sources
    assert "plane account" not in sources
    assert "plane project" not in sources
    assert "email notification from plane" not in sources
    assert "test email from plane" not in sources


@pytest.mark.unit
def test_email_configuration_has_dragonfruit_sender_fallback(settings, monkeypatch):
    settings.SKIP_ENV_VAR = False
    monkeypatch.delenv("EMAIL_FROM", raising=False)

    assert get_email_configuration()[-1] == "DragonFruit <hello@dragonfruit.email>"


@pytest.mark.unit
def test_email_credential_check_sends_branded_html():
    request = SimpleNamespace(data={"receiver_email": "person@example.com"})
    email_configuration = (
        "smtp.example.com",
        "smtp-user",
        "smtp-password",
        587,
        "1",
        "0",
        "DragonFruit <hello@dragonfruit.email>",
    )

    with (
        patch(
            "plane.license.api.views.configuration.get_email_configuration",
            return_value=email_configuration,
        ),
        patch("plane.license.api.views.configuration.get_connection"),
        patch("plane.license.api.views.configuration.EmailMultiAlternatives") as email_class,
    ):
        response = EmailCredentialCheckEndpoint().post(request)

    message = email_class.return_value
    assert response.status_code == 200
    assert email_class.call_args.kwargs["subject"] == "DragonFruit email configuration test"
    assert "Email is connected" in email_class.call_args.kwargs["body"]
    html_content = message.attach_alternative.call_args.args[0]
    assert "DragonFruit" in html_content
    message.attach_alternative.assert_called_once_with(html_content, "text/html")
    message.send.assert_called_once_with(fail_silently=False)
