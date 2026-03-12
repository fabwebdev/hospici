# Tier 0 — Build Blockers

> The backend cannot start and the frontend cannot build until all of these are done.
> All T0 tasks are LOW/MEDIUM — do them all before any feature work.

---

## T0-1 · Fix migration paths `LOW`

`backend/src/db/migrate.ts` and `backend/scripts/next-migration-number.ts` both resolve to `backend/drizzle/migrations` (wrong path). Correct path: `backend/database/migrations/drizzle/`. Also verify `drizzle.config.ts` uses the same path.

**Done when:** `pnpm --filter @hospici/backend db:next-migration-number` prints `0001`

---

## T0-2 · Add `fastify-plugin` dependency `LOW`

`pnpm --filter @hospici/backend add fastify-plugin`

Required by `valkey.plugin.ts` — backend crashes at import without it.

**Done when:** `pnpm --filter @hospici/backend build` succeeds

---

## T0-3 · Wire `@hospici/shared-types` `LOW`

1. Create `packages/shared-types/src/index.ts` re-exporting from `./socket`
2. Add `"@hospici/shared-types": "workspace:*"` to both `backend/package.json` and `frontend/package.json`
3. Add `tsc` build script to `packages/shared-types/package.json`
4. `pnpm install`

**Done when:** `import type { ServerToClientEvents } from "@hospici/shared-types"` compiles in both consumers

---

## T0-4 · Create `frontend/src/api.ts` `LOW`

`app.config.ts` declares `apiEntry: './src/api.ts'` — file is missing. Frontend dev server fails on start.

`read:` `FE-CONTRACT`

**Done when:** `pnpm --filter @hospici/frontend dev` starts without module-not-found error

---

## T0-5 · Write Drizzle table definitions `MEDIUM`

`backend/src/db/schema/index.ts` is empty (all exports commented out). Write `*.table.ts` files for all 9 tables in `0000_baseline.sql`:

| Table | Notes |
|-------|-------|
| `locations` | — |
| `users` | — |
| `audit_logs` | partitioned; append-only (no UPDATE/DELETE policies ever) |
| `patients` | + `care_model` enum (see below) |
| `pain_assessments` | — |
| `notice_of_election` | — |
| `benefit_periods` | — |
| `idg_meetings` | — |
| `aide_supervisions` | — |

**CareLines amendment:** Add `care_model` column to `patients`:
```typescript
pgEnum('care_model', ['HOSPICE', 'PALLIATIVE', 'CCM']), default 'HOSPICE'
```
Enables multi-service architecture (one patient, one chart across care models). Omitting this now = breaking migration later.

Re-export all tables from `schema/index.ts`.

`read:` `DRIZZLE`, `DB-ARCH`

**Done when:** `db.select().from(patients)` type-checks; every table has `location_id`; `care_model` column present with correct enum

---

## T0-6 · Register all routes + rate limiting `LOW`

Uncomment all route registrations in `server.ts` (lines 131–136):
`identityRoutes`, `patientRoutes`, `billingRoutes`, `schedulingRoutes`, `hopeRoutes`

Register `@fastify/rate-limit` (in deps, never registered):
- Global: 100 req/min
- `/auth/*`: 10 req/min

**Done when:** `GET /api/v1/health` and `GET /api/v1/hope` both respond (even 501)

---

## T0-7 · Extract logging config `LOW`

`backend/src/config/logging.config.ts` is referenced but does not exist. Extract the Pino redact config from `server.ts` into this file.

All 10 PHI fields must be in the redact paths array:
`firstName`, `lastName`, `dob`, `ssn`, `medicareId`, `address`, `phone`, `email`, `emergencyContact`, `insuranceId`

**Done when:** `server.ts` imports from `logging.config.ts`; file contains the full redact array
