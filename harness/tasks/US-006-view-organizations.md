# US-006 — View organizations

- **Epic:** EP-02 Organizations and Membership
- **Priority:** P0 (M1 — Application Foundation)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-14) — see `harness/progress.md` for verification record
- **Created:** 2026-11-14

## Story

> **As a** user who belongs to organizations, **I want** to view my organizations, **so that** I can select a workspace.

## Acceptance criteria

- [x] Only authorized organizations are listed. — `GET /organizations` returns only membership-scoped orgs (implemented in US-005); dashboard fetches this endpoint.
- [x] Selecting an organization opens its workspace. — Org cards on `/dashboard` are now `<Link>` elements pointing to `/organizations/[id]`, which shows the org workspace page.
- [x] An empty state appears when the user has no organizations. — Dashboard shows "You don't have any organizations yet" with a prompt to create one (implemented in US-005).

## Story review

Most of this story's infrastructure already exists from US-005:

- `GET /organizations` returns only orgs where the user is a member (authorized). ✓
- `GET /organizations/:id` verifies membership and returns 404 for non-members. ✓
- The `/dashboard` page already fetches and lists organizations with an empty state. ✓

**What's missing:** Selecting an organization currently does nothing — the org cards on `/dashboard` are display-only `<div>` elements, not links. The story requires that selecting an org "opens its workspace."

**Scope decisions:**
- Create an organization workspace page at `/organizations/[id]` that shows the org name, slug, role, and a placeholder for future features (projects, members, settings).
- Make org cards on `/dashboard` clickable links to `/organizations/[id]`.
- The workspace page must verify membership via `GET /organizations/:id` and handle 401/404 gracefully.
- No new API endpoints needed — `GET /organizations/:id` already exists and is membership-checked.
- A "Back to dashboard" navigation link from the workspace page.

**Out of scope:** Inviting members (US-007), managing members (US-008), project creation (US-009), org settings/editing.

## Current codebase state (verified 2026-11-14)

- **API:** `OrganizationsController` has `GET /organizations` and `GET /organizations/:id` — both membership-scoped. No changes needed.
- **Web `/dashboard`:** Fetches orgs and displays them as non-clickable cards with name, slug, and role badge. Empty state and loading state exist.
- **Web routing:** App Router with `apps/web/src/app/` structure. No `/organizations/[id]` route exists.
- **Patterns:** Client components with `'use client'`, `fetch` with `credentials: 'include'`, router redirects on 401, `API_URL` from env var.

## Dependencies

- Upstream: US-005 (Done) — org creation, `GET /organizations`, `GET /organizations/:id`.
- Downstream: US-007 (invite), US-008 (manage members), US-009+ (projects within an org).

## Implementation subtasks

### 1. Web — Organization workspace page (`apps/web`)

- [x] Create `apps/web/src/app/organizations/[id]/page.tsx`:
  - `'use client'` component with `useParams` inside `<Suspense>` (Next.js prerender compatibility).
  - Reads `id` from `useParams<{ id: string }>()`.
  - Fetches `GET /organizations/:id` with `credentials: 'include'`.
  - On 401: redirect to `/login`.
  - On 404: show "Organization not found" message with link back to dashboard.
  - On success: show org name as heading, slug, user's role, creation date.
  - Include a "Back to dashboard" arrow link.
  - Loading state while fetching.
  - Error state for network failures.
  - Placeholder section: "Projects, members, and settings will appear here."

### 2. Web — Make org cards clickable on `/dashboard`

- [x] In `apps/web/src/app/dashboard/page.tsx`:
  - Wrapped each org card in `<Link>` (from `next/link`) pointing to `/organizations/${org.id}`.
  - Preserved existing styling and layout.
  - Added `Link` import.

### 3. Tests

- [x] API e2e tests — verified existing `GET /organizations/:id` behavior still passes (41 tests pass; 1 pre-existing `app.e2e-spec.ts` failure due to missing `DATABASE_URL`).
- [x] No new API tests needed since no API changes.
- [x] Build, lint, typecheck pass with new page.

### 4. Verification

- [x] `pnpm --filter api test` — 35 passed.
- [x] `pnpm --filter api test:e2e` — 41 passed (1 pre-existing failure in `app.e2e-spec.ts`).
- [x] `pnpm lint` — pass.
- [x] `pnpm typecheck` — pass.
- [x] `pnpm build` — pass.
- [x] `pnpm format:check` — pass.

## Definition of Done

- [x] All acceptance criteria are satisfied.
- [x] The solution follows the approved architecture and existing project conventions.
- [x] Changes are limited to the task and necessary related updates.
- [x] Relevant tests have been added or updated.
- [x] Relevant tests and checks have been executed.
- [x] Authorization and tenant isolation have been verified.
- [x] No unrelated changes or destructive operations have been introduced.
- [x] The final report accurately describes changes, verification, and remaining limitations.

## Assumptions / open questions

- The workspace page uses the org UUID (`id`) in the URL, not the slug, for unambiguous routing. Slugs can change; IDs cannot.
- The workspace page is a minimal shell for now — it will be populated with projects (US-009+), members (US-007/008), and settings in later stories.
- No new API endpoints needed — the existing `GET /organizations/:id` endpoint serves the workspace page.
