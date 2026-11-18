# US-025 — View event collection status

- **Epic:** EP-05 Event Ingestion and Processing
- **Priority:** P0 (M3 — Event Ingestion Pipeline)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-15) — see `harness/progress.md` for verification record
- **Created:** 2026-11-15

## Story

> **As a** project administrator, **I want** to see whether my project is receiving events, **so that** I can detect tracking problems.

## Acceptance criteria

- [x] Project view indicates whether event activity has been received.
- [x] Latest received event time is displayed when available.
- [x] Projects with no events show setup guidance.
- [x] The UI does not claim that queue acceptance means analytical persistence.

## Story review

**Scope boundary:** This story adds an event collection status section to the existing project detail page (`/organizations/[id]/projects/[projectId]`). It requires a new API endpoint to return event summary statistics for a project, and a frontend component to display the status.

**Key decisions:**

- **API endpoint:** `GET /organizations/:orgId/projects/:projectId/event-status` — returns total event count, latest event timestamp, and earliest event timestamp for the project. Only counts `validationStatus: 'VALID'` events (not rejected). Protected by session auth + org membership (same pattern as other project endpoints).
- **Query approach:** A single Prisma aggregate query on the `Event` model filtered by `projectId` and `validationStatus: 'VALID'`. Uses `_count`, `_max(ingestedAt)`, and `_min(ingestedAt)`. Existing index on `(projectId, validationStatus)` covers this.
- **Response shape:** `{ totalEvents: number, latestEventAt: string | null, earliestEventAt: string | null }`. When no events exist, all fields are 0/null.
- **UI states:**
  - **No events:** Show setup guidance with a link to SDK docs / credential generation.
  - **Events received:** Show total count, latest event time (relative "X minutes ago" format), and a green "Receiving events" indicator.
- **Language precision:** The UI will say "events received" (queue acceptance), not "events processed" or "events stored in analytics". This satisfies the acceptance criterion about not claiming analytical persistence.
- **No polling/real-time:** The status is fetched once on page load. Manual refresh by reloading the page. Real-time updates are out of scope.

**Out of scope:**
- Event volume charts or trends (EP-07 analytics)
- Processing status (PENDING/PROCESSED/FAILED counts) — internal detail
- Per-event listing
- Real-time/WebSocket updates

## Current codebase state (verified 2026-11-15)

- `apps/api/src/projects/projects.service.ts` — `ProjectsService` with `verifyMembership()`, `findOne()`, etc. All operations scoped to org membership.
- `apps/api/src/projects/projects.controller.ts` — `ProjectsController` at `organizations/:orgId/projects`. Standard NestJS patterns with `@CurrentUser()`.
- `apps/api/src/projects/projects.module.ts` — Registers `ProjectsService` and `ProjectsController`.
- `apps/web/src/app/organizations/[id]/projects/[projectId]/page.tsx` — Project detail page with `EditProjectForm`, `TrackingCredentials`, archive/restore button. This is where the event status section will be added.
- `packages/database/prisma/schema.prisma` — `Event` model with `projectId`, `ingestedAt`, `validationStatus`. Index `@@index([projectId, validationStatus])` exists.
- `apps/api/src/ingestion/` — Ingestion module (separate from projects module).

## Dependencies

**Upstream (must be Done):**
- US-009 — Create a project (Done) — project detail page and API
- US-021 — Submit an event batch (Done) — events exist in the database
- US-022 — Validate and normalize events (Done) — `validationStatus` field
- US-024 — Prevent duplicate events (Done) — accurate event counts

**Downstream (depends on this):**
- EP-07+ analytics stories — build on this status foundation

## Implementation subtasks

### 1. API — Event status endpoint

- [x] **1.1** Add `getEventStatus()` to `ProjectsService` (`apps/api/src/projects/projects.service.ts`):
  - Verify membership (reuse `verifyMembership`)
  - Verify project exists in org (reuse `findFirst` pattern)
  - Query: `prisma.event.aggregate({ where: { projectId, validationStatus: 'VALID' }, _count: true, _max: { ingestedAt: true }, _min: { ingestedAt: true } })`
  - Return `{ totalEvents: number, latestEventAt: Date | null, earliestEventAt: Date | null }`

- [x] **1.2** Add `GET :projectId/event-status` to `ProjectsController` (`apps/api/src/projects/projects.controller.ts`):
  - `@Get(':projectId/event-status')` 
  - `@CurrentUser() user: AuthUser`
  - `@Param('orgId') orgId: string, @Param('projectId') projectId: string`
  - Returns the service response directly

### 2. Web — Event collection status component

- [x] **2.1** Add `EventCollectionStatus` component in the project detail page (`apps/web/src/app/organizations/[id]/projects/[projectId]/page.tsx`):
  - Fetches `GET /organizations/:orgId/projects/:projectId/event-status` on mount
  - **Loading state:** "Loading event status…"
  - **No events state:** Show "No events received yet" with setup guidance:
    - "Generate a tracking credential above and integrate the Userpulse SDK to start sending events."
  - **Events received state:** 
    - Green dot indicator + "Receiving events"
    - "Total events: N"
    - "Latest event: X minutes/hours/days ago" (relative time)
  - **Error state:** "Could not load event status." (non-blocking; rest of page still works)

- [x] **2.2** Add the component to the `ProjectDetail` render, between `TrackingCredentials` and the "Created" timestamp line.

### 3. Tests

- [x] **3.1** Unit tests for `getEventStatus()` in `projects.service.spec.ts`:
  - Happy path: project with events → returns count and timestamps
  - No events: returns `{ totalEvents: 0, latestEventAt: null, earliestEventAt: null }`
  - Non-member: throws NotFoundException

- [x] **3.2** E2E tests for `GET /organizations/:orgId/projects/:projectId/event-status`:
  - 200 with events
  - 200 with no events (empty project)
  - 401 unauthenticated
  - 404 non-member
  - 404 non-existent project

### 4. Verification

- [x] `pnpm --filter api test` — 124 passed (3 new: getEventStatus happy/empty/non-member)
- [x] `pnpm lint` — pass (pre-existing warnings only)
- [x] `pnpm typecheck` — pass
- [x] `pnpm build` — pass
- [x] `pnpm format:check` — pass

## Definition of Done

- [x] The implementation meets the requested behavior and acceptance criteria.
- [x] The solution follows the approved architecture and existing project conventions.
- [x] Changes are limited to the task and necessary related updates.
- [x] Relevant tests have been added or updated.
- [x] Relevant tests and checks have been executed, or unrun checks are explicitly disclosed.
- [x] Authorization, tenant isolation, privacy, and security implications have been considered.
- [x] API, event, database, and documentation contracts are updated when required.
- [x] No unrelated changes or destructive operations have been introduced.
- [x] The final report accurately describes changes, verification, and remaining limitations.

## Assumptions / open questions

- No database migration needed — querying existing `Event` table with existing indexes.
- Relative time formatting done client-side (no library; simple helper function).
- The "setup guidance" text is minimal — a sentence pointing to credentials above. No SDK docs page exists yet in the app.
- Event count includes all valid ingested events (PENDING + PROCESSED + FAILED), not just PROCESSED. This is intentional: the question is "are events being received?" not "are events in the analytics store?".
