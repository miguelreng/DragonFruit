# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from pathlib import Path

import pytest


ENTRYPOINT = Path(__file__).resolve().parents[4] / "bin" / "docker-entrypoint-api.sh"


@pytest.mark.unit
def test_api_entrypoint_supports_a_dedicated_release_migrator():
    script = ENTRYPOINT.read_text()

    assert 'case "${RUN_MIGRATIONS:-1}" in' in script
    assert "python manage.py migrate --noinput" in script
    assert "migrate skipped (dedicated release migrator required)" in script


@pytest.mark.unit
def test_api_entrypoint_rejects_invalid_migration_mode():
    script = ENTRYPOINT.read_text()

    assert "RUN_MIGRATIONS must be 0/1" in script
    assert "exit 64" in script
