# US-003 — Sign out

- **Epic:** EP-01 Authentication and Account
- **Priority:** P0 (M1 — Application Foundation)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-14) — see `harness/progress.md` for verification record
- **Created:** 2026-11-14

## Story

> **As a** signed-in user, **I want** to sign out, **so that** my account is not left accessible on a shared device.

## Acceptance criteria

- [x] The user can sign out from the application.
- [x] The active session is invalidated.
- [x] Protected pages and APIs require authentication after sign-out.

## Story review

The story is small and well-scoped. `@nestjs/authentication` already provides `SignInService.signOut()` which ends the current browser's session and clears the cookie. The session store's `deleteSession()` is already implemented in `PrismaSessionStore`.

- **Scope boundary:** Sign out only. No "sign out everywhere" (could be a future enhancement), no session listing, no password reset (US-004).
- **API endpoint:** `POST /auth/sign-out`. Must be a protected route (requires an active session). Returns `204 No Content` on success. Uses `SignInService.signOut()` which handles session deletion and cookie clearing.
- **Web:** Add a "Sign out" button to the `/dashboard` page. On click, `POST /auth/sign-out` with `credentials: 'include'`, then redirect to `/login`.
- **Edge cases:** If the session is already invalid (expired, revoked), `signOut()` returns `false` — still return `204` since the user is effectively signed out. The global auth guard will handle truly unauthenticated requests with `401`.
- **No database changes needed:** The `sessions` table and `PrismaSessionStore.deleteSession()` already exist from US-002.

## Current codebase state (verified 2026-11-14)

- `apps/api/src/auth/auth.controller.ts` — Has `POST /auth/register` and `POST /auth/sign-in`. The entire `AuthController` is `@Public()`. Sign-out needs a separate controller or a non-public route.
- `apps/api/src/auth/auth.service.ts` — Has `register()` and `verifyCredentials()`. No sign-out logic needed here; `SignInService.signOut()` handles it.
- `apps/api/src/auth/auth.module.ts` — Registers `AuthController`, `AuthService`, `SessionAuth`, `PrismaSessionStore`.
- `apps/api/src/auth/session.store.ts` — `PrismaSessionStore` with `deleteSession()` already implemented.
- `apps/api/src/app.module.ts` — `AuthenticationModule.forRoot()` with session config. `SignInService` is provided by `AuthenticationModule`.
- `apps/api/src/me/me.controller.ts` — Protected `GET /me` route.
- `apps/web/src/app/dashboard/page.tsx` — Shows "Welcome, {name}" but has no sign-out button.
- `apps/web/src/app/login/page.tsx` — Login form, redirects to `/dashboard` on success.
- `@nestjs/authentication@0.1.6` — Exports `SignInService` with `signOut()` (ends the browser's session and clears the cookie) and `signOutEverywhere()`. Also exports `CurrentSession` decorator.

## Dependencies

- Upstream: US-002 (done) — session infrastructure, `SignInService`, `PrismaSessionStore`.
- Downstream: US-004 (password reset may end sessions), US-005+ (sign-out button persists across all authenticated pages).

## Implementation subtasks

### 1. API — sign-out endpoint (`apps/api`)

- [x] Add `POST /auth/sign-out` to `AuthController`. Moved `@Public()` from class level to individual `register()` and `signIn()` methods, leaving `signOut()` protected by the global auth guard.
- [x] `signOut()` method: calls `this.signInService.signOut()`, returns `204 No Content` via `@HttpCode(204)`.
- [x] The sign-out response clears the session cookie (handled by `SignInService.signOut()` internally).

### 2. Web — sign-out button (`apps/web`)

- [x] Add a "Sign out" button to `/dashboard` page.
- [x] On click, `POST {NEXT_PUBLIC_API_URL}/auth/sign-out` with `credentials: 'include'`.
- [x] On success (204) or auth failure (401), redirect to `/login`.
- [x] Handle network errors gracefully (redirects to login even on failure).

### 3. Tests

- [x] API e2e test (`apps/api/test/auth.e2e-spec.ts`): extended with sign-out tests:
  - Register → sign-in → get cookie → `POST /auth/sign-out` with cookie → `204`.
  - After sign-out, `GET /me` with the same cookie → `401`.
  - `POST /auth/sign-out` without a cookie → `401`.
  - The session row is deleted from the database after sign-out.
- [x] Web: no test framework — manual verification only.

## Verification

Run from the repo root:

1. `pnpm --filter api test` — all pass.
2. `pnpm --filter api test:e2e` — all pass (including new sign-out tests).
3. `pnpm lint` — pass.
4. `pnpm typecheck` — pass.
5. `pnpm build` — pass.
6. `pnpm format:check` — pass.
7. Manual E2E: register → sign in → land on dashboard → click "Sign out" → redirected to `/login` → attempt to visit `/dashboard` → redirected to `/login`. Verify the session row is gone from the `sessions` table.

## Definition of Done

- [x] All acceptance criteria verified by the checks above.
- [x] No secrets exposed in responses or logs.
- [x] Changes scoped to this story — no password reset, no "sign out everywhere".
- [x] `harness/progress.md` updated (row, story notes, summary counts, activity log).

## Assumptions / open questions

- `POST` (not `DELETE`) for sign-out, matching the convention that state-changing auth operations use POST and respecting CSRF protection.
- Returns `204 No Content` — no response body needed.
- "Sign out everywhere" deferred to a future story if needed.
- The sign-out button is placed only on `/dashboard` for now; as more pages are added, a shared layout/nav will carry it.
