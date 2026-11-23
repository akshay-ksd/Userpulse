FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/database/package.json packages/database/package.json
RUN pnpm install --frozen-lockfile

COPY packages/database packages/database
RUN pnpm --filter @userpulse/database run generate
RUN pnpm --filter @userpulse/database run build

COPY apps/api apps/api
RUN pnpm --filter api run build

ENV NODE_ENV=production
EXPOSE 3001
CMD ["sh", "-c", "pnpm --filter @userpulse/database run migrate:deploy && node apps/api/dist/main.js"]
