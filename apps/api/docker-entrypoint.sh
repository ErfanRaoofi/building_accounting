#!/bin/sh
set -e

mkdir -p /app/uploads/logos /app/data/backups
if [ "$(id -u)" = "0" ]; then
  chown -R node:node /app/uploads /app/data
fi

npx prisma migrate deploy --schema ./prisma/schema.prisma
exec node main.js
