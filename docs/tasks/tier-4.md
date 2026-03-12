# Tier 4 — Interoperability & Scale

> `needs:` Tier 3 exit gates. Each task is its own session.
> All HIGH tasks: 2 architecture docs max per session.

---

## T4-1 · SMART on FHIR 2.0 (Backend Services) `HIGH`

`read:` `SECURITY`, `BE-SPEC` §Phase 5

- All SMART scopes from `SECURITY` §11 registry
- Backend Services profile (M2M)
- JWKS endpoint implementation

---

## T4-2 · FHIR R4 `$export` bulk operation `HIGH`

`read:` `BE-SPEC` §Phase 5

- NDJSON output
- Async job pattern: 202 → polling → download
- Required for CMS reporting and ONC certification

---

## T4-3 · eRx integration (EPCS) `HIGH`

`read:` `BE-SPEC` §Phase 5

- DoseSpot or NewCrop staging round-trip
- Requires DEA registration + 2FA device audit before controlled substance e-prescribing
- Basic med list operational from T2-6

---

## T4-4 · Direct Secure Messaging `HIGH`

`read:` `BE-SPEC` §Phase 5

- XDM packaging + HISP transport

---

## T4-5 · DDE/FISS Integration `HIGH`

- CMS Direct Data Entry for NOE/NOTR submission
- Deferred from T3-2
- Requires CMS HETS enrollment

---

## T4-6 · TypeBox AOT CI verification `LOW`

CI check that no `TypeCompiler.Compile()` call exists outside `typebox-compiler.ts`.

Valkey caching for FHIR `$everything` and cap year data.

**Done when:** Lint gate passes; Valkey hit rate >95% under load

---

## T4-7 · Load testing `MEDIUM`

- k6 suite
- Target: p99 API response <200ms
- `EXPLAIN ANALYZE` on all cap/billing queries

---

## T4-8 · Error monitoring `LOW`

- Sentry SDK
- PHI scrubbed in `beforeSend`
- Wire to Fastify error handler + BullMQ worker errors

---

## T4-9 · Predictive analytics `HIGH`

> Adds `RAPID_DECLINE_RISK`, `REVOCATION_RISK`, and length-of-stay variance signals to the T2-8 alert system. Requires sufficient pain assessment + visit data to train/run models.

`needs:` T2-8 (alert service), T2-10 (visit scheduling), T4-7 (load tested baseline)

**Signals to derive (rule-based first, ML later):**
- `RAPID_DECLINE_RISK` — ESAS total score increase ≥30% in 14 days OR ≥2 new symptoms in last IDG
- `REVOCATION_RISK` — patient hospitalized >3 days in 30-day window OR caregiver distress flag
- `LENGTH_OF_STAY_VARIANCE` — patient in care >180 days AND last IDG did not document continued decline

**Implementation approach:**
1. Phase 1: Rule-based queries in a new BullMQ daily job (`predictive-risk.worker.ts`) — no external ML, pure SQL + TypeScript
2. Phase 2: Optional — pipe features to external model endpoint (configurable, fail-open)

**AlertType additions:**
- `RAPID_DECLINE_RISK` — severity: `warning` — snoozeable (not a CMS hard block)
- `REVOCATION_RISK` — severity: `warning` — snoozeable
- `SUITABILITY_REVIEW` — severity: `info` — for length-of-stay outliers

**PHI:** Risk scores are derived values, not PHI themselves, but trigger display of patient context — follow same PHI_ACCESS role gate as all T2-8 alerts.

**Done when:** Rule-based daily job produces `RAPID_DECLINE_RISK` alerts for qualifying patients; alerts appear in T2-8 dashboard under a distinct "Risk" filter tab; PHI access gate enforced; no real ML model required for Phase 1 done-state
