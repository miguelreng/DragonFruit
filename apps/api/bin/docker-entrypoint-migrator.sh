#!/bin/bash
set -euo pipefail

echo "[migrator] waiting for PostgreSQL"
python manage.py wait_for_db

echo "[migrator] applying migrations"
python manage.py migrate --noinput
echo "[migrator] migrations complete"
