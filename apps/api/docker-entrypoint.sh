#!/bin/sh
set -e

mkdir -p /app/uploads/logos /app/data/backups
if [ "$(id -u)" = "0" ]; then
  chown -R node:node /app/uploads /app/data
fi

SCHEMA="./prisma/schema.prisma"

run_migrate() {
  npx prisma migrate deploy --schema "$SCHEMA"
}

repair_failed_roles_migration() {
  echo "Attempting repair for failed migration 20260914093000_user_roles_signup..."
  if [ -f ./prisma/fix-failed-roles-migration.sql ]; then
    npx prisma db execute --schema "$SCHEMA" --file ./prisma/fix-failed-roles-migration.sql || true
  fi
  npx prisma migrate resolve --applied 20260914093000_user_roles_signup --schema "$SCHEMA" || true
}

if ! run_migrate; then
  echo "prisma migrate deploy failed; checking for known failed migration..."
  repair_failed_roles_migration
  run_migrate
fi

exec node main.js
