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
ENV API_PORT=3000
ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/mehr_accounting?schema=public"
ENV DIRECT_URL="postgresql://postgres:postgres@localhost:5432/mehr_accounting?schema=public"
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates postgresql-client \
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
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=10 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
