#!/bin/sh
# Nightly Postgres backup with rotation. Runs inside the `backup` container,
# or manually: docker compose --profile production run --rm backup sh /backup.sh
# Optional off-site copy: set BACKUP_S3_URI (e.g. s3://bucket/higgsarena) and
# AWS_* variables, and install the AWS CLI on the host to sync ./backups.
set -eu
STAMP=$(date -u +%Y-%m-%dT%H%M%SZ)
FILE="/backups/higgsarena-${STAMP}.sql.gz"
pg_dump -h db -U higgsarena -d higgsarena --no-owner --no-privileges | gzip -9 > "${FILE}.tmp"
mv "${FILE}.tmp" "${FILE}"
find /backups -name 'higgsarena-*.sql.gz' -mtime +"${BACKUP_RETENTION_DAYS:-14}" -delete
echo "backup written: ${FILE}"
