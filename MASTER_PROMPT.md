# Hospici — Session Controller

> **LOAD ORDER:** (1) Read §Progress to find next task. (2) Load `docs/tasks/tier-N.md` for that task. (3) Read only the `read:` refs listed on that task. **Never pre-load full architecture docs.**
>
> **Context budget:** MEDIUM task = 1 arch doc + task file (~40k tokens max). HIGH task = 2 arch docs + task file. Never combine MEDIUM+MEDIUM in one session.

---

## ⚡ Non-Code Actions (require lead time — start now)

| Action                                                 | Owner         | Deadline                                |
| ------------------------------------------------------ | ------------- | --------------------------------------- |
| CMS iQIES sandbox credentials                          | Product/Admin | **This week** (60–90 day window) |
| Healthcare compliance attorney                         | Product       | Before Phase 2                          |
| Clearinghouse contract (Availity or Change Healthcare) | Product       | Before T3-7b                            |

---

## Stack

| Layer        | Tech                                                                                |
| ------------ | ----------------------------------------------------------------------------------- |
| Runtime      | Node ≥ 22, pnpm ≥ 9                                                               |
| Backend      | Fastify 5 · TypeBox AOT · Drizzle ORM · PostgreSQL 18 · Valkey 8 (`iovalkey`) |
| Frontend     | TanStack Start (Vinxi/Vite) —**never Next.js**                               |
| Auth         | Better Auth — httpOnly cookie session, memory-only access token                    |
| Jobs         | BullMQ + Valkey                                                                     |
| Realtime     | Socket.IO                                                                           |
| Shared types | `@hospici/shared-types` (workspace pkg, zero runtime deps)                        |
| Linter       | Biome —**never** ESLint or Prettier                                          |

> Full coding rules → `CLAUDE.md` (root) + `backend/CLAUDE.md`

---

## CMS Compliance (always active)

| Rule                                                                                                 | Status |
| ---------------------------------------------------------------------------------------------------- | ------ |
| NOE 5-day —`addBusinessDays()`, skips weekends + holidays, Friday edge tested                     | ✅     |
| IDG 15-day — hard block (no dismiss), 42 CFR §418.56. Implemented T2-4: enforcement on `updateCarePlanFn`, frontend modal, no dismiss | ✅     |
| HHA supervision 14-day — alert day 12 (`AIDE_SUPERVISION_UPCOMING`), block if overdue (`AIDE_SUPERVISION_OVERDUE`). 42 CFR §418.76 | ⬜ |
| Hospice cap year — Nov 1–Oct 31. `getCapYear()` implemented. T3-3 expanded: `cap_snapshots` + `cap_patient_contributions` tables, 5 routes, 7-section dashboard, 4 alert thresholds (70/80/90/projected), branch benchmarking, audit trail | ✅     |
| Benefit periods — 90d/90d/60d/60d/60d… period engine. F2F required period 3+, within 30 **calendar days before** recert date (42 CFR §418.22). Transfer-aware (H→H inherits period number). Downstream recalculation with preview + audit trail. billingRisk flag feeds T3-12 (T3-7a wired) | ✅     |
| HOPE windows — admission ≤7 days, discharge ≤7 days. Full T3-1a: CRUD, two-tier validation, iQIES BullMQ pipeline, payloadHash, DLQ, Socket.IO events, completeness ring | ✅     |
| HQRP penalty — missed iQIES deadline = 2% reduction. Track `penaltyApplied` flag                  | ⬜     |
| HIS — retired 2025-10-01.**Never reference HIS**. HOPE only                                   | ✅     |
| NOTR — 5 business days from revocation. Mirrors NOE logic. Implemented T3-2a: full NOTR state machine, deadline, auto-create on revocation | ✅     |
| Session auto-logoff — 30 min idle,`session:expiring` Socket.IO event at 25 min                    | ⬜     |

---

## Progress Dashboard

Legend: `⬜ TODO` · `🔄 IN PROGRESS` · `✅ DONE` · `🚫 BLOCKED`

### Tier 0 — Build Blockers _(do all before any feature work)_

| ID   | Task                                | Status | Size   |
| ---- | ----------------------------------- | ------ | ------ |
| T0-1 | Fix migration paths                 | ✅     | LOW    |
| T0-2 | Add `fastify-plugin` dep          | ✅     | LOW    |
| T0-3 | Wire `@hospici/shared-types`      | ✅     | LOW    |
| T0-4 | Create `frontend/src/api.ts`      | ✅     | LOW    |
| T0-5 | Write all Drizzle table definitions | ✅     | MEDIUM |
| T0-6 | Register routes + rate limiting     | ✅     | LOW    |
| T0-7 | Extract logging config              | ✅     | LOW    |

### Tier 1 — Security Foundation _(needs: all T0 done)_

| ID    | Task                                    | Status | Size   |
| ----- | --------------------------------------- | ------ | ------ |
| T1-1  | Better Auth — backend                  | ✅     | MEDIUM |
| T1-2  | Better Auth — frontend                 | ✅     | MEDIUM |
| T1-3  | Replace header-stub RLS with JWT claims | ✅     | MEDIUM |
| T1-4  | AuditService                            | ✅     | MEDIUM |
| T1-5  | PHI encryption service                  | ✅     | MEDIUM |
| T1-6  | BullMQ foundation + compliance queues   | ✅     | MEDIUM |
| T1-7  | HOPE + cap BullMQ queues                | ✅     | MEDIUM |
| T1-8  | Socket.IO server                        | ✅     | MEDIUM |
| T1-9  | Integration tests + RLS suite           | ✅     | MEDIUM |
| T1-10 | CI/CD pipeline                          | ✅     | LOW    |
| T1-11 | Valkey password + pool hardening        | ✅     | LOW    |

### Tier 2 — Clinical Core _(needs: T0 + T1; run Phase 1 exit gate first)_

| ID   | Task                                  | Status | Size   |
| ---- | ------------------------------------- | ------ | ------ |
| T2-1 | Patient CRUD — backend               | ✅     | MEDIUM |
| T2-2 | Patient list + detail — frontend     | ✅     | MEDIUM |
| T2-3 | Pain assessments + decline trajectory | ✅     | MEDIUM |
| T2-4 | IDG meeting recording + enforcement   | ✅     | MEDIUM |
| T2-5 | Care plan schema + routes             | ✅     | MEDIUM |
| T2-6 | Medication management                 | ✅     | MEDIUM |
| T2-7 | VantageChart™ narrative generation   | ✅     | HIGH   |
| T2-8 | Compliance alert dashboard            | ✅     | MEDIUM |
| T2-9 | Note review system                    | ✅     | MEDIUM |
| T2-10 | Visit scheduling + frequency tracking | ✅     | MEDIUM |

### Tier 3 — Compliance & Billing _(needs: T2 exit gate; ⚠️ T3-1a/1b/2/3/7a = market-entry blockers)_

| ID    | Task                                                       | Status | Size   |
| ----- | ---------------------------------------------------------- | ------ | ------ |
| T3-1a | HOPE Infrastructure + Validation Engine                    | ✅     | HIGH   |
| T3-1b | HOPE Operations Hub (dashboard, timeline, workbench)        | ✅     | MEDIUM |
| T3-2a | NOE/NOTR Filing Workbench (state machine, deadline, correction, audit trail) | ✅ | HIGH |
| T3-2b | F2F Validity Engine + Physician Routing (benefit-period-aware, tasks, deep links) | ✅ | MEDIUM |
| T3-3  | Hospice cap intelligence module (forecasting, drilldown, branch benchmarking, audit trail) | ✅     | HIGH   |
| T3-4  | Benefit Period Control System (period engine, recert timeline, transfer-aware recalculation, reporting flag, error correction, BullMQ + alerts, manager UI) | ✅     | HIGH   |
| T3-5  | Electronic signatures                                      | ✅     | HIGH   |
| T3-6  | FHIR R4 Patient + Observation endpoints                    | ✅     | HIGH   |
| T3-7a | Hospice Claim Lifecycle + 837i Generation (state machine, readiness gating, holds, correction/void, workbench routes) | ✅ | HIGH |
| T3-7b | ERA 835 + Remittance Reconciliation + Denial Management (ingest, auto-match, auto-post, exception queue) | ✅ | HIGH |
| T3-8  | Vendor Governance + BAA Registry + Security Hardening      | ⬜     | HIGH   |
| T3-9  | Physician order inbox                                      | ⬜     | MEDIUM |
| T3-10 | ADR / TPE / Survey Record Packet Export — async lifecycle (REQUESTED→GENERATING→READY→EXPORTED), section-selective assembly, merged PDF + ZIP packaging, per-file manifest with SHA-256 hashes, export history, time-limited signed download URLs; optional T3-13 completeness summary on cover sheet | ⬜ | HIGH |
| T3-11 | QAPI management + clinician quality scorecards (8 metrics: first-pass rate, avg revisions, median turnaround, overdue rate, billing/compliance impact, deficiency mix, 12-week trend) + branch × discipline deficiency trend reporting (comparison tables, heatmap, outlier detection) + QAPI event/action-item lifecycle with immutable closure + "raise QAPI event from trend" CTA | ⬜ | HIGH |
| T3-12 | Claim Audit Rules Engine (12 rule groups, BLOCK/WARN, audit snapshots, bill-hold policy engine) + billing alert dashboard | ✅ | HIGH |
| T3-13 | Chart audit mode — discipline-specific review checklists, survey-readiness packet completeness, missing-document indicators, bulk QA actions, saved filter views (DB-persisted) | ⬜ | MEDIUM |

### Tier 4 — Interoperability & Scale _(needs: T3 exit gates)_

| ID   | Task                                 | Status | Size   |
| ---- | ------------------------------------ | ------ | ------ |
| T4-1 | SMART on FHIR 2.0 (Backend Services) | ⬜     | HIGH   |
| T4-2 | FHIR R4 `$export` bulk operation   | ⬜     | HIGH   |
| T4-3 | eRx integration (EPCS)               | ⬜     | HIGH   |
| T4-4 | Direct Secure Messaging              | ⬜     | HIGH   |
| T4-5 | DDE/FISS Integration                 | ⬜     | HIGH   |
| T4-6 | TypeBox AOT CI verification          | ⬜     | LOW    |
| T4-7 | Load testing                         | ⬜     | MEDIUM |
| T4-8 | Error monitoring                     | ⬜     | LOW    |
| T4-9 | Predictive analytics (RAPID_DECLINE_RISK, REVOCATION_RISK, length-of-stay variance) | ⬜ | HIGH |

### Tier 5 — Mobile & Offline _(deferred — start only after Phase 6 exit gate signed off)_

| ID   | Task                                                | Status | Size |
| ---- | --------------------------------------------------- | ------ | ---- |
| T5-1 | Mobile strategy decision (PWA vs React Native)      | ⬜     | —   |
| T5-2 | Offline sync scope definition                       | ⬜     | —   |
| T5-3 | IndexedDB schema (PHI encrypted via Web Crypto)     | ⬜     | —   |
| T5-4 | Mutation queue (buffer offline, drain on reconnect) | ⬜     | —   |
| T5-5 | Conflict resolution (version vectors, no LWW)       | ⬜     | —   |
| T5-6 | `clearOfflineData()` on logout                    | ⬜     | —   |
| T5-7 | EVV (GPS visit verification)                        | ⬜     | —   |
| T5-8 | On-device signature capture                         | ⬜     | —   |
| T5-9 | Visit GPS snapshot audit trail                      | ⬜     | —   |

---

## Doc Index

> Load only the doc referenced in the task's `read:` field.

| Ref               | Path                                           |
| ----------------- | ---------------------------------------------- |
| `BE-SPEC`       | `docs/architecture/backend-specification.md` |
| `DB-ARCH`       | `docs/architecture/database-architecture.md` |
| `DRIZZLE`       | `docs/architecture/drizzle-orm-reference.md` |
| `FE-CONTRACT`   | `docs/architecture/frontend-contract.md`     |
| `SECURITY`      | `docs/architecture/security-model.md`        |
| `DESIGN`        | `docs/design-system.md`                      |
| `ENV-SETUP`     | `docs/development/environment-setup.md`      |
| `RUNBOOK`       | `docs/operations/runbook.md`                 |
| `HOPE-DOC`      | `docs/compliance/hope-reporting.md`          |
| `VANTAGE`       | `docs/VANTAGECHART_TECHNICAL_SPEC.md`        |
| `DESIGN-PROMPT` | `docs/design/DESIGN_PROMPT.md`               |

---

## Key Files

| Purpose                  | Path                                                             |
| ------------------------ | ---------------------------------------------------------------- |
| Validator registry (AOT) | `backend/src/config/typebox-compiler.ts`                       |
| DB schema index          | `backend/src/db/schema/index.ts`                               |
| Server entry             | `backend/src/server.ts`                                        |
| RLS middleware           | `backend/src/middleware/rls.middleware.ts`                     |
| BullMQ queues            | `backend/src/jobs/`                                            |
| Audit service            | `backend/src/contexts/identity/services/audit.service.ts`      |
| PHI encryption           | `backend/src/shared-kernel/services/phi-encryption.service.ts` |
| Migrations               | `backend/database/migrations/drizzle/`                         |
| Business-days util       | `backend/src/utils/business-days.ts`                           |
| HOPE schemas/routes      | `backend/src/contexts/analytics/`                              |
| Frontend server fns      | `frontend/src/**/*.functions.ts`                               |
| Contract tests           | `frontend/tests/contract/`                                     |
| Shared types entry       | `packages/shared-types/src/index.ts`                           |

---

## Session Log

> Keep last 10 entries. Archive older to `docs/session-archive.md`.

| Date       | Task(s)                                    | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Next                                                                                                                                                                                                                                          |
| ---------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-03-12 | T3-2a NOE/NOTR Filing Workbench | Migration 0017: `notice_filing_status` 9-value enum + `notices_of_election` (replaces `notice_of_election`) + `notices_of_termination_revocation` + RLS + `NOE_LATE`/`NOTR_LATE` alert types. `noe.table.ts` (REPLACED) + `notr.table.ts` (NEW). `noe.schema.ts`: 14 TypeBox schemas (`RevocationReason`, `CreateNOEBodySchema`, `NOEResponseSchema`, `NOEWithHistoryResponseSchema`, `CMSResponseBodySchema`, `CorrectNOEBodySchema`, `LateOverrideBodySchema`, `ReadinessResponseSchema`, etc.). `NOEService`: 18 methods, `VALID_TRANSITIONS` map, `correctNOE`/`correctNOTR`/`autoCreateNOTROnRevocation` db.transaction(), `lateOverride` supervisor/admin gate, AuditService.log on every mutation. `noe.routes.ts`: `noePatientRoutes` (patient-scoped) + `noeStandaloneRoutes` (submit/cms/correct/late-override/readiness/history + queue). `noe-deadline.worker.ts` enhanced: queries both NOE + NOTR tables, emits warnings/late events, upserts `NOE_LATE`/`NOTR_LATE` alerts. 12 new validators in typebox-compiler. `shared-types/noe.ts`: `NoticeFilingStatus`, `TERMINAL_FILING_STATUSES`, `CLAIM_BLOCKING_STATUSES`, all response/input types. `socket.ts`: 7 new NOE/NOTR events. `noe.functions.ts`: 14 internal handlers + 15 `createServerFn` wrappers. `filings/index.tsx`: 2-tab workbench (NOE/NOTR), 9-state status badges, business-days pill, CorrectionModal, LateOverrideModal, ReadinessDrawer, HistoryDrawer, useQuery typed via `queryFn` annotation. routeTree.gen.ts updated. Nav: Filings link. 23 contract tests. 0 TS errors, 172/172 frontend tests. | T3-2b |
| 2026-03-12 | T3-2b F2F Validity Engine + Physician Routing | Migration 0018: `F2F_MISSING`/`F2F_INVALID` alert enum values + `order_status_enum` + `order_type_enum` + `provider_role_enum` + `encounter_setting_enum` + `orders` table (RLS, minimal T3-9 bootstrap) + `face_to_face_encounters` table (RLS, 3 indexes). Drizzle: `orders.table.ts` + `face-to-face-encounters.table.ts`. New bounded context `contexts/f2f/`: `f2f.schema.ts` (7 TypeBox schemas), `f2fValidity.service.ts` (CMS 42 CFR §418.22 engine — period ≥3 check, 30-day calendar window, provider role, non-empty findings, period status; writes back `isValidForRecert` + `validatedAt` + `invalidationReason`; upserts `F2F_INVALID` or resolves alerts), `f2fTask.service.ts` (db.transaction — creates `F2F_DOCUMENTATION` order + draft encounter stub; emits `order:f2f:required` via Valkey publish), `f2f.routes.ts` (5 routes: POST/GET patient F2F, PATCH/POST-validate standalone, GET supervisor queue). BullMQ `f2f-deadline-check.worker.ts`: daily 07:30 UTC — Day 10 creates physician task, Day 5 `F2F_MISSING` warning alert, Day 0 critical alert + `f2f:overdue` Socket.IO emit. 6 new validators in typebox-compiler. `shared-types/f2f.ts` (9 types). `socket.ts`: `f2f:overdue` + `order:f2f:required` events. `alerts.ts`: `F2F_MISSING`/`F2F_INVALID` to `AlertType`. Frontend: `f2f.functions.ts` (5 `createServerFn` wrappers), `$patientId/f2f/new.tsx` (F2F form with periodId search param, live validity preview, submit blocked if invalid), `filings/f2f-queue.tsx` (supervisor queue — status badges, days-remaining urgency pill, "Document F2F" CTA), `F2FPanel` added to `$patientId.tsx` (period-aware badge + "Document F2F" deep link). routeTree.gen.ts updated. 0 TS errors on both backend and frontend. | T3-3 |
| 2026-03-12 | T3-3 Hospice Cap Intelligence Module | Migration 0019: `CAP_THRESHOLD_70/80/90`/`CAP_PROJECTED_OVERAGE` added to `alert_type_enum`; `cap_snapshots` table (utilizationPercent numeric 6,3, projectedYearEndPercent, estimatedLiability, formulaVersion, inputHash SHA-256, triggeredBy/triggeredByUserId) + `cap_patient_contributions` table (snapshotId FK cascade, patientId, locationId denorm for RLS, capContributionAmount, routineDays/continuousHomeCareDays/inpatientDays, liveDischargeFlag, admissionDate/dischargeDate) + 4 RLS policies + 5 indexes. Drizzle: `cap-snapshots.table.ts` + `cap-patient-contributions.table.ts`. `contexts/billing/schemas/capIntelligence.schema.ts`: 10 TypeBox schemas (CapSummaryResponse, CapPatientListResponse, CapTrendResponse, CapSnapshotResponse, RecalculateCapResponse + query schemas). `CapCalculationService`: 10-step CMS 42 CFR §418.309 formula (patient-day tally → aggregate cap → per-patient contribution → snapshot + contributions insert in db.transaction()), `getCapSummary()`/`getPatientContributors()`/`getCapTrends()`/`getSnapshotById()`/`getAllLocations()`, Valkey TTL-300 cache, SHA-256 inputHash, 4-tier threshold alert upsert (≥70%/≥80%/≥90%/projected≥100%), `cap:calculation:complete` + `cap:threshold:alert` Socket.IO events. 5 routes: POST /recalculate (202+jobId), GET /summary, GET /patients, GET /trends, GET /snapshots/:id. `cap-recalculation.worker.ts` fully replaced (real implementation, iterates all locations, concurrency:1, accepts optional `locationId`/`capYear` from job data). Socket.IO bridge: `cap:calculation:complete` added to socket.plugin.ts. `shared-types/cap.ts`: 10 exported interfaces. `shared-types/socket.ts`: `cap:threshold:alert` payload updated (projectedYearEndPercent + threshold); `cap:calculation:complete` added. `alerts.ts`: 4 new AlertType constants. 5 validators in typebox-compiler. `cap.functions.ts` (5 createServerFn wrappers). `_authed/cap/index.tsx`: 7-panel dashboard (SVG gauge, projected bar chart, Top 25 Contributors table with 4 CTA types, Trend by Month, By Branch with TrendArrow, High-Risk Patients, Recalculation History + snapshot compare drawer), SummaryWidgets row, prior-year toggle, useMutation recalculate button, cap:calculation:complete DOM event listener. routeTree.gen.ts + nav updated. 7 schema unit tests. 5 contract tests. 289/289 backend. 0 TS errors both packages. | T3-4 |
| 2026-03-12 | T3-7/T3-12 scope expansion (planning) | Codex competitor research (Axxess/WellSky/FireNote) reviewed — see `docs/qa/EDI_837I_COMPETITIVE_ANALYSIS.md`. T3-7 replaced by T3-7a + T3-7b (same split pattern as T3-1a/1b, T3-2a/2b). T3-7a (HIGH): full claim state machine (12 states DRAFT→VOIDED), readiness engine (7 clinical prereq checks tied to T3-2a/T3-4/T2-10/T3-5), 837i generation for original/replacement/void, payloadHash + x12Hash, BullMQ submission + DLQ, manual bill holds, full workbench routes including bulk submit/hold/replace/void. T3-7b (HIGH): ERA 835 ingestion, ICN-based auto-matching, auto-post to PAID, unmatched-remittance exception queue, daily reconciliation scan. T3-12 upgraded MEDIUM → HIGH: 12-group rule catalog (expanded from 10), AuditFailure type with sourceObject/sourceField/remediationCTA, claim_audit_snapshots table (one per revision), bill-hold policy engine with hold reason taxonomy, aging dashboard by rule group + remediation owner lane. Key architectural decision: T3-7a owns claim lifecycle + X12 emission; T3-12 owns the rules catalog T3-7a calls into — clean boundary prevents "generate here, audit elsewhere" split. | T3-2b → T3-3 → T3-4 |
| 2026-03-12 | T3-12 scope expansion (planning) | Second Codex competitor research pass (Axxess/WellSky/FireNote) — see `docs/qa/CLAIM_AUDIT_RULES_ENGINE_COMPETITIVE_ANALYSIS.md`. Conclusion: current T3-12 direction is correct and more explicit than any competitor public material. Four targeted upgrades to `docs/tasks/tier-3.md`: (1) Rule groups renamed to billing-domain keys: ELECTION_AND_NOE, BENEFIT_PERIOD_AND_RECERT, F2F_AND_CERTIFICATION, SIGNED_ORDERS_AND_PLAN_OF_CARE, VISIT_COMPLETENESS, DISCHARGE_AND_NOTR, CLAIM_LINE_AND_REVENUE_CODE, LEVEL_OF_CARE_AND_CONTINUOUS_CARE, PAYER_AND_TIMELY_FILING, DUPLICATE_AND_SEQUENTIAL_BILLING, CAP_AND_COMPLIANCE_RISK, REMITTANCE_OR_DENIAL_FOLLOW_UP. (2) AuditFailure type: `rule` → `ruleCode`, added `claimBlocking: boolean` and `sourceObjectId?: string`, expanded `ownerRole` to 5 values (billing/supervisor/clinician/physician/admin). (3) claim_audit_snapshots: added `overrideTrail` JSONB + `blockCount`/`warnCount` cached columns + RLS. (4) Dashboard expanded 3→7 sections: claim status summary tiles, aging by rule group, aging by hold reason, aging by branch, owner lane queue, top denial drivers (T3-7b stub returns [] + availableAfter flag), warn override volume 30-day trend. (5) 4 Socket.IO events added: billing:audit:failed, billing:hold:placed, billing:hold:released, billing:override:approved. (6) Bulk hold/release routes added (atomic, billing manager role). Deferred: payer-specific rule configuration. T3-7a/T3-12 boundary unchanged. | T3-3 |
| 2026-03-12 | T3-4 Benefit Period Control System | Migration 0020: 4 new enums (benefit_period_status/recert_status/f2f_status/admission_type) + extended `benefit_periods` table (20+ columns: recert tracking, F2F status, billingRisk, NOE linkage, correctionHistory JSONB, concurrent care, revocation) + partial unique index (isReportingPeriod) + 4 indexes + full RLS + 5 new alert_type_enum values (RECERT_DUE/AT_RISK/PAST_DUE, F2F_DUE_SOON, BENEFIT_PERIOD_BILLING_RISK). `benefit-periods.table.ts` full rewrite with pgEnums. `BenefitPeriodService`: initializePeriods (90/90/60d engine, H→H transfer-aware), recalculateFromPeriod (Valkey preview token TTL-300), commitRecalculation, deriveStatuses (status machine + billingRisk + f2fStatus derivation), setReportingPeriod, completeRecertification, revokeElection, previewCorrection/commitCorrection, listPeriods, getPatientTimeline, getPeriod. 8 routes. `benefit-period-check.worker.ts` (daily 07:00 UTC, all locations, alert upserts, benefit:period:status:changed + recert_task + f2f_task Socket.IO). Queue + schedule added. 10 validators in typebox-compiler. `shared-types/benefit-period.ts` (7 types) + 3 socket events (status:changed, recert_task, f2f_task). Frontend: `benefit-periods/index.tsx` (3-tab manager), `compliance/recert-queue.tsx`, `BenefitPeriodTimeline.tsx`, `PeriodDetailDrawer.tsx`, `RecalculationPreviewModal.tsx`, `BenefitPeriodRiskWidget.tsx`. 0 TS errors. | T3-5 |
| 2026-03-12 | T3-5 Electronic Signatures | Migration 0021: `signature_requests` table (documentType enum 7 values, status 10-state enum, contentHash SHA-256, requireCountersign/patientSignature/signatureTime/allowGrouping flags, deliveryMethod, exceptionType, JSONB metadata) + `electronic_signatures` table (signerType enum 5 values, attestationText/accepted, documentedSignedAt/signedAt, ipAddress/userAgent, signatureHash, contentHashAtSign, representativeRelationship/patientUnableReason, countersignsSignatureId FK) + `signature_events` append-only audit table. All RLS + 5 indexes. `SignatureService` (createRequest/sendForSignature/markViewed/signDocument/countersignDocument/rejectSignature/voidSignature/markNoSignatureRequired/verifySignature/listSignatures/getOutstandingSignatures) — full 10-state transition machine (DRAFT→READY→SENT→VIEWED→PARTIALLY_SIGNED→SIGNED, with REJECTED/VOIDED/NO_SIGNATURE_REQUIRED/EXPIRED terminals). Signature hash computed on content+signer+timestamp. 12 routes (POST signatures, GET signatures/list/outstanding/:id, POST :id/send/viewed/sign/countersign/reject/void/exception, GET verify/:id). 8 validators in typebox-compiler. `shared-types/signatures.ts` (enums + 16 types). Frontend: `signatures/index.tsx` workbench (5 tabs), `SignatureCard` (status badges, days outstanding), `SignatureDetailDrawer`. 0 TS errors. | T3-6 |
| 2026-03-12 | T3-7a Hospice Claim Lifecycle + 837i Generation | Migration 0022: `claim_state` enum (12 states DRAFT→VOIDED), `claim_bill_type` enum (original/replacement/void), `bill_hold_reason` enum (6 values). Tables: `claims` (patientId/locationId/payerId/benefitPeriodId/billType/statementDates/totalCharge/state/isOnHold/correctedFromId/claimLines JSONB/payloadHash/x12Hash/clearinghouseIcn), `claim_revisions` (append-only per transition: fromState/toState/reason/snapshot JSONB), `claim_submissions` (batchId/responseCode/responseMessage/jobId/attemptNumber), `claim_rejections` (loopId/segmentId/errorCode/errorDescription/fieldPosition), `bill_holds` (reason/holdNote/placedBy/releasedBy/releasedAt + partial unique index for one active hold per claim). Full RLS on all 5 tables. `ClaimReadinessService`: 7-check engine (BENEFIT_PERIOD_BILLING_RISK, NOE_CLAIM_BLOCKING, VISIT_FREQUENCY_INCOMPLETE stub, UNSIGNED_ORDERS stub, F2F_NOT_DOCUMENTED, HARD_BLOCK_ALERT stub, ON_MANUAL_HOLD) — queries benefitPeriods.billingRisk + f2fStatus, noticesOfElection.isClaimBlocking. `X12Service.generate()`: full ANSI X12 837I generator with ISA/GS/ST/BHT envelope, loops 1000A/1000B/2000A (hospice taxonomy 251G00000X)/2000B, loop 2300 (CLM05 composite 8B:B:freq, DTP*434, REF*F8 for replacement/void), loop 2400 service lines (LX/SV2/DTP*472), SE segment count. payloadHash = SHA-256(JSON.stringify(input)), x12Hash = SHA-256(x12). `ClaimService`: state machine (12 states, validated transition map), createClaim/getClaim/listClaims/transitionState/holdClaim/unholdClaim/generateAndAttachX12/queueSubmission/replaceClaim/voidClaim/retryRejectedClaim. 5 custom errors. Module-level Socket.IO emitter. `claim-submission.worker.ts`: BullMQ worker (concurrency 5, limiter 10/s), clearinghouse stub + DLQ → REJECTED handler, `claim:state:changed` + `claim:submission:failed` events. 11 routes: POST /claims, GET /claims, GET /claims/:id (with readiness), POST /claims/:id/audit (stub T3-12), POST /claims/submit (bulk), POST /claims/:id/hold, POST /claims/:id/unhold, POST /claims/:id/replace, POST /claims/:id/void, POST /claims/:id/retry, GET /claims/:id/download (837i text/plain). 14 validators in typebox-compiler. `shared-types/billing/claim.ts` (20 types + 4 constants). `CLAIM_SUBMISSION` + `CLAIM_SUBMISSION_DLQ` queues added to queue.ts. Routes registered in server.ts. 0 TS errors. | T3-7b |
| 2026-03-12 | T3-6 FHIR R4 Patient + Observation | `contexts/fhir/` bounded context: `fhir.schema.ts` (US Core compliant Patient/Observation/Bundle schemas with all FHIR datatypes — Identifier, HumanName, Address, ContactPoint, CodeableConcept, Coding, Quantity, Reference). `fhir.service.ts`: toFhirPatient (PHI decrypt → FHIR format), toFhirObservation (pain assessments → LOINC-mapped Observations — 72514-3 NRS, 38214-3 Wong-Baker, 38216-8 FLACC, 72093-8 PAINAD, 55423-8 ESAS, with ESAS components for pain/dyspnea/nausea), searchPatients/searchObservations/getPatient/getObservation (FHIR search params, Bundle pagination). `fhir.routes.ts`: GET /Patient (search), GET /Patient/:id (read), GET /Observation (search), GET /Observation/:id (read), GET /metadata (CapabilityStatement with SMART-on-FHIR security extensions). SMART scope enforcement: parse JWT scope claim, validate patient/Patient.read and patient/Observation.read, return OperationOutcome for auth errors. RLS integration via db.transaction pattern. 6 validators in typebox-compiler. `shared-types/fhir.ts` (22 exported types including FhirPatient, FhirObservation, FhirBundle, SmartScope, OperationOutcome). 0 TS errors, all routes type-safe. | T3-7a |
| 2026-03-12 | Repo-wide lint + bug fixes | 45 Biome errors fixed (backend + frontend). Non-null assertion `!` guards replaced with explicit `if (!request.user) return 401` in `signature.routes.ts` (10 handlers), `fhir.routes.ts` (4 handlers). Drizzle `or()/and()` non-null assertions fixed in `fhir.service.ts` + `signature.service.ts`. 3 billing service static-only classes suppressed with `biome-ignore`. Accessibility: `type="button"` added to 3 buttons in `signatures/index.tsx`; `onKeyDown` added to 3 sortable `<th>` in `recert-queue.tsx`. `routeTree.gen.ts` added to biome ignore (auto-generated). Auto-format applied to 33 files. 0 TS errors, 0 lint errors both packages. | T3-7b |

| 2026-03-13 | T3-12 Claim Audit Rules Engine | Migration 0023: `claim_audit_snapshots` table (id/claimId/claimRevisionId/locationId/auditedAt/passed/blockCount/warnCount/failures JSONB/overrideTrail JSONB/auditedBy) + 3 RLS policies + 5 new `alert_type_enum` values (CLAIM_VALIDATION_ERROR, CLAIM_REJECTION_STATUS, BILL_HOLD_COMPLIANCE_BLOCK, BILL_HOLD_MISSING_DOC, BILL_HOLD_MANUAL_REVIEW). `claimAudit.service.ts`: 12 standalone async rule checker functions (ELECTION_AND_NOE through REMITTANCE_OR_DENIAL_FOLLOW_UP), `runAudit` (Promise.all checkers, snapshot insert in db.transaction, auto-hold on claimBlocking=true via ClaimService.holdClaim, state transitions AUDIT_FAILED/READY_TO_SUBMIT), `getLatestSnapshot`, `getSnapshotHistory`, `overrideWarn` (appends to overrideTrail, advances claim if all BLOCKs overridden), `bulkHold`/`bulkReleaseHold` (atomic), `getAuditDashboard` (7 sections: claim status summary, aging by rule group/hold reason/branch, owner lane queue, top denial drivers stub, warn override 30-day trend). Socket.IO: billing:audit:failed, billing:hold:placed, billing:hold:released, billing:override:approved. 7 routes at /api/v1. 6 validators in typebox-compiler. `shared-types/billing/claimAudit.ts` (17 interfaces). Frontend: `claimAudit.functions.ts` (7 server fns), `billing/audit.tsx` (7-section dashboard, status summary tiles, aging tables, owner lane cards, override volume sparkbar). Nav: Billing Audit link. 11 contract tests. 0 TS errors all packages. | T3-8 |

---

_Task specs → `docs/tasks/tier-0.md` through `docs/tasks/tier-5.md`_
_Product strategy + pricing → `docs/PRODUCT_STRATEGY.md`_
