FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /app

# --- Dependencies ---
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/database/package.json packages/database/package.json
RUN pnpm install --frozen-lockfile

# --- Build database package ---
FROM deps AS db-build
COPY packages/database packages/database
RUN pnpm --filter @userpulse/database run generate
RUN pnpm --filter @userpulse/database run build

# --- Build API ---
FROM db-build AS api-build
COPY apps/api apps/api
RUN pnpm --filter api run build

# --- Production ---
FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/database/package.json packages/database/package.json
RUN pnpm install --frozen-lockfile --prod

COPY packages/database/prisma packages/database/prisma
RUN pnpm --filter @userpulse/database run generate

COPY --from=db-build /app/packages/database/dist packages/database/dist
COPY --from=api-build /app/apps/api/dist apps/api/dist

EXPOSE 3001
CMD ["sh", "-c", "pnpm --filter @userpulse/database run migrate:deploy && node apps/api/dist/main.js"]
