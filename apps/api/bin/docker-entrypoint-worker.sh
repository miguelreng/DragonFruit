#!/bin/bash
set -e

python manage.py wait_for_db
# Wait for migrations
python manage.py wait_for_migrations

require_positive_integer() {
  local name="$1"
  local value="$2"

  if [[ ! "$value" =~ ^[1-9][0-9]*$ ]]; then
    echo "[worker] $name must be a positive integer, got: $value" >&2
    exit 64
  fi
}

# Keep each worker process bounded. Horizontal replicas, rather than an
# unbounded prefork pool, are the production scaling unit. Recycling protects
# the host from gradual Python/SDK memory growth between tasks.
CELERY_LOG_LEVEL="${CELERY_LOG_LEVEL:-info}"
CELERY_QUEUES="${CELERY_QUEUES:-celery,emails,logs,agents,exports}"
CELERY_CONCURRENCY="${CELERY_CONCURRENCY:-2}"
CELERY_PREFETCH_MULTIPLIER="${CELERY_PREFETCH_MULTIPLIER:-1}"
CELERY_MAX_TASKS_PER_CHILD="${CELERY_MAX_TASKS_PER_CHILD:-100}"
CELERY_MAX_MEMORY_PER_CHILD_KB="${CELERY_MAX_MEMORY_PER_CHILD_KB:-400000}"

require_positive_integer "CELERY_CONCURRENCY" "$CELERY_CONCURRENCY"
require_positive_integer "CELERY_PREFETCH_MULTIPLIER" "$CELERY_PREFETCH_MULTIPLIER"
require_positive_integer "CELERY_MAX_TASKS_PER_CHILD" "$CELERY_MAX_TASKS_PER_CHILD"
require_positive_integer "CELERY_MAX_MEMORY_PER_CHILD_KB" "$CELERY_MAX_MEMORY_PER_CHILD_KB"

worker_args=(
  celery -A plane worker
  --loglevel "${CELERY_LOG_LEVEL}"
  --queues "${CELERY_QUEUES}"
  --concurrency "${CELERY_CONCURRENCY}"
  --prefetch-multiplier "${CELERY_PREFETCH_MULTIPLIER}"
  --max-tasks-per-child "${CELERY_MAX_TASKS_PER_CHILD}"
  --max-memory-per-child "${CELERY_MAX_MEMORY_PER_CHILD_KB}"
)

if [[ -n "${CELERY_WORKER_NAME:-}" ]]; then
  worker_args+=(--hostname "${CELERY_WORKER_NAME}")
fi

exec "${worker_args[@]}"
