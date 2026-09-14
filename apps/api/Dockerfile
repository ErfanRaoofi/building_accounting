FROM node:26.3.1-bookworm-slim AS build
WORKDIR /app
ENV NX_DAEMON=false
ENV CI=true
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json nx.json tsconfig.base.json ./
RUN npm ci
COPY apps/api ./apps/api
RUN npx prisma generate --schema apps/api/prisma/schema.prisma
RUN npx nx build api

FROM node:26.3.1-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=5001
ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/building_accounting?schema=public"
ENV DIRECT_URL="postgresql://postgres:postgres@localhost:5432/building_accounting?schema=public"
# Match postgres:16 server — default bookworm client is 15 and breaks dump/restore
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates gnupg openssl \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/pgdg.gpg \
  && echo "deb [signed-by=/usr/share/keyrings/pgdg.gpg] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client-16 \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/dist/apps/api ./
COPY --from=build /app/apps/api/prisma ./prisma
COPY apps/api/docker-entrypoint.sh ./docker-entrypoint.sh
RUN sed -i 's/\r$//' docker-entrypoint.sh \
  && chmod +x docker-entrypoint.sh \
  && npm install --omit=dev \
  && npm install prisma@6.19.3 \
  && npx prisma generate --schema ./prisma/schema.prisma \
  && mkdir -p /app/uploads/logos /app/data/backups \
  && chown -R node:node /app
# Run as root so mounted volumes (uploads/backups) are writable; entrypoint chowns them.
EXPOSE 5001
HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=12 \
  CMD node -e "fetch('http://127.0.0.1:5001/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
