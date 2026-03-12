# Hospici — Session Controller

> **LOAD ORDER:** (1) Read §Progress to find next task. (2) Load `docs/tasks/tier-N.md` for that task. (3) Read only the `read:` refs listed on that task. **Never pre-load full architecture docs.**
>
> **Context budget:** MEDIUM task = 1 arch doc + task file (~40k tokens max). HIGH task = 2 arch docs + task file. Never combine MEDIUM+MEDIUM in one session.

---

## ⚡ Non-Code Actions (require lead time — start now)

| Action | Owner | Deadline |
|--------|-------|----------|
| CMS iQIES sandbox credentials | Product/Admin | **This week** (60–90 day window) |
| Healthcare compliance attorney | Product | Before Phase 2 |
| Clearinghouse contract (Availity or Change Healthcare) | Product | Before T3-7 |

---

## Stack

| Layer | Tech |
|-------|------|
| Runtime | Node ≥ 22, pnpm ≥ 9 |
| Backend | Fastify 5 · TypeBox AOT · Drizzle ORM · PostgreSQL 18 · Valkey 8 (`iovalkey`) |
| Frontend | TanStack Start (Vinxi/Vite) — **never Next.js** |
| Auth | Better Auth — httpOnly cookie session, memory-only access token |
| Jobs | BullMQ + Valkey |
| Realtime | Socket.IO |
| Shared types | `@hospici/shared-types` (workspace pkg, zero runtime deps) |
| Linter | Biome — **never** ESLint or Prettier |

> Full coding rules → `CLAUDE.md` (root) + `backend/CLAUDE.md`

---

## CMS Compliance (always active)

| Rule | Status |
|------|--------|
| NOE 5-day — `addBusinessDays()`, skips weekends + holidays, Friday edge tested | ✅ |
| IDG 15-day — hard block (no dismiss), 42 CFR §418.56. Schema logic done; route enforcement pending | 🔄 |
| HHA supervision 14-day — alert day 12, block if overdue. 42 CFR §418.76 | ⬜ |
| Hospice cap year — Nov 1–Oct 31. `getCapYear()` implemented. Nov 2 recalc job + 80% alert pending | 🔄 |
| Benefit periods — 90/90/60/60d. F2F required period 3+, within 30 prior days | ⬜ |
| HOPE windows — admission ≤7 days, discharge ≤7 days. `HOPEWindowViolationError` class exists | ✅ |
| HQRP penalty — missed iQIES deadline = 2% reduction. Track `penaltyApplied` flag | ⬜ |
| HIS — retired 2025-10-01. **Never reference HIS**. HOPE only | ✅ |
| NOTR — 5 business days from revocation. Mirrors NOE logic | ⬜ |
| Session auto-logoff — 30 min idle, `session:expiring` Socket.IO event at 25 min | ⬜ |

---

## Progress Dashboard

Legend: `⬜ TODO` · `🔄 IN PROGRESS` · `✅ DONE` · `🚫 BLOCKED`

### Tier 0 — Build Blockers _(do all before any feature work)_

| ID | Task | Status | Size |
|----|------|--------|------|
| T0-1 | Fix migration paths | ✅ | LOW |
| T0-2 | Add `fastify-plugin` dep | ✅ | LOW |
| T0-3 | Wire `@hospici/shared-types` | ✅ | LOW |
| T0-4 | Create `frontend/src/api.ts` | ✅ | LOW |
| T0-5 | Write all Drizzle table definitions | ✅ | MEDIUM |
| T0-6 | Register routes + rate limiting | ✅ | LOW |
| T0-7 | Extract logging config | ✅ | LOW |

### Tier 1 — Security Foundation _(needs: all T0 done)_

| ID | Task | Status | Size |
|----|------|--------|------|
| T1-1 | Better Auth — backend | ✅ | MEDIUM |
| T1-2 | Better Auth — frontend | ✅ | MEDIUM |
| T1-3 | Replace header-stub RLS with JWT claims | ⬜ | MEDIUM |
| T1-4 | AuditService | ⬜ | MEDIUM |
| T1-5 | PHI encryption service | ⬜ | MEDIUM |
| T1-6 | BullMQ foundation + compliance queues | ⬜ | MEDIUM |
| T1-7 | HOPE + cap BullMQ queues | ⬜ | MEDIUM |
| T1-8 | Socket.IO server | ⬜ | MEDIUM |
| T1-9 | Integration tests + RLS suite | ⬜ | MEDIUM |
| T1-10 | CI/CD pipeline | ⬜ | LOW |
| T1-11 | Valkey password + pool hardening | ⬜ | LOW |

### Tier 2 — Clinical Core _(needs: T0 + T1; run Phase 1 exit gate first)_

| ID | Task | Status | Size |
|----|------|--------|------|
| T2-1 | Patient CRUD — backend | ⬜ | MEDIUM |
| T2-2 | Patient list + detail — frontend | ⬜ | MEDIUM |
| T2-3 | Pain assessments + decline trajectory | ⬜ | MEDIUM |
| T2-4 | IDG meeting recording + enforcement | ⬜ | MEDIUM |
| T2-5 | Care plan schema + routes | ⬜ | MEDIUM |
| T2-6 | Medication management MVP | ⬜ | MEDIUM |
| T2-7 | VantageChart™ narrative generation | ⬜ | HIGH |
| T2-8 | Compliance alert dashboard | ⬜ | MEDIUM |
| T2-9 | Note review system | ⬜ | MEDIUM |

### Tier 3 — Compliance & Billing _(needs: T2 exit gate; ⚠️ T3-1/2/3/7 = market-entry blockers)_

| ID | Task | Status | Size |
|----|------|--------|------|
| T3-1 | HOPE DB migrations + live routes + Documentation Assistant | ⬜ | MEDIUM |
| T3-2 | NOE/NOTR workflow + F2F state machine | ⬜ | MEDIUM |
| T3-3 | Hospice cap calculation engine | ⬜ | MEDIUM |
| T3-4 | Benefit period automation | ⬜ | MEDIUM |
| T3-5 | Electronic signatures | ⬜ | MEDIUM |
| T3-6 | FHIR R4 Patient + Observation endpoints | ⬜ | HIGH |
| T3-7 | EDI 837i claim generation | ⬜ | HIGH |
| T3-8 | BAA registry + security hardening | ⬜ | MEDIUM |
| T3-9 | Physician order inbox | ⬜ | MEDIUM |
| T3-10 | ADR audit record export | ⬜ | MEDIUM |
| T3-11 | QAPI management | ⬜ | MEDIUM |
| T3-12 | Pre-submission claim audit (31-point) | ⬜ | MEDIUM |

### Tier 4 — Interoperability & Scale _(needs: T3 exit gates)_

| ID | Task | Status | Size |
|----|------|--------|------|
| T4-1 | SMART on FHIR 2.0 (Backend Services) | ⬜ | HIGH |
| T4-2 | FHIR R4 `$export` bulk operation | ⬜ | HIGH |
| T4-3 | eRx integration (EPCS) | ⬜ | HIGH |
| T4-4 | Direct Secure Messaging | ⬜ | HIGH |
| T4-5 | DDE/FISS Integration | ⬜ | HIGH |
| T4-6 | TypeBox AOT CI verification | ⬜ | LOW |
| T4-7 | Load testing | ⬜ | MEDIUM |
| T4-8 | Error monitoring | ⬜ | LOW |

### Tier 5 — Mobile & Offline _(deferred — start only after Phase 6 exit gate signed off)_

| ID | Task | Status | Size |
|----|------|--------|------|
| T5-1 | Mobile strategy decision (PWA vs React Native) | ⬜ | — |
| T5-2 | Offline sync scope definition | ⬜ | — |
| T5-3 | IndexedDB schema (PHI encrypted via Web Crypto) | ⬜ | — |
| T5-4 | Mutation queue (buffer offline, drain on reconnect) | ⬜ | — |
| T5-5 | Conflict resolution (version vectors, no LWW) | ⬜ | — |
| T5-6 | `clearOfflineData()` on logout | ⬜ | — |
| T5-7 | EVV (GPS visit verification) | ⬜ | — |
| T5-8 | On-device signature capture | ⬜ | — |
| T5-9 | Visit GPS snapshot audit trail | ⬜ | — |

---

## Doc Index

> Load only the doc referenced in the task's `read:` field.

| Ref | Path |
|-----|------|
| `BE-SPEC` | `docs/architecture/backend-specification.md` |
| `DB-ARCH` | `docs/architecture/database-architecture.md` |
| `DRIZZLE` | `docs/architecture/drizzle-orm-reference.md` |
| `FE-CONTRACT` | `docs/architecture/frontend-contract.md` |
| `SECURITY` | `docs/architecture/security-model.md` |
| `DESIGN` | `docs/design-system.md` |
| `ENV-SETUP` | `docs/development/environment-setup.md` |
| `RUNBOOK` | `docs/operations/runbook.md` |
| `HOPE-DOC` | `docs/compliance/hope-reporting.md` |
| `VANTAGE` | `docs/VANTAGECHART_TECHNICAL_SPEC.md` |
| `DESIGN-PROMPT` | `docs/design/DESIGN_PROMPT.md` |

---

## Key Files

| Purpose | Path |
|---------|------|
| Validator registry (AOT) | `backend/src/config/typebox-compiler.ts` |
| DB schema index | `backend/src/db/schema/index.ts` |
| Server entry | `backend/src/server.ts` |
| RLS middleware | `backend/src/middleware/rls.middleware.ts` |
| BullMQ queues | `backend/src/jobs/` |
| Audit service | `backend/src/contexts/identity/services/audit.service.ts` |
| PHI encryption | `backend/src/shared-kernel/services/phi-encryption.service.ts` |
| Migrations | `backend/database/migrations/drizzle/` |
| Business-days util | `backend/src/utils/business-days.ts` |
| HOPE schemas/routes | `backend/src/contexts/analytics/` |
| Frontend server fns | `frontend/src/**/*.functions.ts` |
| Contract tests | `frontend/tests/contract/` |
| Shared types entry | `packages/shared-types/src/index.ts` |

---

## Session Log

> Keep last 10 entries. Archive older to `docs/session-archive.md`.

| Date | Task(s) | Outcome | Next |
|------|---------|---------|------|
| 2026-03-11 | Scaffolding | CLAUDE.md (root + backend), MASTER_PROMPT.md, memory files | T0-1 |
| 2026-03-11 | HOPE schemas | `hope.schema.ts`, `hopeQualityMeasures.schema.ts`, `hope.service.ts`, `hope.routes.ts`, `hope-reporting.md`. +9 validators in `typebox-compiler.ts` | T3-1 |
| 2026-03-11 | Gaps audit | 47-gap audit. Added: T2-6, T3-8, NOTR→T3-2, extra pain scales→T2-3, iQIES reg as immediate action | T0-1..T0-7 |
| 2026-03-11 | Firenote analysis (r1) | Added T2-7..T2-9, T3-9..T3-12. `care_model` enum, No-Prep IDG, unified care plan, SMART goals | T0-1..T0-7 |
| 2026-03-11 | Firenote analysis (r2) | VantageChart arch: Layer 1 deterministic + Layer 2 optional LLM. Decline trajectory, voice input, HOPE completeness ring, quality benchmarks, Product Strategy | T0-1..T0-7 |
| 2026-03-12 | T0-1..T0-7 | All build blockers done. Migration paths fixed; 9 Drizzle tables; logging.config.ts; rate-limit + 5 routes registered; shared-types wired. | — |
| 2026-03-12 | Schema fixes + tests | Zero TS errors: `type Static` imports, ABAC deny policy, valkey password spread, HOPE response schemas, `HOPEReportingPeriodSchema` added, dotenv installed. Fixed business-days UTC bug — 9/9 tests passing. | T1-1 |
| 2026-03-12 | T1-1 Better Auth backend | `auth.config.ts` (drizzleAdapter + twoFactor plugin + 30min session + httpOnly cookie). `auth.routes.ts` (Web API Request bridge pattern). `auth-tables.ts` (sessions/accounts/verifications/twoFactors). `users.table.ts` extended (name/image/isActive/twoFactorEnabled). Migration 0002. 0 TS errors, 9/9 tests. | T1-2 |
| 2026-03-12 | T1-2 Better Auth frontend | `auth.server.ts` (createAuthClient + HospiciSession type + parseHospiciSession). `validators/auth.validators.ts` (TypeBox AOT for login + break-glass). `auth.functions.ts` (loginFn/logoutFn/getCurrentSessionFn/breakGlassFn — real BA calls, Set-Cookie forwarding via vinxi/http). `auth.middleware.ts` (real session cookie validation). `rls.middleware.ts` (null session guard). `server.ts` (register authRoutes, fixing T1-1 gap). 18 pre-existing FE TS errors unchanged, 9/9 backend tests. | T1-3 |

---

_Task specs → `docs/tasks/tier-0.md` through `docs/tasks/tier-5.md`_
_Product strategy + pricing → `docs/PRODUCT_STRATEGY.md`_
