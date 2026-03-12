# Tier 3 — Compliance & Billing

> `needs:` Tier 2 exit gate (clinical E2E suite passes). Each task is its own session.
>
> ⚠️ **Market Entry Blockers:** T3-1, T3-2, T3-3, T3-7 are required before any customer goes live.
> Missing these = 2% Medicare penalty + no billing capability.

---

## T3-1 · HOPE DB migrations + live routes + Documentation Assistant `MEDIUM`

`read:` `HOPE-DOC`, `backend/src/contexts/analytics/`

**DB migrations:** Create `000X_hope_tables.sql`:
- Tables: `hope_assessments`, `hope_iqies_submissions`, `hope_reporting_periods`
- RLS policies on all three
- Drizzle table definitions

**Live routes:** Register `hopeRoutes` in `server.ts`. Replace 501 stubs in `hope.routes.ts` with real Drizzle queries. Wire `getDeadlineStatus()` (already implemented) into route responses. Enqueue via `hope-submission` BullMQ job (requires iQIES sandbox credentials — see ⚡ Immediate Actions in MASTER_PROMPT.md).

**HOPE Documentation Assistant:**
`GET /api/v1/hope/assessments/:id/completeness` →
```typescript
{ score: number; // 0-100
  missingSections: string[];
  requiredForSubmission: string[];
  warnings: string[] }
```
Frontend: real-time completeness ring (0–100%) inside HOPE assessment form. Sections turn green as completed. Cannot submit to iQIES until score = 100 on required fields.

**Quality benchmark dashboard:**
`GET /api/v1/analytics/quality-benchmarks` → location's NQF #3235, #3633, #3634, and HCI scores vs CMS national averages. National averages stored as static seed in DB, updated quarterly via BullMQ job. Frontend chart: location vs national, trend over last 4 quarters.

**Done when:** `POST /api/v1/hope/assessments` stores HOPE-A record; 7-day window throws `HOPEWindowViolationError`; iQIES submission enqueued; completeness ring updates in real time; benchmark dashboard shows location vs national for all 4 measures

---

## T3-2 · NOE/NOTR workflow + F2F state machine `MEDIUM`

`read:` `backend/src/contexts/billing/schemas/noticeOfElection.schema.ts`, `benefitPeriod.schema.ts`

**NOE state machine:** draft → submitted → accepted / rejected

**NOTR auto-generation:** On revocation, auto-generate NOTR with 5 business-day deadline. Reuse `addBusinessDays()` — mirrors NOE deadline logic.

**Change-of-hospice-election workflow**

**F2F tracking:** For period 3+ recertifications — block signing without valid `f2fDate` within 30 prior days.

DDE/FISS integration deferred to T4-5.

**Done when:** Friday NOE edge case test passes; NOTR generates automatically on revocation; period 3 recert blocked without F2F

---

## T3-3 · Hospice cap calculation engine `MEDIUM`

`read:` `backend/src/contexts/billing/schemas/hospiceCap.schema.ts`, `backend/src/utils/business-days.ts`

- Cap calculation service: `POST /api/v1/cap/calculate`
- BullMQ `cap-recalculation` job fires Nov 2 annually
- Alert at 80% via Socket.IO `cap:threshold:alert` event
- Wire `getCapYear()` (already implemented in schema) into route response

**Done when:** Cap overage alert fires at 80%; cap year correctly uses Nov 1 – Oct 31 boundary

---

## T3-4 · Benefit period automation `MEDIUM`

`read:` `backend/src/contexts/billing/schemas/benefitPeriod.schema.ts`

- 90d / 90d / 60d / 60d state machine
- F2F required from period 3 onward
- Concurrent care revocation workflow

**Done when:** Period 3 transition blocked without F2F; recertification state machine tested

---

## T3-5 · Electronic signatures `MEDIUM`

- TypeBox schema for signatures
- Tamper-evident: hash of signed content + timestamp + signer ID stored in `audit_logs`

**Done when:** Signed document hash verifiable; re-signing an already-signed document returns 409

---

## T3-6 · FHIR R4 Patient + Observation endpoints `HIGH`

> Own session. Load FHIR-relevant doc sections only.

`read:` `SECURITY` §SMART, `backend/src/contexts/clinical/schemas/patient.schema.ts`

- `GET /fhir/r4/Patient`
- `GET /fhir/r4/Patient/:id`
- `GET /fhir/r4/Observation`
- US Core profiles
- SMART on FHIR 2.0 scope enforcement

**Done when:** SMART scope tests pass; `Patient` resource validates against US Core profile

---

## T3-7 · EDI 837i claim generation `HIGH`

> Own session. Requires clearinghouse enrollment (see ⚡ Immediate Actions in MASTER_PROMPT.md).

`read:` `BE-SPEC` §Phase 4

- TypeBox claim schema
- `POST /api/v1/claims`
- 837i generation
- BullMQ `claim-submission` queue → clearinghouse → DLQ alert on failure
- ERA 835 ingestion + remittance matching

**Done when:** 837i validates against X12 validator; DLQ alert fires on simulated clearinghouse rejection; ERA 835 auto-posts remittance

---

## T3-8 · BAA registry + security hardening `MEDIUM`

1. **Create `docs/compliance/baa-registry.md`** — enumerate all PHI-processing vendors:
   - Valkey host, SMTP provider, hosting, backup/DR, clearinghouse, OpenFDA
   - **Claude API / Anthropic** — note: PHI stripped before API calls per T2-7; document this explicitly
   - Confirm or obtain BAA for each vendor

2. **Verify MFA** is enforced (not optional) — check `auth.config.ts` from T1-1

3. **Auto-logoff timeout enforcement** at Fastify session level

4. **Key rotation docs** at `docs/security/key-rotation.md`

5. **Incident response** at `docs/security/incident-response.md`

**Done when:** BAA registry lists all vendors with BAA status; session auto-logoff test passes; key rotation procedure documented

---

## T3-9 · Physician order inbox + paperless order routing `MEDIUM`

> Verbal orders, DME requests, and frequency changes route automatically to physician for e-signature.

`needs:` T3-5 (e-signatures), T1-6 (BullMQ), T1-8 (Socket.IO)

**New bounded context:** `backend/src/contexts/orders/`

**TypeBox `OrderSchema`:**
```typescript
{
  type: 'VERBAL' | 'DME' | 'FREQUENCY_CHANGE' | 'MEDICATION';
  patientId: string;
  issuingClinicianId: string;
  physicianId: string;
  content: string;
  status: pgEnum('order_status', ['PENDING_SIGNATURE', 'SIGNED', 'REJECTED', 'EXPIRED']);
  dueAt: date; // 72h from creation for verbals (CMS requirement)
  signedAt?: date;
  rejectionReason?: string;
}
```

Drizzle table `orders` + RLS.

**Routes:**
- `POST /api/v1/orders` (clinician creates)
- `GET /api/v1/orders/inbox` (physician sees pending)
- `POST /api/v1/orders/:id/sign`
- `POST /api/v1/orders/:id/reject`

**BullMQ `order-expiry-check`:** Daily scan for unsigned verbals approaching 72h → Socket.IO `order:expiring` to physician session.

**Done when:** Verbal order created by nurse routes to physician inbox; physician signs via e-sig; 72h warning fires via Socket.IO; unsigned order at 72h logged as compliance gap in alert dashboard

---

## T3-10 · ADR audit record export `MEDIUM`

> When CMS issues ADR or TPE audit, agencies need complete chronological record within minutes.

`needs:` T3-5 (signatures/hashing), T2-4 (IDG), T2-5 (care plan), T3-2 (NOE/NOTR)

**Route:** `GET /api/v1/patients/:id/audit-export?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `super_admin` + `compliance_officer` roles only
- Returns structured PDF-ready JSON: all encounters + notes, all orders + signatures, all HOPE assessments, all medications + MAR, all IDG meeting records, all NOE/NOTR filings, all `audit_log` entries for this patient
- Async via BullMQ job (202 → polling → download) to avoid request timeout on large records
- Output is signed and tamper-evident: SHA-256 hash of full payload stored in `audit_logs`

**Audit:** Export action logged with `action: 'ADR_EXPORT'`, requestor, date range, export hash.

**Done when:** Export covers all 7 record categories; hash verifiable; async job completes within 30s for 6-month patient record; unauthorized role returns 403

---

## T3-11 · QAPI management `MEDIUM`

> Quality Assessment and Performance Improvement — CMS-required quality program.

**TypeBox `QAPIEventSchema`:**
```typescript
{
  eventType: 'ADVERSE_EVENT' | 'NEAR_MISS' | 'COMPLAINT' | 'GRIEVANCE';
  patientId?: string;
  reportedBy: string;
  occurredAt: date;
  description: string;
  rootCauseAnalysis?: string;
  actionItems: QAPIActionItem[];
  status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED';
  closedAt?: date;
}
// QAPIActionItem: { action; assignedTo; dueDate; completedAt? }
```

Drizzle table `qapi_events` + RLS.

**Routes:**
- `POST /api/v1/qapi`
- `GET /api/v1/qapi` (filterable by status/type)
- `PATCH /api/v1/qapi/:id` (add action items, close)

**BullMQ `qapi-overdue-check`:** Daily, flag open events with overdue action items → alert dashboard.

**Done when:** QAPI event created, action items assigned, overdue items surface in alert dashboard; closed events immutable

---

## T3-12 · Pre-submission claim audit (31-point validation) `MEDIUM`

> Run before any 837i is transmitted. Configurable, documented validation rule set.

`needs:` T3-7 (837i), T3-2 (NOE/NOTR), T3-4 (benefit periods), T3-5 (signatures)

**New service:** `backend/src/contexts/billing/services/claimAudit.service.ts`

Runs before the `claim-submission` BullMQ job enqueues.

**10 rule categories:**
1. Patient eligibility fields complete (Medicare ID, benefit period, election date)
2. NOE accepted and within window
3. All required visits completed per physician orders (frequency compliance)
4. IDG meeting held within 15-day window
5. HOPE assessment filed if admission claim
6. F2F documented if period 3+
7. Aide supervision completed within 14 days
8. Signatures obtained on all required documents
9. Physician orders signed (no unsigned verbals)
10. No duplicate claim for same period

**Return type:**
```typescript
{
  passed: boolean;
  failures: { rule: string; severity: 'BLOCK' | 'WARN'; detail: string }[]
}
```
- `BLOCK` failures prevent submission
- `WARN` failures require supervisor override with reason logged to `audit_log`

**Done when:** Claim with missing F2F returns BLOCK failure; claim with WARN issue requires supervisor override; all 10 rule categories produce failures on seeded test data
