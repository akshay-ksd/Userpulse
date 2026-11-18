# US-055 — Monitor platform health

| Field | Value |
|---|---|
| **Story ID** | US-055 |
| **Epic** | EP-11 Privacy, Security, Operations |
| **Priority** | P0 |
| **Milestone** | M9 — Security and Pilot Readiness |
| **Source** | `harness/user-stories.md` §US-055 |
| **Status** | Done |
| **Created** | 2026-11-18 |

## Story

**As an** operations engineer, **I want** to monitor APIs, event processing, data stores, and AI workflows, **so that** I can detect failures quickly.

## Acceptance criteria

- [ ] API errors and latency are monitored.
- [ ] Queue depth, message age, retries, and dead-letter volume are monitored.
- [ ] Event processing failures are observable.
- [ ] Database and analytics health are monitored.
- [ ] AI workflow failures and cost are observable.
- [ ] Critical conditions trigger alerts.
- [ ] Logs do not expose credentials or sensitive event content.

## Story review

**Scope:** This story implements a unified health monitoring module that aggregates metrics from across the platform into a single internal dashboard endpoint and a health check endpoint, plus configurable alert thresholds that log critical conditions.

**What's in scope:**
- A `HealthModule` using `@nestjs/terminus` for database and application health checks.
- A unified `GET /internal/metrics/health` endpoint aggregating: API uptime, event processing metrics (pending/failed/DLQ from existing `EventProcessorService.getMetrics()`), data deletion metrics, retention metrics, AI analysis run metrics (queued/running/failed/completed counts, failure rate), and database connectivity.
- A `PlatformHealthService` that collects metrics from existing services and adds: API error/latency tracking via a NestJS interceptor, analysis run failure/cost metrics.
- Configurable alert thresholds — when metrics exceed thresholds (e.g. DLQ > 0, failed events > threshold, analysis failures), a warning/critical log line is emitted for CloudWatch alerting.
- An audit of existing log statements to ensure no credentials or sensitive event content are logged.

**What's out of scope:**
- CloudWatch integration (requires AWS infrastructure; logs are the integration point).
- External alerting services (PagerDuty, Slack webhooks) — CloudWatch alarms consume the structured logs.
- Grafana dashboards or custom visualization.
- ClickHouse metrics (MVP uses PostgreSQL only).
- Real-time WebSocket metrics streaming.

**Decisions:**
- Use `@nestjs/terminus` for the health check endpoint (`GET /health`) — this is the NestJS-recommended approach (see `AGENTS.md`).
- Unified metrics endpoint at `GET /internal/metrics/health` aggregates all subsystem metrics — avoids operators needing to hit 4+ individual endpoints.
- API latency/error tracking via a global `HttpInterceptor` that records request duration and error counts in memory (rolling window). No external metrics store for MVP.
- Alert thresholds are hardcoded constants for MVP — configurable via env vars is a follow-up.
- The `x-internal-token` auth pattern is reused from existing metrics controllers.
- Analysis run metrics are computed by querying `analysis_runs` table statuses.
- Log audit is a manual verification step — check existing Logger.warn/error calls don't leak secrets.

## Current codebase state

- **Existing internal metrics endpoints:**
  - `GET /internal/metrics/processing` — event processing counts (pending/processed/failed/dlq/oldest age/rate) in `EventProcessorController` / `EventProcessorService.getMetrics()`.
  - `GET /internal/metrics/retention` — retention cleanup stats in `RetentionMetricsController` / `RetentionCleanupService.getMetrics()`.
  - `GET /internal/metrics/data-deletion` — deletion request counts in `DataDeletionMetricsController` / `DataDeletionProcessorService.getMetrics()`.
- **Auth pattern:** `@Public()` + `x-internal-token` header check against `INTERNAL_METRICS_TOKEN` env var. The data-deletion metrics controller is missing this check (bug to fix).
- **Background processors:** `EventProcessorService` (5s interval), `AnalysisRunProcessorService` (10s interval), `RetentionCleanupService` (hourly), `DataDeletionProcessorService` (30s interval).
- **AnalysisRun model:** Tracks status (`QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, `INSUFFICIENT_DATA`), `startedAt`, `completedAt`, `eventCount`, `statusMessage`.
- **No `@nestjs/terminus` usage yet** — no health check endpoint exists.
- **`ScheduleModule.forRoot()` already registered** in `AppModule`.
- **Logger usage:** NestJS `Logger` class used throughout. Need to verify no sensitive data in logs.

## Dependencies

**Upstream (must be Done):**
- US-023 (Process queued events) — Done. Event processor with metrics exists.
- US-041 (Request product analysis) — Done. Analysis runs model exists.
- US-053 (Understand data retention) — Done. Retention cleanup with metrics exists.
- US-054 (Request project data deletion) — Done. Data deletion with metrics exists.

**Downstream (depends on this):**
- US-056 (Inspect an analysis run) — Not Started. May use analysis run metrics from this story.

## Implementation subtasks

### 1. Database (none)

No database changes needed. All metrics are derived from existing tables via queries and in-memory counters.

### 2. API — Health check endpoint

- [ ] Install `@nestjs/terminus` in `apps/api`: `pnpm --filter api add @nestjs/terminus`.
- [ ] Create `apps/api/src/health/health.module.ts`:
  - Import `TerminusModule` and `PrismaModule`.
  - Register `HealthController` and `PrismaHealthIndicator`.
- [ ] Create `apps/api/src/health/prisma-health-indicator.ts`:
  - Extend `HealthIndicator` from `@nestjs/terminus`.
  - `isHealthy()` calls `prisma.$queryRaw(Prisma.sql\`SELECT 1\`)` with a timeout.
  - Returns `{ database: { status: 'up' } }` or throws `HealthCheckError`.
- [ ] Create `apps/api/src/health/health.controller.ts`:
  - `@Controller('health')` with `@Public()` decorator.
  - `GET /health` calls `HealthCheckService.check([...indicators])`.
  - Returns `{ status: 'ok', info: {...}, details: {...} }` on success, 503 on failure.
- [ ] Register `HealthModule` in `AppModule`.

### 3. API — Platform health metrics service

- [ ] Create `apps/api/src/health/platform-health.service.ts`:
  - Inject `PrismaService`, `EventProcessorService`, `RetentionCleanupService`, `DataDeletionProcessorService`.
  - `getAggregatedMetrics()` method that returns a unified object:
    - `api`: `{ uptime, requestsTotal, errorsTotal, errorRate, avgLatencyMs, p95LatencyMs }` — from the interceptor's in-memory counters.
    - `eventProcessing`: delegate to `EventProcessorService.getMetrics()`.
    - `analysisRuns`: query `analysis_runs` table for status counts, failure rate (last 24h), average duration.
    - `retention`: delegate to `RetentionCleanupService.getMetrics()`.
    - `dataDeletion`: delegate to `DataDeletionProcessorService.getMetrics()`.
    - `database`: `{ connected: boolean, latencyMs: number }` — via `SELECT 1` with timing.
    - `alerts`: array of triggered alert conditions (see subtask 5).
  - `getAnalysisRunMetrics()` private method:
    - Queries `analysis_runs` grouped by status.
    - Calculates failure rate = FAILED / (COMPLETED + FAILED) over last 24h.
    - Average run duration for completed runs (last 24h).
    - Count of currently QUEUED and RUNNING runs.

### 4. API — HTTP metrics interceptor

- [ ] Create `apps/api/src/health/http-metrics.interceptor.ts`:
  - Implements `NestInterceptor`.
  - Tracks in-memory: `requestCount`, `errorCount`, `latencies` (circular buffer, last 1000 requests).
  - On each request: records start time. On response: records duration. On error: increments error count.
  - Provides `getMetrics()`: `{ requestsTotal, errorsTotal, errorRate, avgLatencyMs, p95LatencyMs, uptime }`.
  - `uptime` is `process.uptime()`.
- [ ] Register as `APP_INTERCEPTOR` in `HealthModule` providers.

### 5. API — Alert thresholds

- [ ] Create `apps/api/src/health/alert-evaluator.service.ts`:
  - Define threshold constants:
    - `DLQ_THRESHOLD = 0` (any DLQ events trigger alert).
    - `FAILED_EVENTS_THRESHOLD = 100` (failed events > 100).
    - `PENDING_AGE_THRESHOLD_MINUTES = 30` (oldest pending event > 30min).
    - `ANALYSIS_FAILURE_RATE_THRESHOLD = 0.5` (>50% failure rate).
    - `API_ERROR_RATE_THRESHOLD = 0.1` (>10% error rate).
    - `DB_LATENCY_THRESHOLD_MS = 1000` (>1s DB latency).
  - `evaluate(metrics)` method returns `Alert[]` where each alert has: `level` ('warning' | 'critical'), `subsystem`, `message`, `value`, `threshold`.
  - Evaluation rules:
    - DLQ > 0 → critical.
    - Failed events > threshold → warning.
    - Pending age > threshold → warning.
    - Analysis failure rate > threshold → critical.
    - API error rate > threshold → critical.
    - DB latency > threshold → warning.
- [ ] Create `apps/api/src/health/alert-logger.service.ts`:
  - `@Interval(60_000)` — checks alerts every minute.
  - Calls `PlatformHealthService.getAggregatedMetrics()` → `AlertEvaluatorService.evaluate()`.
  - For each alert: `Logger.warn` or `Logger.error` with structured data (subsystem, metric, value, threshold).
  - Log format is structured for CloudWatch parsing: `[ALERT:CRITICAL] subsystem=eventProcessing metric=dlqCount value=5 threshold=0`.

### 6. API — Unified metrics endpoint

- [ ] Create `apps/api/src/health/health-metrics.controller.ts`:
  - `@Controller('internal/metrics')` with `@Public()`.
  - `GET /health` with `x-internal-token` auth (same pattern as `EventProcessorController`).
  - Returns the full `PlatformHealthService.getAggregatedMetrics()` response.

### 7. API — Fix data-deletion metrics auth

- [ ] Update `apps/api/src/data-deletion/data-deletion-metrics.controller.ts`:
  - Add `x-internal-token` header check (missing — unlike the other metrics controllers).

### 8. API — Log audit

- [ ] Audit all `Logger.warn`, `Logger.error`, and `Logger.log` calls across the API codebase.
  - Verify no passwords, tokens, API keys, session secrets, or raw event content (properties) are logged.
  - Verify `IngestionService` doesn't log event payloads.
  - Verify `AuthService` doesn't log passwords or tokens.
  - Verify `ApiKeyGuard` doesn't log the raw API key.
  - Document findings in the task file verification section.

### 9. Tests — Unit tests

- [ ] `apps/api/src/health/prisma-health-indicator.spec.ts`:
  - Test healthy database returns up status.
  - Test unhealthy database throws `HealthCheckError`.
- [ ] `apps/api/src/health/http-metrics.interceptor.spec.ts`:
  - Test request counting.
  - Test error counting.
  - Test latency calculation (avg, p95).
  - Test uptime reporting.
- [ ] `apps/api/src/health/platform-health.service.spec.ts`:
  - Test aggregated metrics collection from all subsystems.
  - Test analysis run metrics calculation (status counts, failure rate, duration).
  - Test database latency measurement.
- [ ] `apps/api/src/health/alert-evaluator.service.spec.ts`:
  - Test each threshold condition triggers the correct alert level.
  - Test no alerts when all metrics are healthy.
  - Test multiple simultaneous alerts.
- [ ] `apps/api/src/health/alert-logger.service.spec.ts`:
  - Test periodic evaluation runs.
  - Test warning vs critical log levels.
- [ ] `apps/api/src/health/health-metrics.controller.spec.ts`:
  - Test `x-internal-token` auth (missing, wrong, valid).
  - Test returns aggregated metrics.
- [ ] Update data-deletion metrics controller test for added auth check.

### 10. Tests — E2E tests (if PostgreSQL available)

- [ ] `GET /health` returns 200 with database status.
- [ ] `GET /internal/metrics/health` returns 403 without token.
- [ ] `GET /internal/metrics/health` returns aggregated metrics with valid token.

## Verification

Run these commands and record outcomes:

1. `pnpm --filter api test` — all unit tests pass.
2. `pnpm --filter api test:e2e` — if PostgreSQL available.
3. `pnpm lint` — no new warnings.
4. `pnpm typecheck` — passes.
5. `pnpm build` — passes.
6. `pnpm format:check` — passes.

Manual verification:
- `GET /health` returns `{ status: 'ok', info: { database: { status: 'up' } } }`.
- `GET /internal/metrics/health` (with token) returns all subsystem metrics.
- `GET /internal/metrics/health` (without token) returns 403.
- Alert logger emits structured log lines when thresholds are exceeded.
- Grep codebase Logger calls for credential/secret leaks.

## Definition of Done

- [ ] All acceptance criteria are implemented.
- [ ] The solution follows the approved architecture and existing project conventions.
- [ ] Changes are limited to the task and necessary related updates.
- [ ] Relevant tests have been added or updated.
- [ ] Relevant tests and checks have been executed, or unrun checks are explicitly disclosed.
- [ ] Authorization, tenant isolation, privacy, and security implications have been considered.
- [ ] API, event, database, and documentation contracts are updated when required.
- [ ] No unrelated changes or destructive operations have been introduced.
- [ ] The final report accurately describes changes, verification, and remaining limitations.

## Assumptions / open questions

- **No CloudWatch integration needed** — structured log output is the integration point. CloudWatch alarms are configured in infrastructure, not application code.
- **In-memory metrics acceptable for MVP** — a rolling buffer of 1000 request latencies is sufficient. Production should consider Prometheus/CloudWatch Metrics.
- **Alert thresholds are hardcoded** — can be made configurable via env vars in a follow-up.
- **Health check is public** (`/health`) for load balancer probing — no auth required. Metrics require the internal token.
- **Analysis run "cost" tracking** — MVP tracks run count and duration as a proxy. Actual Bedrock cost tracking requires AWS billing integration, which is out of scope.
