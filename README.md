# Userpulse — AI Product Intelligence Platform

B2B SaaS platform that collects structured product-usage events, turns them into
behavioral insights, and generates evidence-backed AI product recommendations.
Product docs live in [`harness/`](harness/) (PRD, architecture, milestones, user
stories, progress tracker).

## Stack

- **Web:** Next.js (`apps/web`)
- **API:** NestJS (`apps/api`)
- **Application database:** PostgreSQL + Prisma (`packages/database`)
- **Behavioral analytics:** ClickHouse (from milestone M3)
- **Queue / AI / infra:** Amazon SQS, EventBridge, Bedrock — see `harness/architecture.md`

## Repository layout

```
apps/
  web/            Next.js customer dashboard
  api/            NestJS application API
  ingestion/      Event ingestion handler (M3)
  event-worker/   Queue consumer / event processor (M3)
  ai-worker/      Behavioral analysis and AI workflow (M7)
  scheduler/      Scheduled analysis entry point (M7)
packages/
  database/       Prisma schema and migrations (PostgreSQL)
  sdk/            Customer-facing tracking SDK (M2)
  contracts/      Shared event and API contracts
  domain/         Domain rules and types
  analytics/      Metric definitions and analytics logic
  ai/             Prompt templates and AI output validation
  config/         Shared configuration
infrastructure/   AWS / Terraform
docs/decisions/   Architecture decision records
```

Empty directories are placeholders for later milestones; see `harness/milestone.md`.

## Getting started

Requirements: Node.js ≥ 20 (see `.nvmrc`), pnpm 11, Docker (for local Postgres).

```bash
pnpm install
docker compose up -d postgres
cp .env.example .env
pnpm --filter @userpulse/database migrate:dev
pnpm dev:api      # NestJS API on :3001
pnpm dev:web      # Next.js dashboard on :3000
```

## Common commands

| Command              | Purpose                              |
| -------------------- | ------------------------------------ |
| `pnpm build`         | Build all packages and apps          |
| `pnpm lint`          | Lint all packages and apps           |
| `pnpm test`          | Run all tests                        |
| `pnpm typecheck`     | Type-check where configured          |
| `pnpm format:check`  | Prettier check                       |

## Rules for contributors and coding agents

`harness/CLAUDE.md` defines the engineering guidelines (simplicity first,
surgical changes, tenant isolation, evidence-backed AI). Update
`harness/progress.md` whenever user-story work changes status.
