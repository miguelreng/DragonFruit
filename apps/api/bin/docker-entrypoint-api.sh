#!/bin/bash
# Resilient entrypoint: gunicorn MUST bind even if optional setup steps
# fail. In single-container deploys (Coolify on Hetzner), a transient
# Redis/R2/SMTP hiccup or a misconfigured env var would kill the boot
# under `set -e` and the container would restart forever with no HTTP
# surface to debug from. Each non-critical step is wrapped so the
# script always reaches `exec gunicorn`. Real failures still show up
# loudly in stdout.
set -u
set -o pipefail

log() { echo "[entrypoint] $*"; }
run_optional() {
  local label="$1"; shift
  log "→ $label"
  if "$@"; then
    log "✓ $label"
  else
    log "⚠ $label FAILED (rc=$?) — continuing so gunicorn can still bind"
  fi
}

# Postgres has to be reachable or there's nothing to serve.
log "→ wait_for_db (required)"
python manage.py wait_for_db || {
  log "✗ wait_for_db failed — exiting so Docker restarts cleanly"
  exit 1
}
log "✓ wait_for_db"

# Coolify runs the API as a single service, so there is no separate migrator
# container to release a `wait_for_migrations` gate. Apply migrations in this
# process before Gunicorn starts instead. A migration failure is fatal: serving
# new application code against an older schema only turns the boot error into
# runtime 500s on affected endpoints.
log "→ migrate (required)"
python manage.py migrate --noinput || {
  log "✗ migrate failed — exiting so the API cannot serve against a stale schema"
  exit 1
}
log "✓ migrate"

# Machine signature for instance registration
HOSTNAME=$(hostname 2>/dev/null || echo "unknown")
MAC_ADDRESS=$(ip link show 2>/dev/null | awk '/ether/ {print $2}' | head -n 1)
CPU_INFO=$(cat /proc/cpuinfo 2>/dev/null || echo "")
MEMORY_INFO=$(free -h 2>/dev/null || echo "")
DISK_INFO=$(df -h 2>/dev/null || echo "")
SIGNATURE=$(echo "$HOSTNAME$MAC_ADDRESS$CPU_INFO$MEMORY_INFO$DISK_INFO" | sha256sum | awk '{print $1}')
export MACHINE_SIGNATURE=$SIGNATURE

# All of these can fail without preventing the API from serving HTTP.
# register_instance / clear_cache touch the Celery broker — if it's
# misconfigured they'll throw but we still want gunicorn up so we can
# inspect /api/instances/ etc.
run_optional "register_instance"  python manage.py register_instance "$MACHINE_SIGNATURE"
run_optional "configure_instance" python manage.py configure_instance
run_optional "create_bucket"      python manage.py create_bucket
run_optional "clear_cache"        python manage.py clear_cache
run_optional "collectstatic"      python manage.py collectstatic --noinput

log "→ launching gunicorn on 0.0.0.0:${PORT:-8000} (workers=${GUNICORN_WORKERS:-1})"
exec gunicorn \
  -w "${GUNICORN_WORKERS:-1}" \
  -k uvicorn.workers.UvicornWorker \
  plane.asgi:application \
  --bind "0.0.0.0:${PORT:-8000}" \
  --max-requests 1200 \
  --max-requests-jitter 1000 \
  --access-logfile -
