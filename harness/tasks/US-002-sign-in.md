# US-002 — Sign in

- **Epic:** EP-01 Authentication and Account
- **Priority:** P0 (M1 — Application Foundation)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-14) — see `harness/progress.md` for verification record
- **Created:** 2026-11-14

## Story

> **As a** registered user, **I want** to sign in securely, **so that** I can access my workspace.

## Acceptance criteria

- [x] Valid credentials create an authenticated session.
- [x] Invalid credentials produce a generic error.
- [x] Protected pages and APIs reject unauthenticated requests.
- [x] Authentication secrets are not exposed in logs or client responses.

## Story review

The story meets the Definition of Ready; US-001 (registration, user persistence, bcrypt password hashes) is done and verified. Observations and decisions from the review:

- **Session mechanism: server-side sessions via `@nestjs/authentication` (session cookie), not a stateless JWT.** `apps/api/AGENTS.md` directs us to first-party Nest packages before adding libraries, and lists `@nestjs/authentication` for sign-in. It provides `SignInService` (creates the session, sets the `__Host-sid` HttpOnly/Secure/SameSite=Lax cookie, stores only the SHA-256 hash of the session token), a global authentication guard, `@Public()`, and a `SessionStore` contract we implement with Prisma. Server-side sessions make "the active session is invalidated" (US-003) a real `DELETE`, which a stateless JWT cannot do.
- **Password verification stays on bcryptjs.** US-001 stored bcrypt hashes (`$2b$10$...`); the package's `PasswordHasher` (scrypt) cannot verify them. Keep bcryptjs `compare()` in `AuthService`; do not migrate hashes. Revisit a scrypt migration (hash on next sign-in) separately if desired.
- **Generic error + timing:** unknown email and wrong password both return `401` with `"Invalid email or password."`. Compare against a constant dummy bcrypt hash when the email is unknown, so response timing does not reveal registered emails.
- **Cross-origin cookie (web `localhost:3000` → API `localhost:3001`):** same-site (ports don't count for sites), so `SameSite=Lax` works, but the API needs `session.trustedOrigins: [WEB_ORIGIN]`, CORS `credentials: true`, and the web client must send `credentials: 'include'`. On Nest 12.5, also call `app.enableCsrfProtection()` with the same trusted origins (per the package's security guidance).
- **No JWT secret needed yet:** the session cookie holds a random token, not a JWT. `JWT_SECRET` in `.env.example` stays unused until bearer tokens are introduced (SDK/mobile clients). `@nestjs/config` is still not required by this story; keep passing env vars explicitly.
- **Protected surface for verification:** the global guard protects every route by default; `POST /auth/register`, `POST /auth/sign-in`, and the root health route get `@Public()`. Add `GET /me` (returns the current user) as the protected endpoint the web app and tests verify against.
- **Scope boundary:** no sign-out (US-003), no password reset (US-004), no rate limiting (add `@nestjs/throttler` with the package's sign-in guidance as a follow-up; noted in progress tracker), no MFA, no email verification.

## Current codebase state (verified 2026-11-14)

- `apps/api` — NestJS 12.5 (ESM, Vitest, oxlint). `AuthModule` with `POST /auth/register` (Zod `registerSchema` via global `StandardSchemaValidationPipe` in `src/app.setup.ts`), global `PrismaModule`/`PrismaService`, bcryptjs hashing. No auth guard, no sessions. CORS origin from `WEB_ORIGIN` (no credentials yet).
- `apps/web` — Next.js 16.4.6. `/register` client page posts to `NEXT_PUBLIC_API_URL` and links to `/login` (not yet implemented). No other routes beyond `/`.
- `packages/database` — Prisma schema has `User` (no `Session` model yet); initial migration applied. Exported via `packages/database/src/index.ts` (build to `dist`).
- Docs: NestJS authentication guide — <https://docs.nestjs.com/security/authentication> (session cookie flow, `SessionStore` contract, Prisma store rules, CSRF/trusted origins).

## Dependencies

- Upstream: US-001 (done) — `users` table and bcrypt hashes.
- Downstream: US-003 (sign out = delete session via `SessionService`), US-004 (reset; ends sessions), US-005+ (every authenticated route relies on the guard and `@CurrentUser()`).

## Implementation subtasks

### 1. Database (`packages/database`)

- [x] Add a `Session` model to the Prisma schema (`sessions` table): `id` (text PK — SHA-256 hash of the cookie token), `userId` FK → `users` (cascade delete), `createdAt`, `expiresAt`, `lastActiveAt` (timestamptz), `mfa` (nullable text), `metadata` (nullable jsonb); indexes on `userId` and `expiresAt`. Follow existing schema conventions (camelCase fields, `@@map`).
- [x] Generate and apply a migration (`sessions`), rebuild the package so `apps/api` sees the new model.

### 2. API — sign-in + session guard (`apps/api`)

- [x] Install `@nestjs/authentication` (check the version compatible with Nest 12.5).
- [x] Add `PrismaSessionStore` implementing `SessionStore`, registered with `AuthenticationStorage` (`registerSource({ sessions: this })`). Follow the package's Prisma rules: `touchSession` = conditional `updateMany` (id + `lastActiveAt < new`), `deleteSession` = `deleteMany` resolving `count > 0`, `createSession` also deletes expired rows. Never upsert.
- [x] Add a `SessionAuth` credential provider extending `SessionCookieProvider`, `validate(session)` loading the user by id via Prisma (return `null` when the user is gone).
- [x] Register `AuthenticationModule.forRoot({ session: { absoluteTtl: '7d', idleTtl: '1d', trustedOrigins: [WEB_ORIGIN] } })` in `AppModule`; the global guard then protects all routes by default.
- [x] `AuthService.verifyCredentials(email, password)`: look up user by normalized email; `bcrypt.compare` against the stored hash or a constant dummy hash; return the user or `null`. Never log password, hash, or session token.
- [x] `POST /auth/sign-in` (`@Public()`, `@HttpCode(200)`, Zod schema — email format only, password as plain string so old passwords still work): `null` → `401` "Invalid email or password." (identical for unknown email and wrong password); success → `SignInService.signIn(user.id, { method: 'password' })`, respond `{ user: { id, email, name } }` (no hash, no token in the body).
- [x] Mark `POST /auth/register` and the root route `@Public()` (registration must not require a session).
- [x] Add `GET /me` returning the current user via `@CurrentUser()` (proof of a protected API).
- [x] `app.setup.ts`: CORS `credentials: true`; call `app.enableCsrfProtection({ trustedOrigins: [WEB_ORIGIN] })` (Nest 12.5 supports it).
- [x] Audit logging: do not log request bodies on auth routes; confirm validation errors don't echo the password.

### 3. Web — sign-in page + protected page (`apps/web`)

- [x] Read `node_modules/next/dist/docs/01-app/02-guides/authentication.md` (done) — the API owns the session cookie; pages call the API with `credentials: 'include'`.
- [x] `/login` client page: email + password form, client validation (email format, non-empty password), `POST {NEXT_PUBLIC_API_URL}/auth/sign-in` with `credentials: 'include'`:
  - `200` → redirect to `/dashboard`.
  - `401` → show "Invalid email or password."
  - `400` → show validation message; network/5xx → generic error; loading state while submitting.
  - Link to `/register` for users without an account.
- [x] `/dashboard` page (protected placeholder workspace): client component that on mount fetches `GET {NEXT_PUBLIC_API_URL}/me` with `credentials: 'include'`; `401` → redirect to `/login`; success → greet the user by name/email. Loading state while checking. (Server Components can't read the API's cookie cross-origin; client-side check is the documented approach for this split-origin setup. Sign-out arrives in US-003.)
- [x] Follow existing styling conventions of `/register`.

### 4. Tests

- [x] API unit tests (Vitest): `verifyCredentials` — success returns user; wrong password → `null`; unknown email → `null` (dummy-hash path exercised); controller maps `null` → 401 with the generic message; sign-in response contains no password/hash/token.
- [x] Session store: run `authenticationStoreContract()` from `@nestjs/authentication/testing` for the `sessions` contract against the test database (follow the package's testing guide; PGlite optional, real Postgres matches existing e2e setup).
- [x] API e2e (`apps/api/test/auth.e2e-spec.ts`, extend): register → sign-in 200 + `__Host-sid` cookie set; `GET /me` with cookie → 200 with user; without cookie → 401; wrong password → 401 generic; unknown email → 401 generic; `POST /auth/register` still public.
- [x] Web: no test framework in the app — manual verification only (repo convention).

## Verification

Run from the repo root unless noted:

1. `pnpm --filter @userpulse/database prisma migrate dev` — sessions migration applies cleanly.
2. `pnpm --filter api test` and `pnpm --filter api test:e2e` — all pass.
3. `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm format:check` — pass.
4. Manual E2E (browser): register a user, sign in via `/login`, land on `/dashboard` with the user's identity shown; wrong password shows the generic error; open `/dashboard` in a fresh browser profile (no cookie) → redirected to `/login`; curl `GET /me` without cookie → 401; DB `sessions` row stores a SHA-256 hash, not the cookie token; no password/hash/token in API logs or responses.

## Definition of Done

- [x] All acceptance criteria verified by the checks above.
- [x] No password, hash, session token, or secret in any API response or log statement.
- [x] Changes scoped to this story — no sign-out, reset, or rate limiting beyond what is listed.
- [x] `harness/progress.md` updated (row, story notes, summary counts, activity log).

## Assumptions / open questions

- Server-side session cookie chosen over stateless JWT (first-party package, real invalidation for US-003); bearer tokens deferred until SDK/mobile clients need them.
- Session lifetimes defaulted to the package defaults (`absoluteTtl: 7d`, `idleTtl: 1d`) — confirm with the product owner if different UX is wanted.
- bcrypt kept for password verification because US-001 hashes are bcrypt; scrypt migration deferred.
- Rate limiting on `/auth/sign-in` is recommended by the package (`@nestjs/throttler`, per-email+IP) but deferred to a hardening follow-up — flagged so it is not forgotten before pilot.
- The workspace after sign-in is a placeholder `/dashboard` until organizations (US-005/US-006) define the real landing page.
