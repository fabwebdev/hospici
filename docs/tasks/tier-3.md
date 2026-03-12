# Tier 3 — Compliance & Billing

> `needs:` Tier 2 exit gate (clinical E2E suite passes). Each task is its own session.
>
> ⚠️ **Market Entry Blockers:** T3-1, T3-2, T3-3, T3-7 are required before any customer goes live.
> Missing these = 2% Medicare penalty + no billing capability.

---

## T3-1a · HOPE Infrastructure + Validation Engine `HIGH`

`read:` `HOPE-DOC`, `backend/src/contexts/analytics/`

> ⚠️ Market entry blocker. T3-1b depends on this task.

### DB migrations

Create `000X_hope_tables.sql` with these tables and RLS on all:

**`hope_assessments`** — richer schema than the stub in hope-reporting.md:
```typescript
{
  id: uuid PK;
  patientId: uuid FK;
  locationId: uuid FK;    // RLS
  assessmentType: '01' | '02' | '03';   // HOPE-A / HOPE-UV / HOPE-D (CMS codes)
  assessmentDate: date;
  electionDate: date;
  windowStart: date;       // computed: electionDate (A/D) or visitDate (UV)
  windowDeadline: date;    // windowStart + 7 days for A and D; same-day for UV
  assignedClinicianId: uuid FK → users.id;
  status: hope_assessment_status enum;
  // status values: draft | in_progress | ready_for_review | approved_for_submission
  //                | submitted | accepted | rejected | needs_correction
  completenessScore: integer;      // 0-100, cached for dashboard queries
  fatalErrorCount: integer;        // cached from last validate call
  warningCount: integer;           // cached from last validate call
  symptomFollowUpRequired: boolean;  // flagged by UV assessments with high symptom burden
  symptomFollowUpDueAt: date;
  data: jsonb;             // full TypeBox-validated HOPE payload
  createdAt: timestamptz;
  updatedAt: timestamptz;
}
```

> **Nomenclature note:** Use CMS-defined types only — `HOPE-A`, `HOPE-UV`, `HOPE-D`. Do NOT use Axxess-specific terms (HUV1, HUV2, SFV) in schema or code.

**`hope_iqies_submissions`** — full lifecycle tracking:
```typescript
{
  id: uuid PK;
  assessmentId: uuid FK → hope_assessments.id;
  locationId: uuid FK;    // RLS
  attemptNumber: integer; // 1-indexed; >1 means retry or correction
  submittedAt: timestamptz;
  responseReceivedAt: timestamptz;
  trackingId: varchar;    // iQIES-assigned tracking ID
  submittedByUserId: uuid FK → users.id;
  submissionStatus: 'pending' | 'accepted' | 'rejected' | 'correction_pending';
  correctionType: 'none' | 'modification' | 'inactivation'; // maps to iQIES action codes
  rejectionCodes: text[];   // iQIES error codes (A0310A_INVALID, WINDOW_VIOLATION, etc.)
  rejectionDetails: text;
  payloadHash: varchar;     // SHA-256 of submitted XML — tamper-evident audit trail
  createdAt: timestamptz;
}
```

**`hope_reporting_periods`** — one row per location per HQRP quarter.

**`hope_quality_measures`** — computed measure rates per reporting period.

All four tables: RLS policies (location_read + location_insert + location_update). Drizzle table definitions in `backend/src/db/schema/`.

---

### Live routes

Replace 501 stubs in `hope.routes.ts`. Register `hopeRoutes` in `server.ts`.

**Assessment CRUD:**
- `POST /api/v1/hope/assessments` — create; validates 7-day window (`HOPEWindowViolationError`); status starts `draft`
- `GET /api/v1/hope/assessments` — list with filters (status, type, clinician, date range)
- `GET /api/v1/hope/assessments/:id` — detail
- `PATCH /api/v1/hope/assessments/:id` — update data / clinician assignment

**Validation + approval gate:**
- `POST /api/v1/hope/assessments/:id/validate` →
  ```typescript
  {
    completenessScore: number;          // 0-100
    blockingErrors: { field: string; code: string; message: string }[];
    warnings: { field: string; code: string; message: string }[];
    inconsistencies: string[];
    missingRequiredFields: string[];
    suggestedNextActions: string[];
  }
  ```
  Also writes cached `completenessScore`, `fatalErrorCount`, `warningCount` back to `hope_assessments`.
  Cannot submit if `blockingErrors.length > 0`.

- `POST /api/v1/hope/assessments/:id/approve` — transitions `ready_for_review → approved_for_submission`; requires `supervisor` or `admin` role; logs to `audit_logs`

**iQIES submission lifecycle:**
- Assessment `approved_for_submission` → enqueue `hope-submission` BullMQ job
- `POST /api/v1/hope/submissions/:id/reprocess` — re-enqueue a `rejected` submission (creates attempt N+1)
- `POST /api/v1/hope/submissions/:id/revert-to-review` — moves assessment back to `ready_for_review`; requires supervisor; clears cached `approved_for_submission` state

**Quality benchmarks:**
- `GET /api/v1/analytics/quality-benchmarks` → NQF #3235, #3633, #3634 (A + B), HCI vs CMS national averages. Seeded static averages; BullMQ `hqrp-period-close` job (already exists) updates per quarter. Frontend: location vs national, trend last 4 quarters.

---

### Socket.IO events

Add to `compliance-events.ts` and `shared-types/socket.ts`:
- `hope:deadline:warning` — emitted by `hope-deadline-check` worker when window < 24h
- `hope:assessment:overdue` — window expired before assessment completed
- `hope:submission:rejected` — iQIES returned rejection codes

---

### Frontend (completeness ring + validate feedback)

Inside HOPE assessment form:
- Real-time completeness ring (0–100%)
- Section-level status (green = complete, red = fatal error, yellow = warning)
- "Fix next required item" navigation — jumps to first `missingRequiredField`
- Submit button disabled until `blockingErrors.length === 0`
- Supervisor "Approve for Submission" button (role-gated)

---

**Done when:**
- `POST /api/v1/hope/assessments` stores HOPE-A record; 7-day window throws `HOPEWindowViolationError`
- `validate` returns two-tier errors; blocking errors prevent approve
- Approve transitions status; iQIES submission enqueued from `approved_for_submission` only
- `reprocess` creates attempt N+1 in `hope_iqies_submissions` with incremented `attemptNumber`
- `payloadHash` stored on every submission row
- Completeness ring updates in real time
- Benchmark dashboard shows location vs national for all 4 measures
- RLS: location A cannot read location B assessments
- DLQ alert fires on 3 exhausted retries (existing T1-7 behavior confirmed)

---

## T3-1b · HOPE Operations Hub `MEDIUM`

`read:` `HOPE-DOC`, `backend/src/contexts/analytics/`

`needs:` T3-1a

> ⚠️ Market entry blocker. Delivers the HOPE command center, patient timeline, and submission workbench.

### New routes

**Dashboard:**
`GET /api/v1/hope/dashboard` →
```typescript
{
  dueToday: number;
  due48h: number;
  overdue: number;
  needsSymptomFollowUp: number;   // symptomFollowUpRequired = true and not yet filed
  rejectedByIQIES: number;
  readyToSubmit: number;          // approved_for_submission
  hqrpPenaltyRisk: boolean;       // current quarter <70% on any required measure
  assessmentList: {               // for the operational list view
    id: string; patientName: string; assessmentType: string;
    status: string; windowDeadline: string; completenessScore: number;
    symptomFollowUpRequired: boolean; assignedClinicianId: string;
    nextAction: string;
  }[];
}
```

**Patient timeline:**
`GET /api/v1/hope/patients/:id/timeline` →
```typescript
{
  patientId: string;
  hopeA: { required: boolean; windowDeadline: string; status: string; assessmentId: string | null };
  hopeUV: { count: number; lastFiledAt: string | null; nextDue: string | null };
  hopeD: { required: boolean; windowDeadline: string | null; status: string; assessmentId: string | null };
  symptomFollowUp: { required: boolean; dueAt: string | null; completed: boolean };
  penaltyExposure: { atRisk: boolean; measureShortfalls: string[] };
}
```

### Frontend — HOPE Command Center (`/hope/dashboard`)

- **Location-wide operational list** — columns: assessment type, patient, deadline, status badge, completeness %, symptom follow-up indicator, assigned clinician, next action
- **Dashboard widget row** — Due Today / Due 48h / Overdue / Needs Symptom Follow-Up / Rejected by iQIES / Ready to Submit / HQRP Penalty Risk
- **Patient-side HOPE panel** (inside `$patientId.tsx`):
  - Timeline ribbon: HOPE-A → HOPE-UV count → HOPE-D (color-coded by status)
  - Completeness ring (from T3-1a, linked)
  - Symptom follow-up indicator
  - Submission history panel: table of `hope_iqies_submissions` rows (attempt, submitted, status, trackingId, rejectionCodes)
- **Submission workbench** (`/hope/submissions`):
  - Tabs: Pending Approval / Ready to Submit / Submitted / Rejected / History
  - Reprocess and Revert-to-Review actions inline
  - Rejection codes surfaced with resolution guidance (from `hope-reporting.md` error code table)

### Socket.IO — consume in frontend

Wire `hope:deadline:warning`, `hope:assessment:overdue`, `hope:submission:rejected` from T3-1a into dashboard widget live refresh and toast notifications.

---

**Done when:**
- `GET /api/v1/hope/dashboard` returns all 7 widget counts and assessment list
- `GET /api/v1/hope/patients/:id/timeline` returns HOPE-A / UV / HOPE-D state for a patient
- HOPE Command Center renders at `/hope/dashboard` with live Socket.IO updates
- Patient timeline ribbon renders in patient detail page
- Submission history panel shows all iQIES attempts with rejection codes
- Submission workbench tabs correctly filter by status
- Unauthorized role gets 403 on dashboard and timeline routes

---

## T3-2a · NOE/NOTR Filing Workbench `HIGH`

`read:` `backend/src/contexts/billing/schemas/noticeOfElection.schema.ts`, `backend/src/utils/business-days.ts`

> ⚠️ Market entry blocker. T3-2b, T3-10, T3-12, T3-13 all depend on this task.

### DB migrations

**`notice_filing_status` enum** (new PostgreSQL enum):
```
draft | ready_for_submission | submitted | accepted | rejected
| needs_correction | late_pending_override | voided | closed
```
- `voided` — internal correction artifact (prior attempt superseded by correction)
- `closed` — terminal state after accepted NOTR or revocation confirmed

**`notices_of_election`** — expand existing table:
```typescript
{
  id: uuid PK;
  patientId: uuid FK;
  locationId: uuid FK;                 // RLS
  status: notice_filing_status;
  electionDate: date;
  deadlineDate: date;                  // electionDate + 5 business days (addBusinessDays())
  isLate: boolean;                     // computed: submittedAt > deadlineDate
  lateReason: text | null;
  overrideApprovedBy: uuid FK → users.id | null;
  overrideApprovedAt: timestamptz | null;
  overrideReason: text | null;
  submittedAt: timestamptz | null;
  submittedByUserId: uuid FK → users.id | null;
  responseCode: varchar | null;        // CMS response code
  responseMessage: text | null;
  attemptCount: integer default 1;     // increments on each resubmission
  correctedFromId: uuid FK → self | null;  // correction chain pointer
  priorPayloadSnapshot: jsonb | null;  // snapshot of last submitted payload
  isClaimBlocking: boolean;            // true if late/rejected and no override; consumed by T3-12
  createdAt: timestamptz;
  updatedAt: timestamptz;
}
```

**`notices_of_termination_revocation`** — new table (NOTR lives separately from NOE):
```typescript
{
  id: uuid PK;
  noeId: uuid FK → notices_of_election.id;
  patientId: uuid FK;
  locationId: uuid FK;                 // RLS
  status: notice_filing_status;
  revocationDate: date;
  revocationReason: text;              // patient request | condition-no-longer-terminal | transferred | deceased | other
  deadlineDate: date;                  // revocationDate + 5 business days (addBusinessDays())
  isLate: boolean;
  lateReason: text | null;
  overrideApprovedBy: uuid FK → users.id | null;
  overrideApprovedAt: timestamptz | null;
  overrideReason: text | null;
  // Transfer-specific fields (populated when revocationReason = 'transferred')
  receivingHospiceId: varchar | null;  // NPI of receiving hospice
  receivingHospiceName: text | null;
  transferDate: date | null;
  submittedAt: timestamptz | null;
  submittedByUserId: uuid FK → users.id | null;
  responseCode: varchar | null;
  responseMessage: text | null;
  attemptCount: integer default 1;
  correctedFromId: uuid FK → self | null;
  priorPayloadSnapshot: jsonb | null;
  isClaimBlocking: boolean;
  createdAt: timestamptz;
  updatedAt: timestamptz;
}
```

Both tables: RLS policies (`location_read` + `location_insert` + `location_update_own_or_admin`).

---

### State machine transitions

Valid transitions (enforce in service layer — throw `InvalidFilingTransitionError` on violation):

```
draft              → ready_for_submission (readiness checklist passes)
ready_for_submission → submitted (transmit to CMS)
submitted          → accepted | rejected
rejected           → needs_correction (supervisor acknowledges)
needs_correction   → ready_for_submission (corrected payload — increments attemptCount, snapshots prior payload)
submitted          → late_pending_override (deadline passed before acceptance)
late_pending_override → submitted (supervisor override approved)
accepted           → closed (NOTR filed and accepted, or period ends)
any non-terminal   → voided (internal — when a correction supersedes this attempt)
```

---

### Routes

**NOE routes** (`/api/v1/noe`):
- `POST /api/v1/patients/:patientId/noe` — create draft; compute `deadlineDate` via `addBusinessDays()`; status = `draft`
- `GET /api/v1/patients/:patientId/noe` — get NOE (with filing history timeline)
- `POST /api/v1/noe/:id/submit` — transitions `ready_for_submission → submitted`; sets `submittedAt`, `submittedByUserId`; marks `isLate` if past deadline
- `POST /api/v1/noe/:id/cms-response` — internal webhook: sets `responseCode`, `responseMessage`, transitions `submitted → accepted | rejected`
- `POST /api/v1/noe/:id/correct` — creates corrected NOE row (correctedFromId = prior id, priorPayloadSnapshot set, prior row → `voided`, new row starts at `ready_for_submission`, `attemptCount++`)
- `POST /api/v1/noe/:id/late-override` — supervisor/admin only; transitions `late_pending_override → submitted` with `overrideApprovedBy`, `overrideApprovedAt`, `overrideReason`; logs to `audit_logs`

**NOTR routes** (`/api/v1/notr`):
- `POST /api/v1/patients/:patientId/notr` — create NOTR; requires `revocationDate` + `revocationReason`; auto-computes `deadlineDate` via `addBusinessDays()`; if `revocationReason = 'transferred'` requires `receivingHospiceId` + `receivingHospiceName` + `transferDate`; status = `draft`
- `GET /api/v1/patients/:patientId/notr` — get NOTR (with filing history timeline)
- `POST /api/v1/notr/:id/submit` — same pattern as NOE submit
- `POST /api/v1/notr/:id/cms-response` — same pattern as NOE CMS response
- `POST /api/v1/notr/:id/correct` — same correction pattern as NOE
- `POST /api/v1/notr/:id/late-override` — supervisor/admin only; same late override pattern

**Readiness check:**
- `GET /api/v1/noe/:id/readiness` → `{ ready: boolean; checklist: { item: string; passed: boolean; detail?: string }[] }`
  - Checklist items: patient Medicare ID present, benefit period active, electionDate set, no existing accepted NOE for same period, no missing required demographic fields
- `GET /api/v1/notr/:id/readiness` → same shape; checklist includes: NOE accepted for period, revocationDate ≥ electionDate, revocationReason set, receivingHospice populated if transfer

**Exception queues (role-gated):**
- `GET /api/v1/filings/queue` — role-based exception lists:
  - `billing_specialist` sees: NOE Due Today, NOE Late, NOTR Due Today, NOTR Late, Rejected Filings, Awaiting Resubmission
  - `supervisor` + `admin` also see: Override Required (late_pending_override), Correction Pending
  - Query params: `?type=noe|notr&status=late|rejected|override_required&dueToday=true&due48h=true`

**Filing history (audit trail):**
- `GET /api/v1/noe/:id/history` → `{ events: { status: string; actor: string; timestamp: string; note?: string; responseCode?: string }[] }`
  - Every status transition writes a row to `audit_logs` with `action: 'NOE_STATUS_CHANGE'` or `'NOTR_STATUS_CHANGE'`
- `GET /api/v1/notr/:id/history` → same shape

---

### Auto-generation on revocation

`PatientService.revoke(patientId, revocationDate, reason)` (or equivalent discharge event) must:
1. Close the active NOE (transition to `closed`)
2. Auto-create a NOTR draft with `deadlineDate = addBusinessDays(revocationDate, 5)`
3. Emit `notr:created` Socket.IO event to location room
4. Upsert a `NOTR_DEADLINE_WARNING` compliance alert (existing alert service)

---

### BullMQ worker

**`noe-deadline-check`** worker (already exists from T1-6 — enhance, don't replace):
- Query `notices_of_election` where status IN (`draft`, `ready_for_submission`, `submitted`, `late_pending_override`) and `deadlineDate` is within 48h or past
- Query `notices_of_termination_revocation` same conditions
- For each: emit `noe:deadline:warning` / `notr:deadline:warning` Socket.IO event
- For overdue unsubmitted: transition to `late_pending_override`, upsert `NOE_LATE` / `NOTR_LATE` alert with `isClaimBlocking = true`
- Runs daily at 07:00 UTC (existing cron)

---

### Socket.IO events

Add to `compliance-events.ts` and `shared-types/socket.ts`:
- `noe:deadline:warning` — filing due within 48h
- `noe:late` — filing past deadline, now `late_pending_override`
- `noe:accepted` — CMS accepted
- `noe:rejected` — CMS rejected (with `responseCode`)
- `notr:created` — NOTR auto-generated on revocation
- `notr:deadline:warning` — NOTR due within 48h
- `notr:late` — NOTR past deadline
- `notr:accepted` — CMS accepted

---

### Frontend

**Filing workbench** (`/filings`):
- Tabbed view: NOE / NOTR
- Per-tab exception list using `GET /api/v1/filings/queue`
- Columns: patient name, status badge, deadline date, business-days-remaining pill (red ≤0, amber 1-2, green 3+), attempt count, last CMS response code, actions
- Status badge colors: `draft`=grey, `ready`=blue, `submitted`=yellow, `accepted`=green, `rejected`=red, `needs_correction`=orange, `late_pending_override`=red+lock, `voided`=strikethrough, `closed`=grey-out
- **Correction flow**: Rejected row → "Correct & Resubmit" → side-by-side diff (current payload vs prior snapshot) → submit correction
- **Late override flow**: Late row → "Request Override" → reason textarea → supervisor approves inline or from their queue
- **Readiness panel**: Before submit, show `GET .../readiness` checklist with pass/fail items; Submit button disabled if `ready: false`
- **Filing timeline drawer**: Click any row → slide-out history panel with status event log (from `/history` endpoint)
- **Transfer workflow**: NOTR with `revocationReason = 'transferred'` → renders receiving hospice fields inline

**Patient detail integration** (inside `$patientId.tsx`):
- NOE/NOTR status chip: shows current status + deadline badge; click → deep-links to filing workbench row
- `isClaimBlocking = true` → red "Claim Blocked" badge visible in patient header

---

**Done when:**
- Friday NOE `deadlineDate` edge case test passes (addBusinessDays reuse confirmed)
- Full 9-state transition enforced — `InvalidFilingTransitionError` thrown on illegal jump
- NOTR auto-generated on revocation with correct `deadlineDate`
- Correction creates new row with `correctedFromId`, prior row voided, `priorPayloadSnapshot` populated
- Late override requires supervisor role, logged to `audit_logs`
- Transfer NOTR requires `receivingHospiceId` + `transferDate`
- Exception queue returns role-filtered lists
- Filing history endpoint returns all status-change events in order
- `isClaimBlocking` flag set correctly on late/rejected/unresolved filings
- Socket.IO `notr:created` emitted on revocation
- Readiness checklist blocks submission when items fail
- RLS: location A cannot read location B filings

---

## T3-2b · F2F Validity Engine + Physician Routing `MEDIUM`

`read:` `backend/src/contexts/billing/schemas/benefitPeriod.schema.ts`, `backend/src/contexts/orders/` (from T3-9)

`needs:` T3-2a, T3-4 (benefit period automation), T3-9 (physician order inbox — provides task routing infrastructure)

> Extends T3-2a. F2F benefit-period awareness requires T3-4 to be complete first.

### DB migration

**`face_to_face_encounters`** table:
```typescript
{
  id: uuid PK;
  patientId: uuid FK;
  locationId: uuid FK;                     // RLS
  benefitPeriodId: uuid FK → benefit_periods.id;  // links F2F to exact period
  f2fDate: date;
  f2fProviderId: uuid FK → users.id | null;   // internal provider
  f2fProviderNpi: varchar | null;             // external provider NPI
  f2fProviderRole: 'physician' | 'np' | 'pa';
  encounterSetting: 'office' | 'home' | 'telehealth' | 'snf' | 'hospital';
  clinicalFindings: text;                  // free-text narrative from encounter
  isValidForRecert: boolean;               // computed by validity engine
  validatedAt: timestamptz | null;
  invalidationReason: text | null;         // set when isValidForRecert flipped false
  physicianTaskId: uuid FK → orders.id | null;  // link to T3-9 physician task
  createdAt: timestamptz;
  updatedAt: timestamptz;
}
```

RLS: `location_read` + `location_insert` + `location_update_own_or_admin`.

---

### F2F Validity Engine

**`F2FValidityService.validate(f2fEncounterId)`** checks all conditions:
1. `f2fDate` is within 30 calendar days **prior to** the recertification date of the linked `benefitPeriod`
2. `f2fProviderRole` is `physician`, `np`, or `pa` — hospice attending or consulting physician (not social worker, chaplain, aide)
3. `encounterSetting` is a recognized clinical encounter type (not async messaging)
4. `clinicalFindings` is non-empty (cannot be blank)
5. `benefitPeriodId` links to a period ≥ 3 (period 1 and 2 do not require F2F — do not block)
6. The linked `benefitPeriod` has not been superseded or voided

Returns: `{ isValid: boolean; reasons: string[] }` — writes back `isValidForRecert` + `validatedAt` + `invalidationReason` to the row.

**Route:** `POST /api/v1/f2f/:id/validate` — triggers engine, returns validity result.

When `benefitPeriod` changes (T3-4 event), re-run validation for any F2F linked to that period.

---

### Routes

- `POST /api/v1/patients/:patientId/f2f` — create F2F encounter; auto-runs validity engine; if `benefitPeriodId` links to period ≥ 3 and `isValidForRecert = true`, clears `F2F_MISSING` alert; if invalid, creates/updates `F2F_INVALID` alert
- `GET /api/v1/patients/:patientId/f2f` — list F2F encounters for patient (all periods)
- `PATCH /api/v1/f2f/:id` — update fields (e.g. add clinical findings); re-runs validity engine
- `POST /api/v1/f2f/:id/validate` — explicit re-validation (e.g. after period change)
- `GET /api/v1/f2f/queue` — `supervisor`/`admin` queue: patients in period 3+ with `isValidForRecert = false` or no F2F on record; includes days-until-recert countdown

---

### Physician / NP Task Routing

Reuse T3-9 `orders` table pattern. When F2F is required (period ≥ 3) and not yet documented:

**`F2FTaskService.createPhysicianTask(patientId, benefitPeriodId)`:**
1. Creates an `order` row via T3-9 service: `type = 'F2F_DOCUMENTATION'`, `physicianId` = assigned attending, `dueAt = recertDate - 5 business days` (gives physician 5 days before blocking window)
2. Links `physicianTaskId` on the `face_to_face_encounters` stub row (draft row created at same time)
3. Emits `order:f2f:required` Socket.IO event to physician session

**Physician task acknowledgment:**
- Physician sees F2F task in T3-9 inbox; clicking "Document F2F" deep-links to the F2F form (`/patients/:id/f2f/new?periodId=...`)
- On F2F form submit, marks the linked order as `SIGNED` (satisfied)

**Escalation (BullMQ):**
- **`f2f-deadline-check`** worker (new queue): daily at 07:00 UTC; queries patients in period ≥ 3 where recert is within 10 days and no valid F2F on record
  - Day 10: create physician task (above)
  - Day 5: upsert `F2F_MISSING` compliance alert (`severity: WARNING`)
  - Day 0 (recert date): upsert `F2F_MISSING` alert (`severity: CRITICAL`); set recert to blocked state; emit `f2f:overdue` Socket.IO

---

### Frontend

**"Document F2F" deep link from recert blockers:**
- In compliance alert cards where `alertType = 'F2F_MISSING'` or `'F2F_INVALID'`, render a "Document F2F" CTA button that navigates directly to `/patients/:patientId/f2f/new?periodId=:benefitPeriodId`
- Same CTA in the recertification blocked state in `$patientId.tsx`

**F2F form** (`/patients/:patientId/f2f/new`):
- Fields: f2fDate (date picker), provider (search internal users or enter NPI), providerRole (select), encounterSetting (select), clinicalFindings (textarea)
- On save: runs validity engine client-side preview (`POST .../validate`) — shows green "Valid for recertification" or red "Not valid — {reason}" before final submit
- Submit button disabled if `isValidForRecert = false`

**F2F queue** (`/filings/f2f-queue`):
- Table: patient name, current benefit period, period number, recert date, days remaining, F2F status (Valid / Invalid / Missing), last F2F date, assigned physician, action
- `supervisor`/`admin` only

**Benefit-period-aware panel** (inside `$patientId.tsx`):
- Shows: current period number, period dates, recert date, F2F requirement badge (period < 3 → "Not Required" grey; period ≥ 3 → "Required" + F2F status)
- Physician signing status for the linked F2F task

---

**Done when:**
- Period 3+ recertification blocked without a valid F2F (isValidForRecert = true)
- Validity engine rejects F2F outside 30-day window, wrong provider role, blank clinical findings
- Physician task auto-created when period ≥ 3 and F2F not yet filed, 10 days before recert
- "Document F2F" deep link from alert cards and recert blockers navigates to pre-filled F2F form
- `f2f-deadline-check` worker escalates correctly at day 10, day 5, day 0
- F2F queue returns only patients in period ≥ 3 with missing/invalid F2F
- RLS: location A cannot read location B F2F records
- Period 1 and 2 patients are not blocked (no F2F requirement)

---

## T3-3 · Hospice Cap Intelligence Module `HIGH`

`read:` `backend/src/contexts/billing/schemas/hospiceCap.schema.ts`, `backend/src/utils/business-days.ts`, `DB-ARCH`

> ⚠️ Market entry blocker. T3-7 and T3-12 consume `estimatedLiability` and `isCapAtRisk` flags produced here.

### DB migrations

**`cap_snapshots`** table:
```typescript
{
  id: uuid PK;
  locationId: uuid FK;       // RLS
  capYear: integer;          // e.g. 2025 = Nov 1 2025 – Oct 31 2026
  calculatedAt: timestamptz;
  utilizationPercent: numeric(6,3);
  projectedYearEndPercent: numeric(6,3);  // linear extrapolation from days-elapsed
  estimatedLiability: numeric(12,2);     // dollars
  patientCount: integer;
  formulaVersion: varchar;   // semver e.g. '1.0.0' — bump on any formula change
  inputHash: varchar;        // SHA-256 of input parameters — tamper-evident audit trail
  triggeredBy: 'scheduled' | 'manual' | 'data_correction';
  triggeredByUserId: uuid FK → users.id | null;
  createdAt: timestamptz;
}
```

**`cap_patient_contributions`** table:
```typescript
{
  id: uuid PK;
  snapshotId: uuid FK → cap_snapshots.id;
  patientId: uuid FK;
  locationId: uuid FK;       // RLS (denormalized for query performance)
  capContributionAmount: numeric(12,2);
  routineDays: integer;
  continuousHomeCareDays: integer;
  inpatientDays: integer;
  liveDischargeFlag: boolean;
  admissionDate: date;
  dischargeDate: date | null;
  createdAt: timestamptz;
}
```

Both tables: RLS policies (`location_read` + `location_insert` + `location_update_own_or_admin`).

**Migration also adds to `alert_type_enum`:**
- `CAP_THRESHOLD_70`
- `CAP_THRESHOLD_80`
- `CAP_THRESHOLD_90`
- `CAP_PROJECTED_OVERAGE`

---

### Cap calculation engine

**`CapCalculationService.calculate(locationId, capYear)`:**
1. Pull all patients admitted to location during cap year (Nov 1 – Oct 31) from `patients` table
2. For each patient: compute `capContributionAmount` = (routine home care days × rate) + (continuous home care days × rate) + (inpatient days × rate), capped at individual patient max per CMS formula
3. Sum all contributions → `estimatedLiability`
4. Divide by cap limit for location's Medicare region → `utilizationPercent`
5. Compute `projectedYearEndPercent` via linear extrapolation: `utilizationPercent / (daysElapsedInCapYear / 365)`
6. Compute `inputHash` = SHA-256 of serialized inputs (patientIds + contribution amounts + cap limit used + capYear)
7. Insert `cap_snapshots` row
8. Insert `cap_patient_contributions` rows (one per patient)
9. Upsert threshold alerts:
   - ≥ 70% and < 80%: upsert `CAP_THRESHOLD_70` (severity: WARNING)
   - ≥ 80% and < 90%: upsert `CAP_THRESHOLD_80` (severity: WARNING)
   - ≥ 90% and < 100%: upsert `CAP_THRESHOLD_90` (severity: CRITICAL)
   - projected ≥ 100%: upsert `CAP_PROJECTED_OVERAGE` (severity: CRITICAL)
10. Emit Socket.IO `cap:threshold:alert` to location room with `{ utilizationPercent, projectedYearEndPercent, threshold }` if any new threshold crossed

**`getCapYear(date)`:** already implemented in `hospiceCap.schema.ts` — use as-is.

> **Scope boundary:** Scenario modeling ("what-if current census holds") is deferred to T4-9 (predictive analytics — already has "length-of-stay variance"). T3-3 provides linear `projectedYearEndPercent` only.

---

### Routes

- `POST /api/v1/cap/recalculate` — manual trigger; `admin`/`billing_specialist` roles only; enqueues BullMQ `cap-recalculation` job; returns 202 + `{ jobId }`
- `GET /api/v1/cap/summary` — current cap year summary for requesting location:
  ```typescript
  {
    capYear: number;
    capYearStart: string;         // Nov 1
    capYearEnd: string;           // Oct 31
    daysRemainingInYear: number;
    utilizationPercent: number;
    projectedYearEndPercent: number;
    estimatedLiability: number;   // dollars
    patientCount: number;
    lastCalculatedAt: string;
    thresholdAlerts: { type: string; firedAt: string }[];
    priorYearUtilizationPercent: number | null;   // year-over-year comparison
  }
  ```
- `GET /api/v1/cap/patients` — filterable contributor list:
  - query params: `?snapshotId=&sortBy=contribution&limit=25&losMin=&losMax=&highUtilizationOnly=true`
  - returns `cap_patient_contributions` joined with patient name, admission date, LOS, care model, contribution $, contribution %
- `GET /api/v1/cap/trends` — monthly utilization across cap year + branch comparison:
  ```typescript
  {
    months: {
      month: string;                  // 'YYYY-MM'
      utilizationPercent: number;
      projectedYearEndPercent: number;
      patientCount: number;
      snapshotId: string;
    }[];
    branchComparison: {
      locationId: string;
      locationName: string;
      utilizationPercent: number;
      projectedYearEndPercent: number;
      trend: 'up' | 'down' | 'stable';    // vs prior month
    }[];
  }
  ```
- `GET /api/v1/cap/snapshots/:id` — single snapshot detail with full patient contribution list (drillable for audit/dispute)

---

### BullMQ worker

**`cap-recalculation`** worker (already exists from T1-7 as a stub — replace stub body):
- Scheduled: `0 6 2 11 *` (Nov 2 annually — existing cron, do not change)
- Manual trigger: via `POST /api/v1/cap/recalculate`
- Calls `CapCalculationService.calculate()` for all locations
- On completion: emit Socket.IO `cap:calculation:complete` to each location room with summary
- On failure: DLQ alert (existing T1-7 behavior already in place)

---

### Socket.IO events

Add to `compliance-events.ts` and `shared-types/socket.ts`:
- `cap:threshold:alert` — fired when 70%/80%/90%/projected-overage is crossed (new or escalated)
- `cap:calculation:complete` — snapshot stored; dashboard should refresh

---

### Frontend — Cap Intelligence Dashboard (`/cap`)

**Summary widget row (top of page):**
- Utilization gauge (0–100%; green <70%, amber 70–89%, red 90%+)
- Projected year-end %
- Estimated liability ($)
- Days remaining in cap year
- Last calculated timestamp + "Recalculate" button (admin/billing_specialist only)

**Dashboard sections (7 tabs/panels):**

1. **Current Utilization** — gauge + key metrics + threshold alert history (all four `CAP_*` alert types with timestamps)
2. **Projected Year-End** — trend line chart (actual utilization month-by-month + projected to Oct 31); projected overage date if applicable
3. **Top 25 Contributors** — sortable table: patient name, admission date, LOS, care model, contribution $, % of total; action column: "Review eligibility" / "Review level of care" / "Review discharge planning" / "Review documentation strength" CTAs
4. **Trend by Month** — line chart: Nov 1 → Oct 31, actual utilization % each month, projected year-end % per snapshot; shows movement over time
5. **By Branch** — branch ranking table: location name, utilization %, projected %, trend arrow (up/down/stable), patient count; multi-location operators see all locations they have access to
6. **High-Risk Patients** — contributors with LOS > 180 days or contribution in top 10% of current snapshot
7. **Recalculation History** — table of all `cap_snapshots`: calculatedAt, utilizationPercent, projectedYearEndPercent, triggeredBy, formulaVersion, delta % vs prior run; "Compare to prior snapshot" button → side-by-side diff (utilization %, patient count, estimatedLiability, new contributors since prior snapshot)

**Prior cap year toggle:** Switch between current and prior cap year snapshots. Shows final utilization for closed years.

**Export:** "Export Report" button → CSV of all patient contributors for selected snapshot (admin/billing_specialist only).

**Patient drill-down:** Click any contributor row → navigate to `/patients/:id`.

**Alert CTA:** `CAP_THRESHOLD_*` alert cards in the T2-8 compliance dashboard render a "View Cap Dashboard" button.

---

**Done when:**
- `CapCalculationService.calculate()` correctly computes per-patient contribution (routine + CHC + inpatient days)
- `utilizationPercent` and `projectedYearEndPercent` stored in every `cap_snapshots` row
- All 4 threshold alerts upsert at correct thresholds (70/80/90/projected)
- `cap-recalculation` BullMQ worker runs Nov 2 annually (existing cron confirmed) and on-demand via route
- Manual recalculate returns 202, job enqueued, `cap:calculation:complete` Socket.IO fires on completion
- `inputHash` stored on every snapshot row (tamper-evident)
- `GET /api/v1/cap/summary` includes prior-year comparison field
- `GET /api/v1/cap/patients` filterable by `highUtilizationOnly` and LOS range
- `GET /api/v1/cap/trends` returns monthly snapshots + branch comparison with trend direction
- `GET /api/v1/cap/snapshots/:id` returns full patient contribution list for that snapshot
- Cap Intelligence Dashboard renders all 7 sections at `/cap`
- Branch comparison table renders with trend direction for all RLS-accessible locations
- Top 25 contributors table shows all 4 patient-action CTA buttons
- Snapshot comparison diff shows delta % and new/removed contributors
- RLS: location A cannot read location B cap data or contribution rows

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

## T3-11 · QAPI management + clinician quality scorecards `MEDIUM`

> Quality Assessment and Performance Improvement — CMS-required quality program. Also includes clinician-level documentation quality scorecards and branch/discipline deficiency trend reporting (powered by `revision_count`, `first_pass_approved`, `revision_requests` data captured in T2-9).

`needs:` T2-9 (note review — provides `revision_count`, `first_pass_approved`, `RevisionRequest[]` data)

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

**QAPI routes:**
- `POST /api/v1/qapi`
- `GET /api/v1/qapi` (filterable by status/type)
- `PATCH /api/v1/qapi/:id` (add action items, close)

**BullMQ `qapi-overdue-check`:** Daily, flag open events with overdue action items → alert dashboard.

---

### Clinician quality scorecards

**Route:** `GET /api/v1/analytics/clinician-quality?clinicianId=&from=&to=`
- `supervisor` + `admin` roles only
- Aggregates from `encounters` table (`revision_count`, `first_pass_approved`, `revision_requests` JSONB)

**Scorecard shape:**
```typescript
{
  clinicianId: string;
  period: { from: string; to: string };
  totalNotes: number;
  firstPassApprovalRate: number;          // % approved with revision_count = 0
  averageRevisionCount: number;
  averageTurnaroundHours: number;         // submitted_at → approved_at delta
  deficiencyBreakdown: {                  // grouped by DeficiencyType
    [type: string]: number;               // count of occurrences
  };
  revisionTrend: { week: string; count: number }[]; // rolling 12 weeks
}
```

---

### Branch + discipline deficiency trend reporting

**Route:** `GET /api/v1/analytics/deficiency-trends?locationId=&discipline=&from=&to=`
- `supervisor` + `admin` roles only

**Returns:**
```typescript
{
  topDeficiencyTypes: { type: DeficiencyType; count: number }[];  // sorted desc
  weeklyTrend: { week: string; byType: Record<DeficiencyType, number> }[];
  reviewerWorkload: { reviewerId: string; reviewerName: string; assigned: number; resolved: number }[];
}
```

**Done when:** QAPI event created, action items assigned, overdue items surface in alert dashboard; closed events immutable; clinician scorecard returns correct first-pass rate and deficiency breakdown from T2-9 data; trend report aggregates by DeficiencyType across location/discipline/period

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

---

## T3-13 · Chart audit mode + review checklists + survey-readiness `MEDIUM`

> Full chart-level audit capability — from individual note QA to survey-readiness packet completeness. Deferred from T2-9 because it requires T3-5 (signatures), T3-1 (HOPE), T3-2 (NOE/NOTR), and T3-9 (orders) to be complete.

`needs:` T2-9 (note review), T3-1 (HOPE), T3-2 (NOE/NOTR), T3-5 (electronic signatures), T3-9 (physician orders)

`read:` `BE-SPEC`, `DB-ARCH`

---

### Discipline-specific review checklists

A checklist template is a set of required items for a given `(discipline, visit_type)` pair. Supervisors step through checklist items when reviewing a note.

**New table `review_checklist_templates`** (Migration 0015):
```typescript
{
  discipline: DisciplineType;           // RN | SW | CHAPLAIN | THERAPY | AIDE
  visitType: VisitType;                 // ROUTINE | ADMISSION | RECERTIFICATION | DISCHARGE
  items: ChecklistItem[];               // JSONB
  version: integer;
  isActive: boolean;
}
// ChecklistItem: { id, label, required: boolean, regulatoryRef?: string }
```

Seed templates for: `RN × ROUTINE`, `RN × ADMISSION`, `RN × RECERTIFICATION`, `SW × ROUTINE`, `CHAPLAIN × ROUTINE`.

**Checklist response stored per review** — add `checklist_responses` JSONB column to encounters (array of `{ itemId, checked, reviewerId, timestamp }`).

**Route:** `GET /api/v1/review-checklist-templates?discipline=&visitType=` — returns active template for that pair.

---

### Chart audit mode

A supervisor audits a patient's full chart packet — not a single encounter.

**Route:** `GET /api/v1/patients/:id/chart-audit`
- `supervisor` + `compliance_officer` roles only
- Returns composite readiness report:

```typescript
{
  patientId: string;
  auditDate: string;
  sections: {
    encounters:        { total: number; pending: number; approved: number; locked: number; overdue: number };
    hopeAssessments:   { required: number; filed: number; missing: string[] };  // missing window names
    noeNotr:           { noeStatus: string; notrRequired: boolean; notrStatus: string | null };
    orders:            { total: number; unsigned: number; expired: number };
    signatures:        { required: number; obtained: number; missing: string[] };  // document names
    carePlan:          { present: boolean; lastUpdated: string | null; disciplinesComplete: string[] };
    medications:       { active: number; unreconciled: number; teachingPending: number };
    idgMeetings:       { lastHeld: string | null; nextDue: string; overdue: boolean };
  };
  surveyReadiness: {
    score: number;                      // 0-100
    blockers: string[];                 // hard issues (CMS-required docs missing)
    warnings: string[];                 // soft issues (coaching gaps)
  };
  missingDocuments: {
    type: string;
    description: string;
    dueBy: string | null;
    severity: 'critical' | 'warning';
  }[];
}
```

---

### DB-persisted saved filter views

Supervisors can save named filter configurations for the note review queue.

**New table `review_queue_views`:**
```typescript
{
  ownerId: uuid FK → users.id;
  name: string;
  filters: jsonb;   // same shape as GET /review-queue query params
  isShared: boolean;
  locationId: uuid;
}
```

**Routes:**
- `GET /api/v1/review-queue/views` — list saved views for current user + shared views in location
- `POST /api/v1/review-queue/views` — save filter config
- `DELETE /api/v1/review-queue/views/:id` — delete own view

---

### Bulk QA actions

Beyond bulk-acknowledge (already in T2-9), add:

**Route:** `POST /api/v1/review-queue/bulk-action`
```typescript
body: {
  encounterIds: string[];
  action: 'ASSIGN' | 'REQUEST_REVISION' | 'ACKNOWLEDGE';
  // ASSIGN requires assignedReviewerId
  // REQUEST_REVISION requires a single shared RevisionRequest (applied to all)
  assignedReviewerId?: string;
  revisionRequest?: Omit<RevisionRequest, 'id' | 'resolvedAt' | 'resolvedComment'>;
}
```

---

**Done when:** Checklist template returns correct items for `RN × ROUTINE`; checklist responses stored per review; chart audit endpoint returns all 8 sections + surveyReadiness score; missing documents listed with severity; saved filter views persist across sessions; bulk-assign and bulk-revision-request work atomically (all or none, rolled back on partial failure); unauthorized roles get 403 on all routes

