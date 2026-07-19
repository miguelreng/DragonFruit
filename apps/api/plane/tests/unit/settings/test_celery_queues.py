# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from django.conf import settings

from plane.celery import app


@pytest.mark.unit
def test_celery_declares_default_email_and_log_queues():
    assert settings.CELERY_TASK_DEFAULT_QUEUE == "celery"
    assert {queue.name for queue in settings.CELERY_TASK_QUEUES} == {
        "celery",
        "emails",
        "logs",
    }


@pytest.mark.unit
@pytest.mark.parametrize(
    ("task_name", "queue_name"),
    [
        ("plane.bgtasks.logger_task.process_logs", "logs"),
        ("plane.bgtasks.workspace_invitation_task.workspace_invitation", "emails"),
        ("plane.bgtasks.forgot_password_task.forgot_password", "emails"),
        ("plane.bgtasks.magic_link_code_task.magic_link", "emails"),
        ("plane.bgtasks.email_notification_task.send_email_notification", "emails"),
    ],
)
def test_celery_routes_latency_sensitive_tasks(task_name, queue_name):
    assert settings.CELERY_TASK_ROUTES[task_name] == {"queue": queue_name}


@pytest.mark.unit
def test_celery_imports_request_logging_task():
    assert "plane.bgtasks.logger_task" in settings.CELERY_IMPORTS


@pytest.mark.unit
@pytest.mark.parametrize(
    ("task_name", "queue_name"),
    [
        ("plane.bgtasks.logger_task.process_logs", "logs"),
        ("plane.bgtasks.workspace_invitation_task.workspace_invitation", "emails"),
    ],
)
def test_celery_registers_and_resolves_isolated_task_routes(task_name, queue_name):
    app.loader.import_default_modules()

    assert task_name in app.tasks
    assert app.amqp.router.route({}, task_name)["queue"].name == queue_name
