# US-004 — Reset password

- **Epic:** EP-01 Authentication and Account
- **Priority:** P0 (M1 — Application Foundation)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-14) — see `harness/progress.md` for verification record
- **Created:** 2026-11-14

## Story

> **As a** user who has forgotten a password, **I want** to reset it, **so that** I can regain account access.

## Acceptance criteria

- [x] A user can request a reset using their email address.
- [x] The response does not disclose whether the email is registered.
- [x] Reset tokens expire and cannot be reused.
- [x] A successfully reset password replaces the old password.

## Story review

This story adds a two-step password reset flow: (1) request a reset link, (2) use the token from that link to set a new password.

**Scope boundaries:**
- In scope: password reset request endpoint, reset confirmation endpoint, token model, web pages for both steps.
- Out of scope: email delivery (MVP uses console/log output of the reset URL; `@nestjs/mail` integration deferred to production hardening), rate limiting (deferred per US-002 notes), "change password while signed in" (different story).

**Key decisions:**
- **Token storage:** A new `PasswordResetToken` Prisma model. Store the SHA-256 hash of the token (same pattern as sessions). The raw token goes in the reset URL only.
- **Token generation:** `crypto.randomBytes(32)` → URL-safe base64. Tokens expire after 1 hour. One-time use: deleted on successful reset.
- **Timing safety:** The request endpoint always returns the same response shape and status (200) regardless of whether the email exists, matching the existing timing-parity pattern from `verifyCredentials`.
- **Invalidation:** On successful reset, delete all password reset tokens for that user (prevents reuse of any outstanding tokens). Optionally revoke all sessions (forces re-login with new password).
- **Password validation:** Reuse the existing `registerSchema` password rules (min 8, max 72, letter + number).
- **No email disclosure:** `POST /auth/forgot-password` always responds with a generic success message. The reset URL is logged to the console in development.

**Edge cases:**
- Request for non-existent email: return 200 with the same message (no info leak).
- Expired token: return 400 "Reset link has expired or is invalid."
- Already-used token: same 400 (token was deleted on use).
- Invalid/malformed token: 400 with the same generic message.

## Current codebase state (verified 2026-11-14)

- `apps/api/src/auth/auth.controller.ts` — Has `register`, `signIn`, `signOut`. Both `register` and `signIn` are `@Public()`.
- `apps/api/src/auth/auth.service.ts` — Has `register()` and `verifyCredentials()`. Uses bcryptjs with 10 salt rounds and a dummy hash for timing parity.
- `apps/api/src/auth/register.dto.ts` — Zod schema with password validation (min 8, max 72, letter + number).
- `apps/api/src/auth/session.store.ts` — `PrismaSessionStore` for session management.
- `packages/database/prisma/schema.prisma` — Has `User` (id, email, passwordHash, name) and `Session` models. No password reset model yet.
- `apps/web/src/app/login/page.tsx` — Login form. No "Forgot password?" link yet.
- No `@nestjs/mail` currently installed.

## Dependencies

- **Upstream:** US-001 (done) — user model, bcrypt hashing. US-002 (done) — session infrastructure (for revoking sessions on reset).
- **Downstream:** None immediate; this completes EP-01 Authentication.

## Implementation subtasks

### 1. Database — PasswordResetToken model

- [ ] Add `PasswordResetToken` model to `packages/database/prisma/schema.prisma`:
  ```prisma
  model PasswordResetToken {
    id        String   @id
    userId    String
    expiresAt DateTime @db.Timestamptz(6)
    createdAt DateTime @default(now()) @db.Timestamptz(6)

    @@index([userId])
    @@index([expiresAt])
    @@map("password_reset_tokens")
  }
  ```
  `id` is the SHA-256 hash of the raw token. No FK to User (same pattern as Session — lightweight, no cascade complexity).
- [ ] Run `pnpm --filter database prisma migrate dev --name password_reset_tokens` to create the migration.
- [ ] Run `pnpm --filter database build` to regenerate the Prisma client.

### 2. API — Forgot password endpoint

- [ ] Create `apps/api/src/auth/forgot-password.dto.ts` with Zod schema:
  ```ts
  import { z } from 'zod/v4';
  export const forgotPasswordSchema = z.object({
    email: z.email(),
  });
  export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;
  ```
- [ ] Add `forgotPassword(dto)` method to `AuthService`:
  - Look up user by email. If not found, return silently (no error).
  - If found: generate `crypto.randomBytes(32)`, base64url-encode it as the raw token.
  - SHA-256 hash the raw token for storage.
  - Delete any existing reset tokens for this user (prevents accumulation).
  - Create a `PasswordResetToken` row with the hash, userId, and `expiresAt = now + 1 hour`.
  - Log the reset URL to console: `Password reset link: {WEB_ORIGIN}/reset-password?token={rawToken}`.
  - Return void (same regardless of whether email exists).
- [ ] Add `POST /auth/forgot-password` to `AuthController`:
  - `@Public()`, `@HttpCode(200)`.
  - Returns `{ message: "If an account with that email exists, a password reset link has been sent." }`.

### 3. API — Reset password endpoint

- [ ] Create `apps/api/src/auth/reset-password.dto.ts` with Zod schema:
  ```ts
  import { z } from 'zod/v4';
  export const resetPasswordSchema = z.object({
    token: z.string().min(1),
    password: z.string().min(8).max(72)
      .refine(p => /[a-zA-Z]/.test(p) && /[0-9]/.test(p),
        'Password must contain at least one letter and one number'),
  });
  export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;
  ```
- [ ] Add `resetPassword(dto)` method to `AuthService`:
  - SHA-256 hash the incoming token.
  - Look up the `PasswordResetToken` by hashed id.
  - If not found or `expiresAt < now`: throw `BadRequestException("Reset link has expired or is invalid.")`.
  - Hash the new password with bcrypt (same salt rounds).
  - In a transaction: update the user's `passwordHash`, delete all reset tokens for that user, delete all sessions for that user (force re-login).
  - Return void.
- [ ] Add `POST /auth/reset-password` to `AuthController`:
  - `@Public()`, `@HttpCode(200)`.
  - Returns `{ message: "Your password has been reset. You can now sign in." }`.

### 4. Web — Forgot password page

- [ ] Create `apps/web/src/app/forgot-password/page.tsx`:
  - Form with email input and "Send reset link" button.
  - On submit: `POST {NEXT_PUBLIC_API_URL}/auth/forgot-password` with `{ email }`.
  - On success: show "If an account with that email exists, a password reset link has been sent."
  - Handle network errors.
  - Link back to `/login`.
- [ ] Add "Forgot your password?" link to `/login` page, pointing to `/forgot-password`.

### 5. Web — Reset password page

- [ ] Create `apps/web/src/app/reset-password/page.tsx`:
  - Read `token` from URL search params.
  - If no token in URL: show error state with link to `/forgot-password`.
  - Form with new password input and "Reset password" button.
  - Client-side password validation (same rules: min 8, max 72, letter + number).
  - On submit: `POST {NEXT_PUBLIC_API_URL}/auth/reset-password` with `{ token, password }`.
  - On success: show "Your password has been reset." with link to `/login`.
  - On 400: show "Reset link has expired or is invalid." with link to `/forgot-password`.
  - Handle network errors.

### 6. Tests

- [ ] Unit tests (`apps/api/src/auth/auth.service.spec.ts`):
  - `forgotPassword` with existing email: creates token row, logs URL.
  - `forgotPassword` with non-existent email: no error, no token created.
  - `resetPassword` with valid token: password updated, tokens deleted, sessions deleted.
  - `resetPassword` with expired token: throws BadRequestException.
  - `resetPassword` with invalid/missing token: throws BadRequestException.
- [ ] DTO spec (`apps/api/src/auth/forgot-password.dto.spec.ts`): email validation.
- [ ] DTO spec (`apps/api/src/auth/reset-password.dto.spec.ts`): token and password validation.
- [ ] E2E tests (`apps/api/test/auth.e2e-spec.ts`):
  - `POST /auth/forgot-password` with registered email → 200 + generic message.
  - `POST /auth/forgot-password` with unregistered email → 200 + same message.
  - `POST /auth/forgot-password` with invalid email → 400.
  - Full flow: register → forgot-password → extract token from console → `POST /auth/reset-password` with token + new password → 200 → sign in with new password → 200 → sign in with old password → 401.
  - `POST /auth/reset-password` with expired token → 400.
  - `POST /auth/reset-password` with already-used token → 400.
  - `POST /auth/reset-password` with missing token → 400.

## Verification

Run from the repo root:

1. `pnpm --filter api test` — all pass.
2. `pnpm --filter api test:e2e` — all pass (including new reset password tests).
3. `pnpm lint` — pass.
4. `pnpm typecheck` — pass (or note pre-existing issues).
5. `pnpm build` — pass.
6. `pnpm format:check` — pass.
7. Manual E2E: visit `/forgot-password`, submit email → see success message. Check API console for reset URL. Visit the URL → enter new password → success. Sign in with new password → lands on dashboard. Sign in with old password → rejected.

## Definition of Done

- [x] All acceptance criteria verified by the checks above.
- [x] No secrets exposed in responses or logs (raw token only in the console-logged URL, never in API responses).
- [x] Changes scoped to this story — no email delivery, no rate limiting.
- [x] `harness/progress.md` updated (row, story notes, summary counts, activity log).

## Assumptions / open questions

- Email delivery is deferred: the reset URL is logged to console. This is sufficient for MVP/development. Production email integration (`@nestjs/mail` + SES) will be added in a hardening pass.
- Tokens expire after 1 hour — standard for password resets.
- On successful reset, all existing sessions are revoked (forces re-login). This is the secure default.
- No rate limiting on forgot-password yet (deferred with the rest of rate limiting to a hardening story).
- The reset page reads the token from `?token=` query parameter.
