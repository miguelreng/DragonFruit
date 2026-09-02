# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import os
import stat
import subprocess
from pathlib import Path

import pytest


ENTRYPOINT = Path(__file__).resolve().parents[4] / "bin" / "docker-entrypoint-worker.sh"


def _write_executable(path: Path, contents: str) -> None:
    path.write_text(contents)
    path.chmod(path.stat().st_mode | stat.S_IXUSR)


def _run_entrypoint(tmp_path: Path, **overrides: str) -> subprocess.CompletedProcess[str]:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    capture_file = tmp_path / "celery-args"

    _write_executable(bin_dir / "python", "#!/bin/sh\nexit 0\n")
    _write_executable(
        bin_dir / "celery",
        '#!/bin/sh\nprintf "%s\\n" "$@" > "$CELERY_ARGS_CAPTURE"\n',
    )

    env = {
        **os.environ,
        "PATH": f"{bin_dir}:{os.environ['PATH']}",
        "CELERY_ARGS_CAPTURE": str(capture_file),
        **overrides,
    }
    for name in (
        "CELERY_QUEUES",
        "CELERY_CONCURRENCY",
        "CELERY_PREFETCH_MULTIPLIER",
        "CELERY_MAX_TASKS_PER_CHILD",
        "CELERY_MAX_MEMORY_PER_CHILD_KB",
        "CELERY_WORKER_NAME",
    ):
        if name not in overrides:
            env.pop(name, None)

    result = subprocess.run(
        ["bash", str(ENTRYPOINT)],
        capture_output=True,
        check=False,
        env=env,
        text=True,
    )
    result.celery_args = capture_file.read_text().splitlines() if capture_file.exists() else []
    return result


@pytest.mark.unit
def test_worker_entrypoint_uses_bounded_defaults(tmp_path):
    result = _run_entrypoint(tmp_path)

    assert result.returncode == 0, result.stderr
    assert result.celery_args == [
        "-A",
        "plane",
        "worker",
        "--loglevel",
        "info",
        "--queues",
        "celery,emails,logs,agents,exports",
        "--concurrency",
        "2",
        "--prefetch-multiplier",
        "1",
        "--max-tasks-per-child",
        "100",
        "--max-memory-per-child",
        "400000",
    ]


@pytest.mark.unit
def test_worker_entrypoint_applies_pool_specific_overrides(tmp_path):
    result = _run_entrypoint(
        tmp_path,
        CELERY_QUEUES="agents",
        CELERY_CONCURRENCY="4",
        CELERY_PREFETCH_MULTIPLIER="2",
        CELERY_MAX_TASKS_PER_CHILD="25",
        CELERY_MAX_MEMORY_PER_CHILD_KB="600000",
        CELERY_WORKER_NAME="agents@%h",
    )

    assert result.returncode == 0, result.stderr
    assert result.celery_args[-12:] == [
        "--queues",
        "agents",
        "--concurrency",
        "4",
        "--prefetch-multiplier",
        "2",
        "--max-tasks-per-child",
        "25",
        "--max-memory-per-child",
        "600000",
        "--hostname",
        "agents@%h",
    ]


@pytest.mark.unit
@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("CELERY_CONCURRENCY", "0"),
        ("CELERY_PREFETCH_MULTIPLIER", "-1"),
        ("CELERY_MAX_TASKS_PER_CHILD", "many"),
        ("CELERY_MAX_MEMORY_PER_CHILD_KB", "1.5"),
    ],
)
def test_worker_entrypoint_rejects_invalid_limits(tmp_path, name, value):
    result = _run_entrypoint(tmp_path, **{name: value})

    assert result.returncode == 64
    assert f"{name} must be a positive integer" in result.stderr
    assert result.celery_args == []
