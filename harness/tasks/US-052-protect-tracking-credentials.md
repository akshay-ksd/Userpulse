# US-052 — Protect tracking credentials

| Field | Value |
|---|---|
| **Story ID** | US-052 |
| **Epic** | EP-11 Privacy, Security, and Operations |
| **Priority** | P0 |
| **Status** | Done |
| **Created** | 2026-11-18 |
| **Completed** | 2026-11-18 |

## Story

**As a** customer, **I want** project tracking credentials protected, **so that** unauthorized parties cannot submit events to my project.

## Acceptance criteria

- [x] Raw credentials are not stored. — SHA-256 hash stored in `keyHash`; raw key returned only at creation time (US-012).
- [x] Credentials are not written to logs. — Audit confirmed no logger statements expose keys, tokens, or hashes.
- [x] Credentials can be revoked and rotated. — `revoke()` and `rotate()` methods with atomic transactions (US-013).
- [x] Ingestion validates credentials before accepting events. — `ApiKeyGuard` validates Bearer token, checks revocation and project status (US-021).
- [x] Tracking credentials cannot authorize administrative actions. — `ApiKeyGuard` only used on `POST /v1/events`; all admin endpoints use session auth.
- [x] Credential changes are audited. — `createdBy` and `revokedBy` fields track who created/revoked each key.

## Implementation notes

All credential protection was already implemented across US-012, US-013, and US-021. This story adds 12 focused security tests verifying these properties:
- Hash-only storage and show-once key behavior
- List endpoint returns prefix only (no raw key or hash)
- Guard rejects missing/invalid/revoked credentials and archived project keys
- Guard derives project/org from key (not from request params)
- Audit fields (`createdBy`, `revokedBy`) are recorded

## Verification

- [x] Unit tests: `pnpm --filter api test` — 343 passed (12 new credential protection tests)
- [x] Typecheck: `pnpm typecheck` — pass
- [x] Format: `pnpm format:check` — pass

## Definition of Done

- [x] All acceptance criteria verified with dedicated tests.
- [x] No new code changes needed — existing implementation satisfies all criteria.
