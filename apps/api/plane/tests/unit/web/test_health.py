# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from unittest.mock import MagicMock, patch

import pytest
from django.db import DatabaseError
from django.test import RequestFactory

from plane.web.views import health_check, readiness_check


@pytest.mark.unit
def test_liveness_check_does_not_depend_on_external_services():
    response = health_check(RequestFactory().get("/"))

    assert response.status_code == 200
    assert response["Cache-Control"] == "no-store"
    assert response.content == b'{"status": "OK"}'


@pytest.mark.unit
def test_readiness_check_reports_database_availability():
    cursor = MagicMock()
    cursor_context = MagicMock()
    cursor_context.__enter__.return_value = cursor

    with patch("plane.web.views.connection.cursor", return_value=cursor_context):
        response = readiness_check(RequestFactory().get("/health/ready/"))

    assert response.status_code == 200
    assert response["Cache-Control"] == "no-store"
    assert response.content == b'{"status": "ready", "database": "ok"}'
    cursor.execute.assert_called_once_with("SELECT 1")
    cursor.fetchone.assert_called_once_with()


@pytest.mark.unit
def test_readiness_check_rejects_replica_when_database_is_unavailable():
    with patch("plane.web.views.connection.cursor", side_effect=DatabaseError("database down")):
        response = readiness_check(RequestFactory().get("/health/ready/"))

    assert response.status_code == 503
    assert response["Cache-Control"] == "no-store"
    assert response.content == b'{"status": "unavailable", "database": "error"}'
