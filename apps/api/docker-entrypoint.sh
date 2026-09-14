#!/bin/sh
set -e

mkdir -p /app/uploads/logos /app/data/backups
if [ "$(id -u)" = "0" ]; then
  chown -R node:node /app/uploads /app/data
fi

SCHEMA="./prisma/schema.prisma"
FIX_SQL="./prisma/fix-failed-roles-migration.sql"
FAILED_MIGRATION="20260914093000_user_roles_signup"

run_migrate() {
  npx prisma migrate deploy --schema "$SCHEMA"
}

heal_schema() {
  echo "Healing schema (safe after restore of older dumps)..."
  if [ -f "$FIX_SQL" ]; then
    npx prisma db execute --schema "$SCHEMA" --file "$FIX_SQL" || true
  fi
  npx prisma migrate resolve --applied "$FAILED_MIGRATION" --schema "$SCHEMA" || true
}

# First try normal migrate; on failure (e.g. P3009) heal then retry.
if ! run_migrate; then
  echo "migrate deploy failed; running heal + retry..."
  heal_schema
  run_migrate
fi

exec node main.js
