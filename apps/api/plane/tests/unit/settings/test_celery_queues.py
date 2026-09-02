# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from django.conf import settings

from plane.celery import app


@pytest.mark.unit
def test_celery_declares_isolated_production_queues():
    assert settings.CELERY_TASK_DEFAULT_QUEUE == "celery"
    assert {queue.name for queue in settings.CELERY_TASK_QUEUES} == {
        "celery",
        "emails",
        "logs",
        "agents",
        "exports",
    }


@pytest.mark.unit
def test_celery_has_bounded_worker_defaults():
    assert settings.CELERY_WORKER_CONCURRENCY == 2
    assert settings.CELERY_WORKER_PREFETCH_MULTIPLIER == 1
    assert settings.CELERY_WORKER_MAX_TASKS_PER_CHILD == 100
    assert settings.CELERY_WORKER_MAX_MEMORY_PER_CHILD == 400000


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
@pytest.mark.parametrize(
    ("task_name", "queue_name"),
    [
        ("plane.bgtasks.agent_dispatch_task.dispatch_agent_event", "agents"),
        ("plane.bgtasks.agent_dispatch_task.resume_agent_run", "agents"),
        ("plane.bgtasks.agent_dispatch_task.dispatch_agent_for_page_comment", "agents"),
        ("plane.bgtasks.workflow_task.run_workflow", "agents"),
        ("plane.bgtasks.auto_tag_bookmark_task.auto_tag_bookmark_task", "agents"),
        ("plane.bgtasks.export_task.issue_export_task", "exports"),
        ("plane.bgtasks.analytic_plot_export.analytic_export_task", "exports"),
        ("plane.bgtasks.analytic_plot_export.export_analytics_to_csv_email", "exports"),
        ("plane.bgtasks.dummy_data_task.create_dummy_data", "exports"),
        ("plane.bgtasks.workspace_seed_task.workspace_seed", "exports"),
    ],
)
def test_celery_routes_resource_intensive_tasks(task_name, queue_name):
    assert settings.CELERY_TASK_ROUTES[task_name] == {"queue": queue_name}


@pytest.mark.unit
def test_celery_imports_request_logging_task():
    assert "plane.bgtasks.logger_task" in settings.CELERY_IMPORTS


@pytest.mark.unit
@pytest.mark.parametrize(
    "module_name",
    [
        "plane.bgtasks.agent_dispatch_task",
        "plane.bgtasks.auto_tag_bookmark_task",
        "plane.bgtasks.workflow_task",
        "plane.bgtasks.export_task",
        "plane.bgtasks.analytic_plot_export",
        "plane.bgtasks.dummy_data_task",
        "plane.bgtasks.workspace_seed_task",
        "plane.bgtasks.copy_s3_object",
    ],
)
def test_celery_imports_isolated_worker_tasks(module_name):
    assert module_name in settings.CELERY_IMPORTS


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


@pytest.mark.unit
@pytest.mark.parametrize(
    ("task_name", "queue_name"),
    [
        ("plane.bgtasks.agent_dispatch_task.dispatch_agent_event", "agents"),
        ("plane.bgtasks.workflow_task.run_workflow", "agents"),
        ("plane.bgtasks.auto_tag_bookmark_task.auto_tag_bookmark_task", "agents"),
        ("plane.bgtasks.export_task.issue_export_task", "exports"),
        ("plane.bgtasks.analytic_plot_export.analytic_export_task", "exports"),
        ("plane.bgtasks.dummy_data_task.create_dummy_data", "exports"),
        ("plane.bgtasks.workspace_seed_task.workspace_seed", "exports"),
    ],
)
def test_celery_registers_resource_intensive_task_routes(task_name, queue_name):
    app.loader.import_default_modules()

    assert task_name in app.tasks
    assert app.amqp.router.route({}, task_name)["queue"].name == queue_name
