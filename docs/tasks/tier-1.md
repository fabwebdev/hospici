# Tier 1 — Security Foundation

> `needs:` All of Tier 0 complete.
> Required before any real user can log in or any PHI can be stored.
> Never combine two MEDIUM tasks in one session.

---

## T1-1 · Better Auth — backend `MEDIUM`

Configure `backend/src/config/auth.config.ts`:
- Cookie session: httpOnly, Secure, SameSite=Strict
- Email/password auth
- TOTP MFA **enforced** (not optional) per HIPAA §164.312(d)
- Idle session auto-logoff at 30 min per §164.312(a)(2)(iii)
- Socket.IO `session:expiring` event at **25 min** idle (5-min warning)

Create `identity/routes/auth.routes.ts`. Register at `/auth` in `server.ts`.

`read:` `SECURITY` §3

**Done when:** `POST /auth/sign-in` returns session cookie; TOTP enrollment required before first login; idle session expires at 30 min

---

## T1-2 · Better Auth — frontend `MEDIUM`

Replace all mocks in `frontend/src/functions/auth.functions.ts` with real Better Auth client calls: `loginFn`, `logoutFn`, `getCurrentSessionFn`, `breakGlassFn`. Wire `auth.middleware.ts` to read actual session cookie. Add TypeBox-validated input to `loginFn`.

`read:` `FE-CONTRACT`, `SECURITY` §3
`needs:` T1-1

**Done when:** Login form authenticates against real backend; invalid credentials return 401

---

## T1-3 · Replace header-stub RLS with JWT claims `MEDIUM`

`backend/src/middleware/rls.middleware.ts` reads raw forgeable HTTP headers. Extract `userId`, `locationId`, `role` from verified Better Auth session instead. Remove the header-reading code entirely. Remove header-injection code in `frontend/src/middleware/rls.middleware.ts`.

`read:` `SECURITY` §2
`needs:` T1-1

**Done when:** Forged `x-user-role: super_admin` header has no effect; RLS isolation test proves this

---

## T1-4 · AuditService `MEDIUM`

Create `backend/src/contexts/identity/services/audit.service.ts`.

Signature: `AuditService.log(action, userId, patientId | null, metadata)`

Rules:
- Writes to `audit_logs` via `db.insert()` only — append-only
- No UPDATE or DELETE SQL ever generated against `audit_logs`
- Wire into all PHI-accessing routes

`read:` `backend/src/contexts/identity/schemas/audit.schema.ts` (9 AuditActions defined)

**Done when:** Every PHI route write produces a row in `audit_logs`; no UPDATE/DELETE SQL ever generated

---

## T1-5 · PHI encryption service `MEDIUM`

Create `backend/src/shared-kernel/services/phi-encryption.service.ts`.

- Use pgcrypto `pgp_sym_encrypt` / `pgp_sym_decrypt`
- Key from `PHI_ENCRYPTION_KEY` env var — **never hardcoded**
- Cover all 18 HIPAA PHI identifiers (logging redact covers 10; add: `faxNumber`, `url`, `ipAddress`, `socialSecurityNumber`, `accountNumber`, `certificateLicenseNumber`, `vehicleId`, `deviceId`)
- Wire into patient create/read routes

`read:` `SECURITY` §4

**Done when:** `patients.fhir` JSONB column stores ciphertext; plaintext never in raw DB query results; all 18 identifiers covered

---

## T1-6 · BullMQ foundation + compliance queues `MEDIUM`

Create `backend/src/jobs/queue.ts` (Valkey connection for BullMQ).

Implement:
- `noe-deadline-check` queue — daily, flags NOEs approaching 5-day window
- `aide-supervision-check` queue — daily, flags supervisions approaching 14-day window

Worker files + server startup registration.

**Done when:** Both queues appear in BullMQ dashboard; test job enqueues and worker processes it

---

## T1-7 · HOPE + cap BullMQ queues `MEDIUM`

Add:
- `hope-submission` queue — → iQIES REST API + DLQ alert on rejection
- `hope-deadline-check` — daily
- `hqrp-period-close` — quarterly
- `cap-recalculation` — fires Nov 2 each year, alert at 80% of cap

`read:` `HOPE-DOC`
`needs:` T1-6

**Done when:** Simulated iQIES rejection fires DLQ alert; Nov 2 job enqueues cap recalc

---

## T1-8 · Socket.IO server `MEDIUM`

Create `backend/src/plugins/socket.plugin.ts` (fastify-plugin wrapping `socket.io`).

- Wire `ServerToClientEvents` / `ClientToServerEvents` from `@hospici/shared-types`
- Auth guard on connection using Better Auth session
- Emit events from BullMQ workers: `noe:deadline-warning`, `supervision:due`, `idg:due`, `break-glass`, `session:expiring`, `cap:threshold:alert`

`needs:` T1-1 (auth), T1-6 (queues), T0-3 (shared-types)

**Done when:** Frontend receives `noe:deadline-warning` when test job fires; `session:expiring` fires at 25 min idle

---

## T1-9 · Integration tests + RLS suite `MEDIUM`

Create `backend/tests/integration/setup.ts` (test DB, migrations, fixtures).

Write:
- `rls/user-isolation.test.ts` — User A cannot read User B's patients
- `rls/role-access.test.ts` — each role sees only what ABAC permits
- `rls/super-admin.test.ts` — super_admin bypass tested
- `integration/noe-deadline.test.ts` — Friday NOE edge case

**Done when:** `pnpm --filter @hospici/backend test:rls` passes — this is the **Phase 1 exit gate**

---

## T1-10 · CI/CD pipeline `LOW`

Create `.github/workflows/ci.yml`:
1. `pnpm install`
2. `pnpm -r typecheck`
3. Biome lint
4. `lint-no-compile-in-handler.mjs` (TypeBox AOT violation check)
5. Backend tests
6. Frontend contract tests

**Done when:** Pipeline passes on clean push; TypeBox compile violation fails the build

---

## T1-11 · Valkey password + pool hardening `LOW`

1. Uncomment `requirepass` in `docker/valkey/valkey.conf`. Verify `valkey.plugin.ts` reads `VALKEY_PASSWORD`.
2. In `db/client.ts` add:
   - `statement_timeout: 30000`
   - `idle_in_transaction_session_timeout: 10000`
   - Warn log when pool active connections > 15

**Done when:** Unauthenticated `redis-cli ping` to dev Valkey returns `NOAUTH`
