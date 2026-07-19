#!/bin/bash
set -e

python manage.py wait_for_db
# Wait for migrations
python manage.py wait_for_migrations
# Run the processes
CELERY_LOG_LEVEL="${CELERY_LOG_LEVEL:-info}"
CELERY_QUEUES="${CELERY_QUEUES:-celery,emails,logs}"

worker_args=(
  celery -A plane worker
  --loglevel "${CELERY_LOG_LEVEL}"
  --queues "${CELERY_QUEUES}"
)

if [[ -n "${CELERY_CONCURRENCY:-}" ]]; then
  worker_args+=(--concurrency "${CELERY_CONCURRENCY}")
fi

if [[ -n "${CELERY_WORKER_NAME:-}" ]]; then
  worker_args+=(--hostname "${CELERY_WORKER_NAME}")
fi

exec "${worker_args[@]}"
