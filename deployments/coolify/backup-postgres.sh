#!/usr/bin/env bash

set -Eeuo pipefail

POSTGRES_CONTAINER="${POSTGRES_CONTAINER:?Set POSTGRES_CONTAINER to the PostgreSQL container name or ID}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/dragonfruit/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

if [[ "${BACKUP_DIR}" != /* || "${BACKUP_DIR}" == "/" ]]; then
  echo "BACKUP_DIR must be an absolute, non-root path" >&2
  exit 1
fi

if [[ ! "${RETENTION_DAYS}" =~ ^[1-9][0-9]*$ ]]; then
  echo "RETENTION_DAYS must be a positive integer" >&2
  exit 1
fi

docker inspect "${POSTGRES_CONTAINER}" >/dev/null
install -d -m 700 "${BACKUP_DIR}"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="${BACKUP_DIR}/dragonfruit-postgres-${timestamp}.dump"
partial_file="${backup_file}.partial"
checksum_file="${backup_file}.sha256"

cleanup_partial() {
  rm -f -- "${partial_file}"
}
trap cleanup_partial EXIT

docker exec "${POSTGRES_CONTAINER}" sh -lc \
  'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-privileges' \
  >"${partial_file}"

test -s "${partial_file}"
docker exec -i "${POSTGRES_CONTAINER}" pg_restore --list <"${partial_file}" >/dev/null
chmod 600 "${partial_file}"
mv "${partial_file}" "${backup_file}"
sha256sum "${backup_file}" >"${checksum_file}"
chmod 600 "${checksum_file}"

find "${BACKUP_DIR}" -maxdepth 1 -type f \
  \( -name "dragonfruit-postgres-*.dump" -o -name "dragonfruit-postgres-*.dump.sha256" \) \
  -mtime "+${RETENTION_DAYS}" -delete

trap - EXIT
echo "Verified PostgreSQL backup: ${backup_file}"
