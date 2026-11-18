# US-029 — Find unmapped events

- **Epic:** EP-06 Feature Management
- **Priority:** P1 (M4 — Feature Management and Analytics Foundation)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-16)
- **Created:** 2026-11-16

## Story

> **As a** product manager, **I want** to see events not mapped to a feature, **so that** I can improve feature coverage.

## Acceptance criteria

- [ ] Unmapped event names are listed for the selected project.
- [ ] Recent activity is visible for each event.
- [ ] Users can start a mapping action from the list.
- [ ] An empty state appears when no unmapped events exist.

## Story review

**Scope boundary:** This story adds an API endpoint to list distinct event names from the `events` table that have no corresponding `FeatureEventMapping` entry, along with recent activity metadata (event count, last seen). A web UI section on the project detail page displays these unmapped events and lets users initiate mapping to a feature.

**Key decisions:**

- **API endpoint:** `GET /organizations/:orgId/projects/:projectId/unmapped-events` — queries distinct `eventName` values from valid events (`validationStatus: 'VALID'`) that are NOT in `feature_event_mappings` for the project. Returns each event name with `eventCount` (total occurrences) and `lastSeenAt` (most recent `ingestedAt`).
- **Query approach:** Use Prisma `groupBy` on `events` for distinct event names, then filter out those present in `feature_event_mappings`. This is efficient for the PostgreSQL staging table at MVP scale.
- **Placement:** Add the endpoint to `FeaturesController` since it's closely related to feature management. The service method goes on `FeaturesService`.
- **"Start mapping" action:** Each unmapped event in the UI has a "Map to feature" dropdown/button that lets the user pick an existing feature. This calls the existing `PUT :featureId/mappings` endpoint (from US-028) with the event name added to that feature's mappings.
- **Empty state:** When all collected events are already mapped (or no events exist), display a message explaining that.
- **No pagination for MVP:** Event name cardinality is typically low (tens to low hundreds). If needed, pagination can be added later.

**Out of scope:**
- ClickHouse analytics queries (EP-07)
- Auto-discovery or event schema management
- Filtering/search within unmapped events

## Current codebase state (verified 2026-11-16)

- `apps/api/src/features/features.service.ts` — `FeaturesService` with `verifyProjectAccess()`, `getMappings()`, `setMappings()`, `removeMapping()`, `findByProject()`. Extend with `getUnmappedEvents()`.
- `apps/api/src/features/features.controller.ts` — `FeaturesController` at `/organizations/:orgId/projects/:projectId/features`. Add new endpoint here.
- `packages/database/prisma/schema.prisma` — `Event` model with `eventName`, `projectId`, `validationStatus`, `ingestedAt`. `FeatureEventMapping` with `projectId`, `eventName`, unique on `(projectId, eventName)`.
- `apps/web/src/app/organizations/[id]/projects/[projectId]/page.tsx` — Project detail page with `FeaturesSection`, `TrackingCredentials`, `EventCollectionStatus`. Add `UnmappedEventsSection`.

## Dependencies

**Upstream (must be Done):**
- US-026 — Create a product feature (Done) — Feature model
- US-028 — Map events to a feature (Done) — FeatureEventMapping model and mapping endpoints

**Downstream (depends on this):**
- EP-07 — Product analytics (will build on feature coverage concepts)

## Implementation subtasks

### 1. API — Unmapped events service method

- [ ] **1.1** Add `getUnmappedEvents(orgId, projectId, userId)` to `FeaturesService`:
  - Verify project access via `verifyProjectAccess()`.
  - Query distinct `eventName` from `events` where `projectId` matches and `validationStatus = 'VALID'`, grouped by `eventName` with `_count` and `_max` of `ingestedAt`.
  - Query all mapped event names from `feature_event_mappings` for this project.
  - Filter out mapped event names.
  - Return `UnmappedEventInfo[]` with `eventName`, `eventCount`, `lastSeenAt`.
  - Order by `lastSeenAt` descending (most recently active first).

- [ ] **1.2** Add `UnmappedEventInfo` interface to `features.service.ts`:
  ```typescript
  export interface UnmappedEventInfo {
    eventName: string;
    eventCount: number;
    lastSeenAt: Date;
  }
  ```

### 2. API — Unmapped events endpoint

- [ ] **2.1** Add `GET unmapped-events` endpoint to `FeaturesController`:
  - Route: `GET /organizations/:orgId/projects/:projectId/unmapped-events`
  - Note: This is a sibling to features, not nested under a feature. Add it on a separate controller or add to existing controller with a custom route. Since the existing controller is at `.../features`, add a new `UnmappedEventsController` at `.../unmapped-events`, or add it as a method on `FeaturesController` with an explicit `@Get()` at the project level. Best approach: add it to `ProjectsController` since it's project-scoped, or create a small controller in the features module. We'll add it to `FeaturesController` with a path adjustment — but the controller base path is `.../features`. Instead, register a new route on `ProjectsController`.

  Actually, the simplest approach: add a new controller `UnmappedEventsController` in the features module, registered at `organizations/:orgId/projects/:projectId/unmapped-events`. This keeps the features module cohesive.

- [ ] **2.2** Create `apps/api/src/features/unmapped-events.controller.ts`:
  ```typescript
  @Controller('organizations/:orgId/projects/:projectId/unmapped-events')
  export class UnmappedEventsController {
    constructor(private readonly featuresService: FeaturesService) {}

    @Get()
    getUnmappedEvents(
      @CurrentUser() user: AuthUser,
      @Param('orgId') orgId: string,
      @Param('projectId') projectId: string,
    ): Promise<UnmappedEventInfo[]> {
      return this.featuresService.getUnmappedEvents(orgId, projectId, user.id);
    }
  }
  ```

- [ ] **2.3** Register `UnmappedEventsController` in `FeaturesModule`.

### 3. API — Unit tests

- [ ] **3.1** Add tests to `apps/api/src/features/features.service.spec.ts`:
  - `getUnmappedEvents` — returns events not in mappings
  - `getUnmappedEvents` — returns empty array when all events are mapped
  - `getUnmappedEvents` — returns empty array when no events exist
  - `getUnmappedEvents` — non-member gets NotFoundException

### 4. Web — Unmapped events UI

- [ ] **4.1** Add `UnmappedEventsSection` component to the project detail page:
  - Fetches `GET /organizations/:orgId/projects/:projectId/unmapped-events` on mount.
  - Shows each unmapped event with its name, event count, and "last seen" relative time.
  - Each event has a "Map to feature" button that opens a dropdown of existing features.
  - Selecting a feature calls `PUT .../features/:featureId/mappings` with the event name added.
  - Empty state: "All events are mapped to features." or "No events collected yet."
  - Loading and error states.
  - Place the section after `FeaturesSection` on the project detail page.

### 5. Verification

- [ ] Run `pnpm --filter api test` — unit tests pass
- [ ] Run `pnpm lint` — pass
- [ ] Run `pnpm typecheck` — pass
- [ ] Run `pnpm build` — pass
- [ ] Run `pnpm format:check` — pass

## Definition of Done

- [ ] The implementation meets the requested behavior and acceptance criteria.
- [ ] The solution follows the approved architecture and existing project conventions.
- [ ] Changes are limited to the task and necessary related updates.
- [ ] Relevant tests have been added or updated.
- [ ] Relevant tests and checks have been executed, or unrun checks are explicitly disclosed.
- [ ] Authorization, tenant isolation, privacy, and security implications have been considered.
- [ ] API, event, database, and documentation contracts are updated when required.
- [ ] No unrelated changes or destructive operations have been introduced.
- [ ] The final report accurately describes changes, verification, and remaining limitations.

## Assumptions / open questions

- No pagination needed at MVP — event name cardinality is typically manageable.
- Only `VALID` events are considered (rejected events are excluded).
- The "map to feature" action reuses the existing PUT mappings endpoint from US-028.
- No database migration needed — this story queries existing tables.
