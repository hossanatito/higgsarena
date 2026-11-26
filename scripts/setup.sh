#!/usr/bin/env sh
# Production setup without Node: writes .env with fresh secrets.
# Usage: ./scripts/setup.sh
set -eu
cd "$(dirname "$0")/.."
[ -f .env ] || cp .env.example .env

rand() { openssl rand -base64 "$1" | tr -d '\n=' | tr '+/' '-_'; }
set_var() {
  key="$1"; value="$2"
  if grep -q "^${key}=" .env; then
    tmp=$(mktemp); awk -v k="$key" -v v="$value" 'BEGIN{FS=OFS="="} $1==k{print k"="v; next} {print}' .env > "$tmp" && mv "$tmp" .env
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
}

printf 'Domain for the studio (e.g. studio.example.com): '; read -r DOMAIN
printf 'Owner email(s), comma-separated: '; read -r OWNERS
printf "Email for Let's Encrypt certificates [%s]: " "${OWNERS%%,*}"; read -r ACME
[ -n "$ACME" ] || ACME="${OWNERS%%,*}"
[ -n "$DOMAIN" ] && [ -n "$OWNERS" ] || { echo "Domain and owner email are required." >&2; exit 1; }
DOMAIN=$(printf '%s' "$DOMAIN" | sed -e 's#^https\?://##' -e 's#/$##')
PG=$(rand 24)

set_var BETTER_AUTH_SECRET "$(rand 32)"
set_var ENCRYPTION_KEY "$(openssl rand -base64 32 | tr -d '\n')"
set_var CRON_SECRET "$(rand 32)"
set_var POSTGRES_PASSWORD "$PG"
set_var DATABASE_URL "postgres://higgsarena:${PG}@db:5432/higgsarena"
set_var DOMAIN "$DOMAIN"
set_var APP_URL "https://${DOMAIN}"
set_var OWNER_EMAILS "$OWNERS"
set_var ACME_EMAIL "$ACME"
set_var TRUST_PROXY true
set_var DEMO_MODE false
chmod 600 .env
echo ".env is ready. Next: docker compose --profile production up -d --build"
