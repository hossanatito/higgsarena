#!/bin/sh
# Restore a backup into the running database. DESTRUCTIVE: replaces all data.
# Usage: ./scripts/restore.sh backups/higgsarena-2026-11-26T030000Z.sql.gz
set -eu
FILE="${1:?Usage: ./scripts/restore.sh <backup.sql.gz>}"
[ -f "$FILE" ] || { echo "No such file: $FILE" >&2; exit 1; }
printf 'This replaces ALL data in the higgsarena database with %s. Type "restore" to continue: ' "$FILE"
read -r answer
[ "$answer" = "restore" ] || { echo "Aborted."; exit 1; }
docker compose --profile production stop app cron
docker compose exec -T db psql -U higgsarena -d postgres -c "DROP DATABASE IF EXISTS higgsarena WITH (FORCE);" -c "CREATE DATABASE higgsarena OWNER higgsarena;"
gunzip -c "$FILE" | docker compose exec -T db psql -U higgsarena -d higgsarena -q
docker compose --profile production up -d app cron
echo "Restored from $FILE."
