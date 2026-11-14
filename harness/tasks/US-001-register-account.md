# US-001 — Register an account

- **Epic:** EP-01 Authentication and Account
- **Priority:** P0 (M1 — Application Foundation)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-14) — see `harness/progress.md` for verification record
- **Created:** 2026-11-14

## Story

> **As a** new user, **I want** to register with my email and password, **so that** I can access the platform.

## Acceptance criteria

- [x] A user can register with valid details.
- [x] Email format and password policy are validated.
- [x] Duplicate email addresses are rejected with a clear message.
- [x] Passwords are never stored or returned in plain text.

## Story review

The story is small, independent, and meets the Definition of Ready. Observations from the review:

- **Scope boundary:** Registration only. Creating an authenticated session is US-002, so this task must not implement sign-in, tokens, or session issuance. Registration returns the created account; auto sign-in after registration is out of scope (can be revisited during US-002).
- **Password policy is unspecified.** Default to the project baseline: minimum 8 characters, maximum 72 (bcrypt input limit), at least one letter and one number. Confirm with the product owner if a stricter policy is required.
- **Name field:** The `User` model has an optional `name`. Registration accepts an optional display name; only email and password are required.
- **Duplicate email handling:** The `users.email` column has a unique constraint. Map the database unique-violation to a `409 Conflict` with a clear, non-enumerating message (`"An account with this email already exists."`). Note: for a self-serve registration form this message is acceptable; it does not leak anything the registration attempt itself wouldn't reveal.
- **Hashing:** Use bcrypt (`bcrypt` or `bcryptjs`) via a dedicated password service. Argon2id is acceptable if preferred, but pick one and store only the hash in `users.passwordHash`.
- **No session/token work:** Do not add JWT issuance, guards, or auth middleware here beyond what registration needs. `JWT_SECRET` in `.env.example` belongs to US-002.

## Current codebase state (verified 2026-11-14)

- `apps/api` — NestJS 12 (ESM, Vitest, oxlint). Only the default `AppController`/`AppService` scaffold exists; no auth module, no Prisma wiring. Validation: `StandardSchemaValidationPipe` (Zod) or `class-validator` — see `apps/api/AGENTS.md`.
- `apps/web` — Next.js 16.4.6 (React 19, Tailwind 4). Default scaffold page only; no routes beyond `/`. Read the relevant guide in `node_modules/next/dist/docs/` before writing code (see `apps/web/AGENTS.md`).
- `packages/database` — Prisma schema already contains `User` (`email @unique`, `passwordHash`) and `Organization`/`OrganizationMember`/`Project` models. Exposed via `packages/database/src/index.ts`. No migrations directory exists yet.
- Infra: `docker-compose.yml` at repo root (check it for a local Postgres service); `DATABASE_URL` documented in `.env.example`.

## Dependencies

- None upstream. This is the first story of M1.
- Downstream: US-002 (sign in) depends on the `User` persistence and password hashing established here.

## Implementation subtasks

### 1. Database (`packages/database`)

- [x] Generate and apply the initial Prisma migration for the existing schema (`users` table at minimum is required; the full schema is already defined, so one initial migration is fine).
- [x] Ensure the generated Prisma client is exported from `packages/database/src/index.ts` and consumable by `apps/api`.
- [x] Verify `docker-compose.yml` provides local Postgres; document the `pnpm prisma migrate` workflow in the package README if absent.

### 2. API — registration endpoint (`apps/api`)

- [x] Add a `PrismaModule`/`PrismaService` (global) that instantiates the Prisma client from `@userpulse/database` (match the actual export name in `packages/database`).
- [x] Add an `AuthModule` with:
  - `POST /auth/register` accepting `{ email, password, name? }`.
  - Input validation per `apps/api/AGENTS.md` conventions (Zod `StandardSchemaValidationPipe` or `class-validator` `ValidationPipe` — pick one and use it consistently):
    - `email`: valid email format, normalized to lowercase, trimmed.
    - `password`: min 8, max 72 chars, at least one letter and one digit.
    - `name`: optional, trimmed, max length (e.g. 100).
  - `AuthService.register()`:
    - Hash the password with bcrypt (cost factor 10–12) before persistence.
    - Create the `User` record; translate Prisma unique-constraint violation (`P2002` on `email`) into `409 Conflict` with a clear message.
    - Return `201` with `{ id, email, name, createdAt }` — **never** the password or its hash.
- [x] Never log the raw password or hash (check validation error paths and exception filters).
- [x] Register a global prefix or CORS config only if required for the web app to call the API locally (use `API_PORT` / `NEXT_PUBLIC_API_URL` from `.env.example`).

### 3. Web — registration page (`apps/web`)

- [x] Add a `/register` route with a form: email, password, optional name.
- [x] Client-side validation mirroring the server rules (email format, password policy) for UX; server remains authoritative.
- [x] On submit, call `POST {NEXT_PUBLIC_API_URL}/auth/register`:
  - Success → show confirmation and link to the (future) sign-in page (`/login`, implemented in US-002 — a placeholder link is acceptable).
  - `409` → show "An account with this email already exists."
  - `400` → show the field-level validation errors returned by the API.
- [x] Handle loading and generic error states (network failure, 5xx).
- [x] Follow Next.js 16 conventions — read `node_modules/next/dist/docs/` guidance per `apps/web/AGENTS.md` before implementing (Server vs Client Components, form handling).

### 4. Tests

- [x] API unit tests (`apps/api`, Vitest) for `AuthService` / controller:
  - Valid registration succeeds and returns no password/hash.
  - Invalid email and each password-policy violation are rejected with 400.
  - Duplicate email returns 409 with the clear message.
  - Stored value is a bcrypt hash, not the plain password.
- [x] API e2e test (`apps/api/test`, supertest) for `POST /auth/register` happy path + duplicate + validation failure, against a test database.
- [x] Web: add a test only if the app already has a test setup — it currently has none; per repo conventions do not scaffold a new framework for this story. Manual verification steps are listed below instead.

## Verification

Run from the repo root unless noted:

1. `pnpm --filter @userpulse/database prisma migrate dev` — migration applies cleanly (adjust to the actual package name).
2. `pnpm --filter api test` and `pnpm --filter api test:e2e` — all pass.
3. `pnpm --filter api lint` and `pnpm --filter api typecheck` — pass.
4. `pnpm --filter web lint` and `pnpm --filter web typecheck` — pass.
5. Manual E2E: start Postgres, `pnpm dev:api`, `pnpm dev:web`; register a new user via `/register`; confirm:
   - Success response contains no password/hash.
   - Re-registering the same email shows the duplicate message.
   - Weak passwords and malformed emails are rejected client- and server-side.
   - The `users` row in Postgres contains a bcrypt hash only.

## Definition of Done

- [x] All acceptance criteria verified by the checks above.
- [x] No password or hash present in any API response or log statement.
- [x] Changes scoped to this story — no sign-in/session work, no unrelated refactors.
- [x] `harness/progress.md` updated (row, story notes, summary counts, activity log).

## Assumptions / open questions

- Password policy defaulted to min 8 / max 72 / letter + number — confirm with product owner.
- Registration does **not** create a session; sign-in is US-002.
- Optional `name` collected at registration, per existing `User` model.
- bcrypt chosen as the hashing algorithm (widely supported, satisfies "never stored in plain text"); switch to argon2id only if the team standardizes on it.
