# Tier 3 — Compliance & Billing

> `needs:` Tier 2 exit gate (clinical E2E suite passes). Each task is its own session.
>
> ⚠️ **Market Entry Blockers:** T3-1a/1b, T3-2a, T3-3, T3-7a are required before any customer goes live.
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

> ⚠️ Market entry blocker. T3-7a and T3-12 consume `estimatedLiability` and `isCapAtRisk` flags produced here.

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

## T3-4 · Benefit Period Control System `HIGH`

`read:` `BE-SPEC` §Phase 3, `DB-ARCH` §billing

`needs:` T3-2a (NOE linkage awareness — T3-4 FK-references `notice_of_election`; T3-2b in turn `needs:` T3-4)

> Period engine, recertification timeline, transfer-aware recalculation, and operational control layer.
> T3-2b (`F2F Validity Engine`) depends on this task's `f2fStatus` / `f2fRequired` fields.

---

### DB migration

New migration `000X_benefit_periods.sql` — all tables get RLS policies.

**New enums:**
```sql
CREATE TYPE benefit_period_status AS ENUM (
  'current', 'upcoming', 'recert_due', 'at_risk', 'past_due',
  'closed', 'revoked', 'transferred_out', 'concurrent_care', 'discharged'
);

CREATE TYPE benefit_period_recert_status AS ENUM (
  'not_yet_due', 'ready_for_recert', 'pending_physician', 'completed', 'missed'
);

CREATE TYPE benefit_period_f2f_status AS ENUM (
  'not_required', 'not_yet_due', 'due_soon', 'documented', 'invalid', 'missing', 'recert_blocked'
);

CREATE TYPE benefit_period_admission_type AS ENUM (
  'new_admission', 'hospice_to_hospice_transfer', 'revocation_readmission'
);
```

**`benefit_periods` table:**
```typescript
{
  id: uuid PK;
  patientId: uuid FK → patients.id;
  locationId: uuid FK;                    // RLS anchor

  // Period identity
  periodNumber: integer NOT NULL;         // 1-indexed; inherited from source on transfer
  startDate: date NOT NULL;
  endDate: date NOT NULL;
  periodLengthDays: integer GENERATED ALWAYS AS (endDate - startDate) STORED;
  // Period 1 = 90d, Period 2 = 90d, Period 3+ = 60d

  // Lifecycle state
  status: benefit_period_status NOT NULL DEFAULT 'upcoming';
  admissionType: benefit_period_admission_type DEFAULT 'new_admission';
  isTransferDerived: boolean DEFAULT false;
  sourceAdmissionId: uuid nullable;       // FK to patients.id of previous hospice on H→H transfer

  // Reporting control
  isReportingPeriod: boolean DEFAULT false;  // at most one true per patient (partial unique index)

  // Recertification
  recertDueDate: date nullable;           // null for period 1; startDate + periodLengthDays - 14 advisory
  recertStatus: benefit_period_recert_status DEFAULT 'not_yet_due';
  recertCompletedAt: timestamptz nullable;
  recertPhysicianId: uuid nullable FK → users.id;

  // F2F (required period 3+)
  f2fRequired: boolean DEFAULT false;
  f2fStatus: benefit_period_f2f_status DEFAULT 'not_required';
  f2fDocumentedAt: date nullable;
  f2fProviderId: uuid nullable FK → users.id;
  f2fWindowStart: date nullable;          // recertDueDate - 30 calendar days
  f2fWindowEnd: date nullable;            // recertDueDate (F2F must be BEFORE recert date)

  // Billing risk
  billingRisk: boolean DEFAULT false;
  billingRiskReason: text nullable;

  // NOE linkage (period 2+ links to its recertification NOE)
  noeId: uuid nullable FK → notices_of_election.id;

  // Concurrent care sub-state
  concurrentCareStart: date nullable;
  concurrentCareEnd: date nullable;

  // Revocation
  revocationDate: date nullable;

  // Error correction audit trail
  correctionHistory: jsonb NOT NULL DEFAULT '[]';
  // Each entry: { correctedAt, correctedByUserId, field, oldValue, newValue, reason, previewApproved }

  createdAt: timestamptz;
  updatedAt: timestamptz;
}
```

**Indexes:**
```sql
-- Fast per-patient timeline
CREATE INDEX ON benefit_periods (patient_id, period_number);
-- Enforce at-most-one reporting period per patient
CREATE UNIQUE INDEX ON benefit_periods (patient_id) WHERE is_reporting_period = true;
-- RLS / location queries
CREATE INDEX ON benefit_periods (location_id, status);
-- Recert due queue
CREATE INDEX ON benefit_periods (recert_due_date) WHERE status IN ('current', 'recert_due', 'at_risk');
```

**RLS policies (mirror NOE pattern):**
- `location_read`: `locationId = current_setting('app.location_id')`
- `location_insert`: same
- `owner_or_admin_update`: `locationId matches` OR `role = 'admin'`
- Super-admin bypass

---

### Bounded context: `backend/src/contexts/billing/`

**New files:**
- `benefit-periods.table.ts` — Drizzle table definition
- `schemas/benefitPeriod.schema.ts` — TypeBox schemas (all CRUD + period engine DTOs)
- `services/benefit-period.service.ts` — period engine
- `routes/benefit-period.routes.ts`

**`BenefitPeriodService` methods:**

```typescript
// Initialize periods for new admission or H→H transfer
// Generates all periods: 1×90d, 1×90d, then 60d thereafter up to reasonable horizon (4 periods)
// Transfer: inherits periodNumber from source, adjusts startDate to transfer date
initializePeriods(patientId, admissionDate, admissionType, sourceAdmissionId?): Promise<BenefitPeriod[]>

// When admission date / transfer date changes — recalculates all downstream periods
// Returns { preview: BenefitPeriod[], requiresApproval: boolean } before committing
recalculateFromPeriod(periodId): Promise<RecalculationPreview>

// Commit a previewed recalculation — writes correctionHistory entries on each affected period
commitRecalculation(previewToken: string, approvedByUserId: string): Promise<BenefitPeriod[]>

// Transition status machine — called by daily BullMQ job
// Derives: current → recert_due (14d before endDate), recert_due → at_risk (7d before), → past_due
// Also derives f2fStatus, billingRisk flag
deriveStatuses(locationId): Promise<void>

// Set reporting period (clears previous isReportingPeriod for same patient)
setReportingPeriod(periodId): Promise<BenefitPeriod>

// Record completed recertification — transitions recertStatus, updates recertCompletedAt
completeRecertification(periodId, physicianId): Promise<BenefitPeriod>

// Record concurrent care entry / exit
setConcurrentCare(periodId, start, end?): Promise<BenefitPeriod>

// Record revocation — closes period, sets status=revoked, sets revocationDate
revokeElection(periodId, revocationDate): Promise<BenefitPeriod>

// Error correction with preview
previewCorrection(periodId, field, newValue): Promise<CorrectionPreview>
commitCorrection(periodId, correction, approvedByUserId): Promise<BenefitPeriod>

// Manager list — location-wide, filterable by status
listPeriods(locationId, filters): Promise<BenefitPeriodListResponse>

// Patient timeline
getPatientTimeline(patientId): Promise<BenefitPeriodTimeline>

// Period detail
getPeriod(periodId): Promise<BenefitPeriodDetail>
```

**Period length rules (hardcoded, not configurable):**
```typescript
function getPeriodLengthDays(periodNumber: number): 90 | 60 {
  return periodNumber <= 2 ? 90 : 60;
}
// F2F required for period 3 onward
function isF2FRequired(periodNumber: number): boolean {
  return periodNumber >= 3;
}
// F2F window: [recertDueDate - 30 calendar days, recertDueDate)
// Must be BEFORE the recertification date (42 CFR §418.22)
```

**`billingRisk` derivation:**
- `recertStatus = 'missed'` → billingRisk=true, reason=`MISSED_RECERTIFICATION`
- `f2fStatus IN ('missing', 'invalid', 'recert_blocked')` AND `f2fRequired=true` → billingRisk=true, reason=`F2F_DEFICIENT`
- Period `status = 'past_due'` → billingRisk=true, reason=`PERIOD_PAST_DUE`

**Transfer-aware initialization:**
```typescript
// H→H transfer: new hospice inherits existing period number, starts new sub-period
// Admission type = 'hospice_to_hospice_transfer', isTransferDerived=true, sourceAdmissionId set
// Period length resets to 60d regardless of inherited period number
// Clock does NOT restart to period 1
```

---

### Routes

```typescript
// Benefit Period Manager — location-wide operational view
GET    /api/v1/benefit-periods
  query: { status?, patientId?, recertDueBefore?, billingRisk?, page, limit }
  returns: BenefitPeriodListResponse (paginated)

// Patient timeline
GET    /api/v1/patients/:id/benefit-periods
  returns: BenefitPeriodTimeline

// Period detail
GET    /api/v1/benefit-periods/:id
  returns: BenefitPeriodDetail

// Set reporting period (role: admin | billing_coordinator)
PATCH  /api/v1/benefit-periods/:id/reporting
  body: { isReportingPeriod: true }
  note: clears previous isReportingPeriod for same patient atomically

// Preview recalculation (no mutation — returns diff)
POST   /api/v1/benefit-periods/:id/recalculate-from-here/preview
  returns: RecalculationPreview { affectedPeriods, changesSummary, previewToken (TTL 5 min) }

// Commit a previewed recalculation
POST   /api/v1/benefit-periods/:id/recalculate-from-here
  body: { previewToken }
  note: requires approval; writes correctionHistory on each affected period

// Record completed recertification
POST   /api/v1/benefit-periods/:id/recertify
  body: { physicianId, completedAt }

// Error correction (field-level, with audit)
POST   /api/v1/benefit-periods/:id/correct
  body: { field, newValue, reason }
  note: runs preview inline; small corrections (non-date fields) auto-commit; date changes require previewToken flow
```

**Role gates:**
- `view benefit periods`: all clinical roles
- `edit benefit periods` (correct, recertify): clinical_admin, billing_coordinator
- `override reporting period`: billing_coordinator, admin

---

### BullMQ job: `benefit-period-check`

Schedule: `0 7 * * *` (daily 07:00 UTC)

**Worker logic:**
1. Call `BenefitPeriodService.deriveStatuses(locationId)` for all active locations
2. For each period status transition → `AlertService.upsertAlert()`:
   - `recert_due` (14d window) → `RECERT_DUE` alert (warning)
   - `at_risk` (7d window) → `RECERT_AT_RISK` alert (critical)
   - `past_due` → `RECERT_PAST_DUE` alert (critical, hard-block on billing)
   - `f2fStatus = 'due_soon'` → `F2F_DUE_SOON` alert (warning)
   - `f2fStatus = 'missing'` AND past window → `F2F_MISSING` alert (critical)
   - `billingRisk` flips to true → `BENEFIT_PERIOD_BILLING_RISK` alert
3. Emit Socket.IO `benefit:period:status:changed` to `location:{id}` room

Add 6 alert type values to `alert_type_enum`:
`RECERT_DUE`, `RECERT_AT_RISK`, `RECERT_PAST_DUE`, `F2F_DUE_SOON`, `F2F_MISSING`, `BENEFIT_PERIOD_BILLING_RISK`

---

### Physician-routing event hooks (consumed by T3-2b + T3-9)

When `deriveStatuses` transitions a period to `recert_due`/`at_risk`, or updates `f2fStatus` to `due_soon`/`missing`, the BullMQ worker emits two additional Socket.IO events (alongside the alert upsert):

```typescript
// Add both to shared-types/src/socket.ts
interface BenefitPeriodRecertTaskPayload {
  event: 'benefit:period:recert_task';
  periodId: string;
  patientId: string;
  locationId: string;
  periodNumber: number;
  recertDueDate: string;      // ISO date
  severity: 'warning' | 'critical';
}

interface BenefitPeriodF2FTaskPayload {
  event: 'benefit:period:f2f_task';
  periodId: string;
  patientId: string;
  locationId: string;
  periodNumber: number;
  f2fWindowStart: string;     // ISO date
  f2fWindowEnd: string;       // ISO date
  severity: 'warning' | 'critical';
}
```

**Consumers:**
- T3-9 (physician order inbox) subscribes to `benefit:period:recert_task` to auto-create recertification tasks routed to the certifying physician
- T3-2b (F2F validity engine) subscribes to `benefit:period:f2f_task` to surface "Document F2F" deep links in the F2F worklist

Emit to `location:{locationId}` room. No additional DB write — the alert row already persists the event.

---

### shared-types: `packages/shared-types/src/benefit-period.ts`

```typescript
export type BenefitPeriodStatus =
  | 'current' | 'upcoming' | 'recert_due' | 'at_risk' | 'past_due'
  | 'closed' | 'revoked' | 'transferred_out' | 'concurrent_care' | 'discharged';

export type BenefitPeriodRecertStatus =
  | 'not_yet_due' | 'ready_for_recert' | 'pending_physician' | 'completed' | 'missed';

export type BenefitPeriodF2FStatus =
  | 'not_required' | 'not_yet_due' | 'due_soon' | 'documented' | 'invalid' | 'missing' | 'recert_blocked';

export interface BenefitPeriod { /* all fields */ }
export interface BenefitPeriodDetail extends BenefitPeriod {
  patient: { id: string; name: string };
  noe?: { id: string; status: string; filedAt?: string };
  correctionHistory: CorrectionEntry[];
}
export interface BenefitPeriodTimeline {
  patientId: string;
  admissionType: BenefitPeriodAdmissionType;
  periods: BenefitPeriod[];
  activeAlerts: Alert[];
}
export interface BenefitPeriodListResponse { items: BenefitPeriodDetail[]; total: number; page: number; }
export interface RecalculationPreview {
  previewToken: string;
  expiresAt: string;
  affectedPeriods: Array<{ id: string; field: string; oldValue: unknown; newValue: unknown }>;
}
```

Add to `socket.ts`: `'benefit:period:status:changed'` event.

---

### Frontend modules

**`routes/_authed/benefit-periods/index.tsx` — Benefit Period Manager**
- Three operational queue tabs: **Recert Upcoming** / **At Risk** / **Past Due**
- Each row: patient name, period number, start/end, status badge, F2F indicator, billingRisk badge, "Open" link → detail drawer
- Location-wide summary widgets (counts per status)
- Accessible from main nav (Compliance section)

**`components/BenefitPeriodTimeline.tsx`** — reusable in `$patientId.tsx`
- Horizontal timeline cards per period
- Color-coded status: green (current/closed), amber (recert_due/at_risk), red (past_due/revoked)
- F2F chip: `F2F missing` (red) / `F2F due soon` (amber) / `F2F documented` (green) / `F2F invalid` (red) / `not required` (gray)
- Transfer indicator on inherited periods
- Concurrent care band overlay when active
- Click → `PeriodDetailDrawer`

**`components/PeriodDetailDrawer.tsx`**
- Period number, dates, length, status
- Recertification section: due date, status, physician, completedAt
- F2F section: required flag, status, window dates, documented date, provider
- NOE link (opens T3-2a workbench)
- Billing risk banner with reason
- Correction History accordion (from `correctionHistory` JSONB)
- Action buttons: "Set as Reporting Period", "Record Recertification", "Correct Period" (triggers preview modal)

**`components/RecalculationPreviewModal.tsx`**
- Shows diff table (field / old value / new value) for all affected periods
- "Confirm" button commits via previewToken
- Expires-in countdown

**`routes/_authed/compliance/recert-queue.tsx`** — Recertifications Due report
- Sortable by due date, filterable by status/location
- Deep link to "Record Recertification" on each row — opens `PeriodDetailDrawer` with the recertification form pre-expanded for that period

**`components/BenefitPeriodRiskWidget.tsx`** — main ops dashboard summary card
- Counts of `at_risk` + `past_due` periods for the active location
- CTA: "View All" → Benefit Period Manager filtered to at-risk/past-due
- Live updates via `benefit:period:status:changed` Socket.IO event
- Slot alongside HOPE and compliance alert widgets in the main ops dashboard

---

### TypeBox validators (add to `typebox-compiler.ts`)

`BenefitPeriodListQuery`, `BenefitPeriodResponse`, `BenefitPeriodDetailResponse`,
`BenefitPeriodTimelineResponse`, `SetReportingPeriodBody`, `RecalculationPreviewResponse`,
`CommitRecalculationBody`, `RecertifyBody`, `CorrectPeriodBody`, `BenefitPeriodListResponse`
(10 validators)

---

**Done when:**
- Period 3 transition blocks recertification when `f2fStatus` is `missing` or `recert_blocked`
- H→H transfer initializes with inherited periodNumber and `isTransferDerived=true`
- Downstream recalculation preview shows correct diff; commit writes `correctionHistory` entries
- `isReportingPeriod` partial unique index enforced (only one per patient)
- BullMQ job transitions `recert_due → at_risk → past_due` and upserts the correct alert types
- `billingRisk=true` surfaces on T3-12 pre-submission audit (flag only; claim blocking in T3-7a/T3-12)
- 14-day F2F window computed as [recertDueDate − 30d, recertDueDate) per 42 CFR §418.22
- `recert-queue.tsx` "Record Recertification" deep link opens `PeriodDetailDrawer` with the recertification form pre-expanded
- `BenefitPeriodRiskWidget` renders correct at-risk/past-due counts and updates live via Socket.IO
- `benefit:period:recert_task` and `benefit:period:f2f_task` Socket.IO events emitted and typed in `shared-types/src/socket.ts`
- All status transitions tested in unit + integration tests

---

## T3-5 · Electronic Signatures `HIGH`

> Upgraded from MEDIUM based on competitive analysis (Axxess/WellSky/FireNote). Market-credible e-signature requires workflow management, multi-party signing, and downstream controls — not just a single signing endpoint.

`read:` `docs/qa/ELECTRONIC_SIGNATURE_COMPETITIVE_ANALYSIS.md`

### DB migrations

**`signature_requests`** — workflow tracking:
```typescript
{
  id: uuid PK;
  locationId: uuid FK;   // RLS
  patientId: uuid FK;
  documentType: 'encounter' | 'order' | 'recertification' | 'f2f' | 'idg_record' | 'consent' | 'care_plan';
  documentId: uuid;
  status: signature_request_status;  // 10-state machine
  requireCountersign: boolean;
  requirePatientSignature: boolean;
  requireSignatureTime: boolean;
  allowGrouping: boolean;
  deliveryMethod: 'portal' | 'fax' | 'mail' | 'courier';
  contentHash: varchar(64);  // SHA-256
  priorRevisionHash: varchar(64);
  exceptionType?: 'NO_SIGNATURE_REQUIRED' | 'PATIENT_UNABLE_TO_SIGN' | 'PHYSICIAN_UNAVAILABLE';
  requestedBy: uuid FK;
  createdAt: timestamptz;
  updatedAt: timestamptz;
}
```

**`electronic_signatures`** — individual signer records:
```typescript
{
  id: uuid PK;
  signatureRequestId: uuid FK;
  signerType: 'CLINICIAN' | 'PHYSICIAN' | 'PATIENT' | 'REPRESENTATIVE' | 'AGENCY_REP';
  signerName: string;
  signerLegalName?: string;
  signerNpi?: string;
  attestationText: string;
  attestationAccepted: boolean;
  documentedSignedAt?: timestamptz;  // user-reported time
  signedAt: timestamptz;             // system time
  ipAddress?: inet;
  userAgent?: string;
  signatureData?: text;  // base64 image (for stylus/finger capture)
  typedName?: string;
  contentHashAtSign: varchar(64);
  signatureHash: varchar(64);  // tamper-evident
  representativeRelationship?: string;
  patientUnableReason?: string;
  countersignsSignatureId?: uuid FK;  // countersign chain
}
```

**`signature_events`** — append-only audit log

All tables: RLS policies (`location_read`, `location_insert`, `location_update`).

### Signature State Machine (10 states)

```
DRAFT → READY_FOR_SIGNATURE → SENT_FOR_SIGNATURE → VIEWED → PARTIALLY_SIGNED → SIGNED
                                    ↓                    ↓
                              REJECTED ←──────────────────┘
                                    ↓
                              VOIDED / NO_SIGNATURE_REQUIRED / EXPIRED
```

### SignatureService methods

- `createSignatureRequest()` — checks for existing active request (409 if duplicate)
- `sendForSignature()` — transitions to SENT_FOR_SIGNATURE
- `markViewed()` — transitions to VIEWED
- `signDocument()` — adds signature record; transitions to PARTIALLY_SIGNED or SIGNED
- `countersignDocument()` — agency rep countersign
- `rejectSignature()` — transitions to REJECTED
- `voidSignature()` — transitions to VOIDED (not allowed from SIGNED)
- `markNoSignatureRequired()` — exception handling
- `verifySignature()` — cryptographic verification (content hash + signature hash)
- `listSignatures()` — filterable list
- `getOutstandingSignatures()` — workbench data (pending/sent/overdue/exception queues)

### Routes

- `POST /api/v1/signatures` — create request
- `GET /api/v1/signatures` — list with filters
- `GET /api/v1/signatures/outstanding` — workbench queues
- `GET /api/v1/signatures/:id` — get request with signatures and events
- `POST /api/v1/signatures/:id/send` — send for signature
- `POST /api/v1/signatures/:id/viewed` — mark as viewed
- `POST /api/v1/signatures/:id/sign` — sign document
- `POST /api/v1/signatures/:id/countersign` — add countersignature
- `POST /api/v1/signatures/:id/reject` — reject signature
- `POST /api/v1/signatures/:id/void` — void request
- `POST /api/v1/signatures/:id/exception` — mark no-signature-required
- `GET /api/v1/signatures/verify/:signatureId` — verify signature integrity

### Socket.IO events

Add to `shared-types/src/socket.ts`:
- `signature:requested` — new signature request created
- `signature:completed` — document fully signed
- `signature:rejected` — signature rejected
- `signature:overdue` — signature past expiration

### Frontend

**`functions/signature.functions.ts`** — 12 server functions (create, send, sign, countersign, reject, void, exception, verify, list, outstanding, get, mark viewed)

**`/signatures` route** — Signature Workbench:
- 5-tab view: All / Pending / Sent / Overdue / Partially Signed
- Signature cards with status badges, patient link, document type, days outstanding
- Send/Void actions
- Summary counts (overdue, pending)

### Audit requirements

Every mutation writes to `audit_logs`:
- `SIGNATURE_REQUEST_CREATED`
- `SIGNATURE_REQUEST_SENT`
- `DOCUMENT_SIGNED` (includes contentHash, signatureHash)
- `SIGNATURE_REQUEST_REJECTED`
- `SIGNATURE_REQUEST_VOIDED`
- `SIGNATURE_EXCEPTION_MARKED`

### Verification

The `verifySignature()` service method:
1. Recomputes content hash and compares to `contentHashAtSign`
2. Recomputes signature hash and compares to stored `signatureHash`
3. Returns `{ isValid, contentHashMatch, signatureHashMatch, message }`

**Done when:** 
- Signed content is cryptographically verifiable via `GET /api/v1/signatures/verify/:id`
- Already-signed documents reject re-sign with 409
- Outstanding signatures trackable by status and age (pending/sent/overdue/exception queues)
- Consents support patient/representative/agency signatures
- Orders route to physician signature queue via T3-9 integration
- Note-review-approved artifacts lock only after successful signature
- RLS enforces location isolation

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

## T3-7a · Hospice Claim Lifecycle + 837i Generation `HIGH`

> Own session. Requires clearinghouse enrollment (see ⚡ Immediate Actions in MASTER_PROMPT.md). T3-7b depends on this task.

`read:` `BE-SPEC` §Phase 4, `DB-ARCH`

> ⚠️ Market entry blocker. T3-7b and T3-12 both depend on this task.

### DB migrations

Tables + RLS for all:

**`claims`**
```typescript
{
  id: uuid PK;
  patientId: uuid FK;
  locationId: uuid FK;      // RLS
  payerId: string;
  benefitPeriodId: uuid FK; // T3-4
  billType: string;         // 8X1 original | 8X7 replacement | 8X8 void
  statementFromDate: date;
  statementToDate: date;
  totalCharge: numeric;
  state: claim_state enum;  // see state machine below
  isOnHold: boolean default false;
  correctedFromId: uuid FK → self | null;  // replacement/void lineage
  payloadHash: text;        // SHA-256 of canonical claim JSON before X12 encoding
  x12Hash: text | null;     // SHA-256 of generated 837i transaction set
  createdBy: uuid FK;
  createdAt: timestamptz;
  updatedAt: timestamptz;
}
```

**`claim_revisions`** — append-only snapshot per state transition
**`claim_submissions`** — one row per clearinghouse submission attempt (batch ID, timestamp, clearinghouse response code)
**`claim_rejections`** — rejection detail from clearinghouse (loop/segment, error code, description)
**`bill_holds`** — one active hold per claim (reason, placed by, placed at, released by, released at, note)

**`claim_state` enum:**
`DRAFT` | `NOT_READY` | `READY_FOR_AUDIT` | `AUDIT_FAILED` | `READY_TO_SUBMIT` | `QUEUED` | `SUBMITTED` | `ACCEPTED` | `REJECTED` | `DENIED` | `PAID` | `VOIDED`

### TypeBox schemas

- `ClaimSchema` · `ClaimLineSchema` · `ClaimRevisionSchema`
- `ClaimSubmissionSchema` · `ClaimRejectionSchema` · `BillHoldSchema`
- `CreateClaimBodySchema` · `ClaimListQuerySchema` · `ClaimDetailResponseSchema`
- `HoldBodySchema` · `ReplaceClaimBodySchema`

### Readiness engine (`claimReadiness.service.ts`)

Runs on `POST /api/v1/claims` and again when transitioning to `READY_FOR_AUDIT`. Returns `{ ready: boolean; blockers: string[] }`. Blocks submission if any blocker present:

- Benefit period valid and not past-due (T3-4 `billingRisk` flag)
- NOE accepted and `isClaimBlocking = false` (T3-2a)
- Required visits completed per frequency plan for period (T2-10)
- Required orders and certifications signed (T3-5)
- F2F documented if period 3+ (T3-2b `f2fStatus`)
- No active `HARD_BLOCK` compliance alerts on patient (T2-8)
- Claim not on manual bill hold

### 837i generation (`x12.service.ts`)

- UB-04 aligned institutional claim model
- Original claim (bill type 8X1)
- Replacement claim (8X7) — links `correctedFromId` + prior claim ICN in Loop 2300 REF
- Void claim (8X8) — links `correctedFromId`
- `payloadHash` and `x12Hash` written to claim row on generation
- Export endpoint: signed download of raw 837i transaction set

### BullMQ

- `claim-submission` queue (3 retries, exponential backoff 2s)
- DLQ promotion on exhausted retries → `CLAIM_SUBMISSION_FAILED` alert + Socket.IO `claim:submission:failed`
- Clearinghouse transport metadata captured per `ClaimSubmission` row

### Workbench routes (`billing.routes.ts`)

- `POST /api/v1/claims` — generate claim (runs readiness check; returns NOT_READY detail if blocked)
- `GET /api/v1/claims` — list/filter by state, payer, date range, hold status
- `GET /api/v1/claims/:id` — claim detail + revision history + latest audit snapshot
- `POST /api/v1/claims/:id/audit` — trigger pre-submission audit (calls T3-12 rules engine)
- `POST /api/v1/claims/submit` — bulk submit (array of IDs; must be READY_TO_SUBMIT)
- `POST /api/v1/claims/:id/hold` — manual hold with reason code
- `POST /api/v1/claims/:id/unhold`
- `POST /api/v1/claims/:id/replace` — replacement claim; creates new claim linked via `correctedFromId`
- `POST /api/v1/claims/:id/void`
- `POST /api/v1/claims/:id/retry` — retry REJECTED claim (re-runs readiness + audit)
- `GET /api/v1/claims/:id/download` — signed 837i file download

**Done when:** Claim generation supports original/replacement/void flows; readiness check blocks NOT_READY claims with specific blocker detail; 837i validates against X12 validator; `payloadHash` and `x12Hash` written; BullMQ submission queue + DLQ path tested; manual hold prevents submission; bulk submit accepted for READY_TO_SUBMIT claims; clearinghouse response captured per ClaimSubmission row; Socket.IO `claim:state:changed` event fires on each transition.

---

## T3-7b · ERA 835 + Remittance Reconciliation + Denial Management `HIGH`

> Own session. Depends on T3-7a (claims).

`needs:` T3-7a (claims), T1-6 (BullMQ), T1-8 (Socket.IO)

### DB migrations

**`remittances_835`** — one row per 835 file/batch (payer, check number, payment date, raw file hash, ingested at, status)

**`remittance_postings`** — one row per matched CLP/SVC loop (remittance ID, claimId FK, paid amount, adjustment reason codes, contractual/patient responsibility amounts, posting state)

**`unmatched_remittances`** — exception queue for manual resolution (remittance ID, raw CLP data, match attempt details, assigned to, resolved at)

### TypeBox schemas

- `Remittance835Schema` · `RemittancePostingSchema` · `UnmatchedRemittanceSchema`
- `IngestERABodySchema` · `ManualMatchBodySchema`

### ERA ingestion service (`era835.service.ts`)

**Parse 835:** payer, check/EFT number, payment date, CLP loops (claim ICN, patient control number, payer claim number), SVC loops (service line adjustments, reason codes).

**Auto-match strategy (in order):**
1. ICN match — clearinghouse claim control number vs `claim_submissions.clearinghouseClaimId`
2. Patient Medicare ID + statement dates match

**Auto-post threshold:** if match confidence = exact ICN match → auto-post. Partial match → route to `unmatched_remittances`.

**Auto-post action:**
- Write `RemittancePosting` rows (one per SVC)
- Transition claim state: if payment covers balance → `PAID`; if adjustment-only → stay `ACCEPTED` with posting note
- Emit `claim:remittance:posted` Socket.IO event

**Exception queue:** unmatched or ambiguous items → `unmatched_remittances` + `UNMATCHED_ERA` alert + `claim:remittance:unmatched` event

### BullMQ

- `era-ingestion` queue (triggered by clearinghouse webhook or file drop endpoint)
- `era-reconciliation` daily scan (0 7 * * *) — flags remittances ingested >48h ago with no posting action

### Routes

- `POST /api/v1/remittances/ingest` — clearinghouse webhook endpoint; validates signature header
- `GET /api/v1/remittances` — list 835 batches (filterable by payer, date, posting status)
- `GET /api/v1/remittances/:id` — batch detail + all posting rows + unmatched items
- `GET /api/v1/remittances/unmatched` — exception queue with aging
- `POST /api/v1/remittances/unmatched/:id/match` — manual match to claim ID
- `POST /api/v1/remittances/unmatched/:id/post` — manual post after match
- `GET /api/v1/claims/:id/remittance` — all postings for a specific claim

**Done when:** 835 file ingested and parsed; ICN-matched claims auto-posted to PAID; unmatched items surface in exception queue with UNMATCHED_ERA alert; manual match + post workflow completes and transitions claim; daily reconciliation scan flags stale unposted remittances; remittance view on claim detail shows payment/adjustment breakdown.

---

## T3-8 · Vendor Governance + BAA Registry + Security Hardening `HIGH`

> **Why HIGH:** Missing BAAs are an immediate HIPAA audit failure. Runtime hardening gaps (MFA optional, no enforced idle timeout) are live security risks. Markdown-only registry drifts; this task replaces it with a persistent, alert-driven governance system.

`read:` `docs/architecture/security-model.md`, `backend/docs/BACKEND_STRUCTURE.md`

---

### DB Migrations

Create `000X_vendor_governance.sql`:

**`vendors`** — persistent BAA and vendor-risk registry:
```typescript
{
  id: uuid PK;
  locationId: uuid FK;           // RLS anchor — org-level vendors use default location
  vendorName: string;
  serviceCategory: 'INFRASTRUCTURE' | 'CLINICAL' | 'BILLING' | 'COMMUNICATION'
                 | 'AI_ML' | 'IDENTITY' | 'STORAGE' | 'MONITORING' | 'OTHER';
  description: string;
  phiExposureLevel: 'NONE' | 'INDIRECT' | 'DIRECT' | 'STORES_PHI';
  transmitsPhi: boolean;
  storesPhi: boolean;
  subprocessor: boolean;         // processes PHI on behalf of Hospici
  baaRequired: boolean;
  baaStatus: 'SIGNED' | 'PENDING' | 'NOT_REQUIRED' | 'EXPIRED' | 'SUSPENDED';
  baaEffectiveDate?: date;
  baaRenewalDate?: date;
  contractOwnerUserId?: uuid FK → users.id;
  securityOwnerUserId?: uuid FK → users.id;
  securityReviewDate?: date;     // date of last security review
  securityReviewDueDate?: date;  // next review due
  incidentContact?: string;      // vendor security contact email/phone
  dataResidency?: string;        // e.g. "US-East-1", "EU"
  exitPlan?: string;             // brief description of migration plan
  notes?: string;
  isActive: boolean DEFAULT true;
  createdAt: timestamptz;
  updatedAt: timestamptz;
}
```

**`vendor_reviews`** — append-only review log:
```typescript
{
  id: uuid PK;
  vendorId: uuid FK → vendors.id;
  reviewedByUserId: uuid FK → users.id;
  reviewDate: date;
  outcome: 'APPROVED' | 'APPROVED_WITH_CONDITIONS' | 'SUSPENDED' | 'TERMINATED';
  baaStatusAtReview: baa_status enum;
  notes?: string;
  createdAt: timestamptz;
}
```

RLS on both tables: `compliance_officer` and `super_admin` can manage; `admin` read-only.

Add `baa_status` pg enum: `SIGNED | PENDING | NOT_REQUIRED | EXPIRED | SUSPENDED`
Add `vendor_service_category` pg enum (values above)
Add `phi_exposure_level` pg enum (values above)

---

### shared-types additions

`packages/shared-types/src/vendors.ts`:
```typescript
// TypeBox schemas: VendorSchema, VendorReviewSchema, CreateVendorSchema, UpdateVendorSchema
// Enums: BaaStatus, VendorServiceCategory, PhiExposureLevel
```

`packages/shared-types/src/alerts.ts` — add alert types:
```typescript
'BAA_EXPIRING'           // BAA renewal within 90 days
'BAA_MISSING'            // baaRequired=true but baaStatus != SIGNED
'SECURITY_REVIEW_OVERDUE' // securityReviewDueDate passed
```

---

### Backend bounded context: `backend/src/contexts/vendors/`

**Routes:**
- `GET /api/v1/vendors` — list with filters: `?status=EXPIRED&category=CLINICAL&phiExposure=STORES_PHI`
- `POST /api/v1/vendors` — create vendor record
- `GET /api/v1/vendors/:id` — vendor detail with reviews
- `PATCH /api/v1/vendors/:id` — update vendor
- `POST /api/v1/vendors/:id/reviews` — append review record
- `GET /api/v1/vendors/expiring` — BAAs expiring within 30/60/90 days (query param `?within=90`)
- `GET /api/v1/vendors/missing-baas` — `baaRequired=true` and `baaStatus != SIGNED`

Roles: `compliance_officer` + `super_admin` can write; `admin` read-only.

**BullMQ job `vendor-compliance-check`** (weekly cron):
- Scan for `baaRenewalDate` within 90 days → create `BAA_EXPIRING` alert
- Scan for `baaRequired=true AND baaStatus != SIGNED` → create `BAA_MISSING` alert
- Scan for `securityReviewDueDate < now()` → create `SECURITY_REVIEW_OVERDUE` alert
- Deduplicate: don't re-create alert if open alert of same type+vendor already exists

---

### Security Hardening Checklist (runtime verification, not docs)

Each item below must be verified in code and tested — not just documented:

1. **MFA enforcement** — `auth.config.ts` must reject login for `compliance_officer` / `super_admin` / `admin` roles if TOTP is not enrolled; return `403 MFA_REQUIRED` with enrollment redirect hint
2. **Idle timeout** — Fastify session plugin enforces 30-minute inactivity expiry server-side; test: request after 30-min idle returns `401 SESSION_EXPIRED`
3. **Session expiry warning** — BullMQ or server-sent event emits `session:expiring` to Socket.IO at 25-minute mark (5-minute warning)
4. **Audit log append-only** — add Postgres trigger `BEFORE UPDATE OR DELETE ON audit_logs → RAISE EXCEPTION` to enforce immutability; test: direct UPDATE returns error
5. **PHI encryption verification** — add health-check endpoint `GET /api/v1/health/phi-encryption` (internal only, no auth, 127.0.0.1 only) that encrypts+decrypts a known test string and returns pass/fail

---

### Docs (generated from registry, not standalone)

- `docs/security/key-rotation.md` — schedule, responsible party, procedure for: JWT signing secret, database encryption key, session secret, API keys
- `docs/security/incident-response.md` — HIPAA Breach Notification Rule timeline (60-day), contact chain, containment steps, CMS notification procedure
- Seed script `backend/src/seeds/vendor-seed.ts` — pre-populate all known PHI-touching vendors (Valkey host, SMTP, hosting, backup/DR, clearinghouse, OpenFDA, Claude/Anthropic, DoseSpot) with correct `baaRequired` and initial `baaStatus` values

> Note on Claude/Anthropic: document explicitly that PHI is stripped before API calls (per T2-7). `baaRequired: true`, `phiExposureLevel: INDIRECT`, `storesPhi: false`.

---

### Frontend routes

- `/settings/baa` — vendor registry table (filter by status, category, PHI exposure); shows expiring/missing BAA counts in header
- `/settings/baa/new` — create vendor form
- `/settings/baa/:id` — vendor detail: fields + review history timeline + "Add Review" button
- BAA alerts surface in the existing alert dashboard (T1-8 pattern)

---

**Done when:** All PHI-touching vendors in the deployed stack have a DB record with owner, BAA status, and review date; expiring and missing BAAs produce visible alerts in the compliance dashboard; MFA is enforced (non-bypassable) for privileged roles; 30-minute idle timeout returns `SESSION_EXPIRED`; audit log immutability is tested with a direct-write rejection; key rotation and incident response procedures are documented

---

## T3-9 · Physician order inbox + paperless order routing `HIGH`

> Upgraded from MEDIUM based on competitor research (2026-03-13) — see `docs/qa/PHYSICIAN_ORDER_INBOX_COMPETITIVE_ANALYSIS.md`. Axxess, WellSky, and FireNote confirm that a simple sign/reject queue is not competitive. This replaces the minimal 4-route spec with a full physician work-queue service.

`needs:` T3-5 (e-signatures), T1-6 (BullMQ), T1-8 (Socket.IO), T3-2b (orders table bootstrap + F2F task routing)

`read:` `BE-SPEC`, `DB-ARCH`, `backend/src/contexts/f2f/` (T3-2b F2F routing pattern), `backend/src/contexts/billing/` (T3-7a claim readiness — unsigned orders feed SIGNED_ORDERS_AND_PLAN_OF_CARE rule)

---

### Context + Architecture Boundary

**T3-5 owns:** signature request records, attestation, countersign, verification, signature state machine.

**T3-9 owns:** physician work queue, task routing, order/task metadata, reminders, due dates, rerouting, work-item lifecycle, exception handling.

This keeps inbox orchestration separate from the legal signature engine — the same clean split used between T3-7a (claim lifecycle) and T3-12 (audit rules).

**Bounded context:** `backend/src/contexts/orders/` (partially exists from T3-2b — add `order.service.ts` + `order.routes.ts`)

---

### DB Migration

> **Table bootstrap note:** The `orders` table and its pg enums (`order_status_enum`, `order_type_enum`, `provider_role_enum`, `encounter_setting_enum`) were created in **T3-2b migration 0018**. Do NOT re-create them.

**Migration: extend `order_status_enum`** (ALTER TYPE … ADD VALUE) to add the missing states:

Current values (from T3-2b): `PENDING_SIGNATURE | SIGNED | REJECTED | EXPIRED`

Add:
```sql
ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'VIEWED';
ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'VOIDED';
ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'NO_SIGNATURE_REQUIRED';
ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'COMPLETED_RETURNED';
```

Full state set after migration:
```
DRAFT → PENDING_SIGNATURE → VIEWED → SIGNED
                        ↘ REJECTED
                        ↘ EXPIRED (system)
                        ↘ VOIDED (admin override)
                        ↘ NO_SIGNATURE_REQUIRED (exception)
SIGNED → COMPLETED_RETURNED (after signed doc confirmed in chart)
```

**Migration: extend `orders` table** (ALTER TABLE … ADD COLUMN) — add missing metadata columns:

```typescript
{
  // existing columns from T3-2b — do not touch
  // new columns:
  verbalReadBackFlag: boolean;          // CMS verbal-order read-back compliance
  verbalReadBackAt?: timestamptz;       // when read-back was confirmed
  deliveryMethod?: 'PORTAL' | 'FAX' | 'MAIL' | 'COURIER';  // physician delivery preference (fax gateway deferred T4)
  urgencyReason?: string;               // human-readable explanation of due date source
  linkedSignatureRequestId?: uuid FK → signature_requests.id;  // T3-5 linkage
  groupBundleId?: uuid;                 // optional: group multiple orders for one physician signature session
  noSignatureReason?: string;           // required when status = NO_SIGNATURE_REQUIRED
  voidedAt?: timestamptz;
  voidedByUserId?: uuid FK → users.id;
  completedReturnedAt?: timestamptz;    // when signed doc confirmed in chart
  reminderCount: integer DEFAULT 0;     // how many reminders sent
  lastReminderAt?: timestamptz;
}
```

RLS: `location_read` + `location_insert` + `location_update` (already in place from T3-2b — no change needed).

---

### TypeBox Schemas

Add to `packages/shared-types/src/orders.ts` (new file) + compile in `typebox-compiler.ts`:

- `OrderStatusSchema` — enum of all 9 states
- `OrderTypeSchema` — enum of all 5 types
- `CreateOrderBodySchema` — clinician input: `{ type, patientId, physicianId, content, dueAt, verbalReadBackFlag?, deliveryMethod? }`
- `OrderResponseSchema` — full order shape (mirrors DB, camelCase) with `urgencyLabel` + `blockedDownstream` computed fields
- `OrderInboxResponseSchema` — paginated list with `{ pending, overdue, rejected, exceptions, completed }` counts
- `SignOrderBodySchema` — `{ linkedSignatureRequestId? }` (T3-5 hook)
- `RejectOrderBodySchema` — `{ rejectionReason: string }`
- `ExceptionOrderBodySchema` — `{ noSignatureReason: string }`
- `ResendOrderBodySchema` — `{ deliveryMethod?: DeliveryMethod; physicianId?: uuid }` (reroute)

---

### State Machine (valid transitions)

```
DRAFT            → PENDING_SIGNATURE (clinician submits)
PENDING_SIGNATURE→ VIEWED (physician opens)
PENDING_SIGNATURE→ SIGNED (direct sign without view — allowed)
PENDING_SIGNATURE→ REJECTED
PENDING_SIGNATURE→ EXPIRED (system, BullMQ)
PENDING_SIGNATURE→ VOIDED (admin/supervisor only)
PENDING_SIGNATURE→ NO_SIGNATURE_REQUIRED (supervisor/admin only)
VIEWED           → SIGNED
VIEWED           → REJECTED
VIEWED           → VOIDED
SIGNED           → COMPLETED_RETURNED (after chart confirmation)
```

Invalid transition attempts → 422 + `ORDER_INVALID_TRANSITION` error code.

---

### Service: `OrderService`

Methods:
- `createOrder(input)` — insert row, auto-set `urgencyReason` based on type (verbal = "72h CMS window", DME = "delivery coordination", F2F = "recert blocking"), emit `order:created`
- `getInbox(physicianId, filters)` — paginated by status group, includes `blockedDownstream` message computed from T3-7a + T3-12 readiness flags
- `getOrder(id)` — detail with linked signature request (T3-5) and linked F2F encounter (T3-2b) if applicable
- `markViewed(id)` — PENDING_SIGNATURE → VIEWED, emit `order:viewed`
- `signOrder(id, linkedSignatureRequestId?)` — → SIGNED, emit `order:signed`, upsert `SIGNED_ORDERS_AND_PLAN_OF_CARE` resolution hint to T3-12 rule
- `rejectOrder(id, reason)` — → REJECTED, emit `order:rejected`
- `voidOrder(id, supervisorUserId)` — supervisor/admin only → VOIDED
- `markNoSignatureRequired(id, reason, supervisorUserId)` — supervisor/admin only → NO_SIGNATURE_REQUIRED, emit `order:exception`
- `resendOrder(id, input)` — reroute to different physician or change delivery method, reset reminder count
- `markReturnedToChart(id)` — SIGNED → COMPLETED_RETURNED, emit `order:completed_returned`
- `listOverdue()` — all PENDING_SIGNATURE/VIEWED past `dueAt`, used by BullMQ worker + dashboard
- `getPatientOrders(patientId)` — all orders for patient orders tab

---

### Routes

```
POST   /api/v1/orders                         clinician creates order
GET    /api/v1/orders/inbox                   physician inbox (pending + overdue groups)
GET    /api/v1/orders/overdue                 overdue list (supervisor / billing view)
GET    /api/v1/orders/:id                     order detail
POST   /api/v1/orders/:id/viewed             mark viewed (physician)
POST   /api/v1/orders/:id/sign               sign
POST   /api/v1/orders/:id/reject             reject
POST   /api/v1/orders/:id/void               void (supervisor/admin)
POST   /api/v1/orders/:id/exception          mark no-signature-required (supervisor/admin)
POST   /api/v1/orders/:id/resend             resend / reroute
POST   /api/v1/orders/:id/returned           mark completed-returned (clinician/admin)
GET    /api/v1/patients/:patientId/orders    patient orders tab
```

---

### BullMQ Workers

**`order-expiry-check` worker** (daily 07:00 UTC, replaces stub):
- Query all PENDING_SIGNATURE + VIEWED orders where `dueAt < now + 12h`
- For verbals: Socket.IO `order:expiring` to physician session with `{ hoursRemaining, blockedDownstream }`
- At `dueAt`: transition to EXPIRED, upsert `ORDER_EXPIRY` compliance alert, emit `order:expired`
- For SIGNED orders older than 7 days without COMPLETED_RETURNED: emit `order:return:overdue` reminder

**`order-reminder` worker** (daily 09:00 UTC):
- Query PENDING_SIGNATURE orders where `reminderCount < 3` and `lastReminderAt < now - 24h`
- Increment `reminderCount`, set `lastReminderAt`, emit `order:reminder` Socket.IO event to physician

---

### Socket.IO Events

Add to `socket.ts`:
```
order:created          { orderId, type, patientId, physicianId, dueAt, urgencyReason }
order:viewed           { orderId, physicianId }
order:signed           { orderId, signedAt }
order:rejected         { orderId, rejectionReason }
order:expired          { orderId, type, patientId }
order:overdue          { orderId, hoursOverdue, blockedDownstream }
order:expiring         { orderId, hoursRemaining, blockedDownstream }
order:exception        { orderId, noSignatureReason }
order:completed_returned { orderId, completedReturnedAt }
order:f2f:required     (already exists from T3-2b — no change)
```

---

### Frontend

**Physician Inbox** (`/orders/inbox`):
- Tabs: Pending | Overdue | Rejected | Exceptions | Completed
- Each order card shows: patient name, order type badge, due date, urgency pill (green/yellow/red based on hours remaining), `blockedDownstream` message in amber banner when applicable
- Actions per card: View, Sign (opens T3-5 signature drawer), Reject, Mark No-Sig-Required (supervisor only)
- Overdue tab: `order:overdue` Socket.IO badge updates in real-time

**Patient Orders Tab** (`/patients/:patientId/orders`):
- List of all orders for the patient across all statuses
- Group-bundle view: multiple orders with same `groupBundleId` displayed together with "Sign all" CTA (stretch goal)
- "Create Order" button: type selector → clinician order form with verbal read-back checkbox

**Urgency label logic** (shared utility, `frontend/src/lib/order-urgency.ts`):
```
> 48h remaining → "Due soon"    (green)
12–48h remaining → "Urgent"     (amber)
< 12h remaining  → "Critical"   (red)
overdue          → "Overdue"    (red, flashing)
```

**`blockedDownstream` message** — computed server-side in `getInbox`:
- If claim readiness check `SIGNED_ORDERS_AND_PLAN_OF_CARE` would BLOCK → "Claim billing blocked until signed"
- If F2F documentation pending and order is F2F_DOCUMENTATION type → "Recertification blocked"
- Otherwise: null (no banner)

---

### Downstream Integration Points

| System | Integration |
|--------|-------------|
| T3-5 | `linkedSignatureRequestId` FK; sign route creates or links existing signature request |
| T3-2b | F2F orders created here use same `orders` table; physician inbox shows F2F tasks |
| T3-12 | `SIGNED_ORDERS_AND_PLAN_OF_CARE` rule queries orders table for unsigned verbals |
| T3-7a | Claim readiness `UNSIGNED_ORDERS` check (currently stub) resolved by this service |
| T3-13 | Chart completeness queries `orders` for unsigned-order indicators |

---

### Done When

- Physician sees all pending routed work (verbal, DME, frequency change, medication, F2F) in one inbox
- Remote signing works via T3-5 integration without requiring full clinical navigation
- 9-state machine enforced with validated transitions; invalid transitions return 422
- Overdue/expired states surface in inbox with `blockedDownstream` messaging
- `No Signature Required` exception supported (supervisor/admin only)
- Verbal read-back flag captured at order creation
- Signed orders transition to COMPLETED_RETURNED on chart confirmation
- `SIGNED_ORDERS_AND_PLAN_OF_CARE` T3-12 rule + T3-7a `UNSIGNED_ORDERS` stub resolved against live orders data
- BullMQ expiry + reminder workers fire correctly; Socket.IO events delivered to physician session
- Contract tests cover all routes; 0 TS errors

---

## T3-10 · ADR / TPE / Survey Record Packet Export `HIGH`

> Upgraded from MEDIUM based on competitor research (2026-03-12). Agencies need a complete, packaged, downloadable audit record within minutes of CMS ADR/TPE requests or survey arrival. Current wording was operationally thin — this replaces it with a full packet-export lifecycle.

`needs:` T3-5 (signatures/hashing), T2-4 (IDG), T2-5 (care plan), T3-2a (NOE/NOTR)
`optional:` T3-13 (completeness summary — consumed as optional toggle if available)

`read:` `BE-SPEC`, `DB-ARCH`

---

### DB migration

**New table `audit_record_exports`** (Migration 0016 or next available):
```typescript
{
  id: uuid PK;
  patientId: uuid FK → patients.id;
  locationId: uuid FK;              // RLS
  requestedByUserId: uuid FK → users.id;
  purpose: 'ADR' | 'TPE' | 'SURVEY' | 'LEGAL' | 'PAYER_REQUEST';
  status: 'REQUESTED' | 'GENERATING' | 'READY' | 'EXPORTED' | 'FAILED';
  dateRangeFrom: date;
  dateRangeTo: date;
  selectedSections: text[];         // which section keys were requested
  includeAuditLog: boolean;
  includeCompletenessSummary: boolean;
  exportHash: varchar;              // SHA-256 of manifest JSON
  manifestJson: jsonb;              // AuditRecordExportManifest (see below)
  pdfStorageKey: varchar;           // storage path for merged PDF
  zipStorageKey: varchar;           // storage path for section ZIP
  generationStartedAt: timestamptz;
  generationCompletedAt: timestamptz;
  exportedAt: timestamptz;          // set on first download
  errorMessage: text;
  createdAt: timestamptz;
  updatedAt: timestamptz;
}
```

RLS: `location_read` + `location_insert` + `location_update`. Drizzle table definition in `backend/src/db/schema/auditRecordExports.ts`.

---

### TypeBox schemas

Add to `packages/shared-types` or `backend/src/schemas/audit/`:

- **`AuditRecordExportRequestSchema`** — input: `{ patientId, purpose, dateRangeFrom, dateRangeTo, selectedSections, includeAuditLog, includeCompletenessSummary }`
- **`AuditRecordExportSchema`** — full export row shape (mirrors DB, camelCase)
- **`AuditRecordExportManifestSchema`**:
  ```typescript
  {
    exportId: string;
    patientId: string;
    purpose: ExportPurpose;
    requestedAt: string;           // ISO timestamp
    requestedBy: string;           // user display name
    dateRange: { from: string; to: string };
    includedSections: {
      name: string;
      documentCount: number;
      hash: string;                // SHA-256 of section PDF bytes
    }[];
    omittedSections: {
      name: string;
      reason: string;              // e.g. "no records in date range", "not selected"
    }[];
    totalDocuments: number;
    exportHash: string;            // SHA-256 of manifest JSON itself
    generatedAt: string;
  }
  ```
- **`AuditRecordExportSectionSchema`** — enum of valid section keys (see canonical order below)

Compile all four in `backend/src/config/typebox-compiler.ts`.

---

### Routes

New file: `backend/src/contexts/compliance/routes/auditExport.routes.ts`

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| `POST` | `/api/v1/patients/:id/audit-exports` | `super_admin`, `compliance_officer` | Create export request; enqueue BullMQ job; return 202 + `{ exportId }` |
| `GET` | `/api/v1/patients/:id/audit-exports` | `super_admin`, `compliance_officer` | List export history for this patient (paginated, most recent first) |
| `GET` | `/api/v1/patients/:id/audit-exports/:exportId` | `super_admin`, `compliance_officer` | Poll export status; returns full export row including manifest when READY |
| `GET` | `/api/v1/patients/:id/audit-exports/:exportId/download` | `super_admin`, `compliance_officer` | Returns time-limited signed download URL (15-min expiry) for PDF or ZIP; logs `ADR_EXPORT_DOWNLOADED` |

Download query param: `?format=pdf|zip` (default `pdf`).

---

### BullMQ job `audit-record-export`

Queue: `audit-export`

Steps:
1. Mark export row `GENERATING`
2. Assemble sections in **canonical order** (see below) filtering by `dateRangeFrom/To` and `selectedSections`
3. Render each section to PDF
4. Compute SHA-256 of each section PDF bytes
5. Merge all section PDFs into single packet PDF
6. Package section PDFs into ZIP with sub-folders by section name
7. If `includeCompletenessSummary` and T3-13 route is live: fetch `GET /api/v1/patients/:id/chart-audit` and attach as cover-sheet section
8. Build `AuditRecordExportManifest` (counts, hashes, omissions)
9. Store merged PDF + ZIP (local filesystem in dev, configurable storage key in prod)
10. Update export row: `status = READY`, `pdfStorageKey`, `zipStorageKey`, `exportHash`, `manifestJson`, `generationCompletedAt`
11. On error: set `status = FAILED`, `errorMessage`

Performance target: completes within 30s for a 6-month patient record.

---

### Canonical section order

Sections assembled in this order regardless of input:
1. `DEMOGRAPHICS` — patient + admission info
2. `NOE_NOTR` — all filings with status
3. `BENEFIT_PERIODS` — certifications and recertifications
4. `HOPE_ASSESSMENTS` — all HOPE-A, HOPE-UV, HOPE-D
5. `CARE_PLAN` — active and historical
6. `ENCOUNTERS` — visit notes chronological (oldest → newest)
7. `ORDERS` — orders + signatures
8. `IDG` — IDG meeting records
9. `MEDICATIONS_MAR` — active meds + MAR history
10. `CONSENTS` — consents + signature status
11. `AUDIT_LOG` — audit log extract (only if `includeAuditLog = true`)
12. `COMPLETENESS_SUMMARY` — T3-13 readiness report (only if `includeCompletenessSummary = true` and T3-13 is available)

---

### Audit logging

All actions logged in `audit_logs`:
- `ADR_EXPORT_REQUESTED` — on POST; fields: `{ patientId, purpose, dateRange, selectedSections }`
- `ADR_EXPORT_GENERATED` — on job completion; fields: `{ exportId, exportHash, sectionCount, totalDocuments }`
- `ADR_EXPORT_DOWNLOADED` — on download; fields: `{ exportId, format, downloadedByUserId }`
- `ADR_EXPORT_FAILED` — on job failure; fields: `{ exportId, errorMessage }`

---

**Done when:**
- Compliance officer submits export request; status advances `REQUESTED → GENERATING → READY`
- Merged PDF and ZIP both downloadable via signed URL
- Manifest contains per-section document counts and hashes plus omitted-section list with reasons
- Export history route returns previous exports for patient
- Download events logged with `ADR_EXPORT_DOWNLOADED`
- Unauthorized role returns 403 on all routes
- Job completes within 30s for 6-month patient record

---

## T3-11 · QAPI Management + Clinician Quality Scorecards + Deficiency Trends `HIGH`

> Quality Assessment and Performance Improvement — CMS-required quality program. Upgraded MEDIUM → HIGH (2026-03-12) based on competitor research (Axxess/WellSky/FireNote): no competitor publicly exposes clinician-level scorecards at this granularity; Hospici can differentiate. Analytics layer is downstream of `T2-9` review data — does not duplicate it.

`needs:` T2-9 (note review — provides `revision_count`, `first_pass_approved`, `RevisionRequest[]`, `DeficiencyType`, `billingImpact`, `complianceImpact`, `dueBy`, `assignedReviewerId`)

**Boundary with adjacent tasks:**
- `T2-9` owns: note review states, revision requests, deficiency taxonomy, reviewer workflow data
- `T3-11` owns: derived metrics, scorecards, trend reporting, QAPI events and action plans
- `T3-13` owns: checklist templates, chart-level completeness, missing-document indicators

---

### DB migrations

**`qapi_events`** — one row per quality event:
```typescript
{
  id: uuid PK;
  locationId: uuid FK;    // RLS
  eventType: 'ADVERSE_EVENT' | 'NEAR_MISS' | 'COMPLAINT' | 'GRIEVANCE' | 'QUALITY_TREND';
  patientId?: uuid FK → patients.id;
  reportedById: uuid FK → users.id;
  occurredAt: timestamptz;
  description: text;
  rootCauseAnalysis?: text;
  linkedTrendContext?: jsonb;   // { metric: string; value: number; threshold: number } — populated when created from a trend spike
  status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED';
  closedAt?: timestamptz;
  closedById?: uuid FK → users.id;
  closureEvidence?: text;
  createdAt: timestamptz;
  updatedAt: timestamptz;
}
```

**`qapi_action_items`** — child rows (not JSONB array — queryable independently):
```typescript
{
  id: uuid PK;
  eventId: uuid FK → qapi_events.id;
  locationId: uuid FK;    // RLS (denormalized for policy)
  action: text;
  assignedToId: uuid FK → users.id;
  dueDate: date;
  completedAt?: timestamptz;
  completedById?: uuid FK → users.id;
  createdAt: timestamptz;
}
```

RLS on both tables: `location_read`, `location_insert`, `location_update`. Closed QAPI events: `location_update` policy blocks updates where `status = 'CLOSED'` (immutability enforced at DB level).

---

### TypeBox schemas

New file: `backend/src/contexts/qapi/schemas/qapi.schema.ts`

```typescript
QAPIEventTypeSchema       // eventType enum
QAPIEventStatusSchema     // status enum
QAPIActionItemSchema      // action item shape
QAPICreateBodySchema      // POST body
QAPIPatchBodySchema       // PATCH body (cannot patch CLOSED events — 409)
QAPICloseBodySchema       // POST /:id/close body: { closureEvidence: string }
QAPIEventResponseSchema   // response with action items embedded

ClinicianQualityScorecardSchema:
{
  clinicianId: string;
  clinicianName: string;
  discipline: 'RN' | 'SW' | 'CHAPLAIN' | 'THERAPY' | 'AIDE';
  period: { from: string; to: string };
  totalNotes: number;
  firstPassApprovalRate: number;        // % where revision_count = 0
  averageRevisionCount: number;
  medianTurnaroundHours: number;        // submitted_at → approved_at
  overdueReviewRate: number;            // % where finalizedAt > dueBy
  billingImpactRate: number;            // % revisions with billingImpact = true
  complianceImpactRate: number;         // % revisions with complianceImpact = true
  deficiencyBreakdown: Record<DeficiencyType, number>;
  commonDeficiencyTypes: { type: DeficiencyType; count: number }[];  // top 3
  revisionTrend: { week: string; count: number }[];  // rolling 12 weeks
}

DeficiencyTrendPointSchema:
{
  week: string;       // ISO week label e.g. "2026-W10"
  byType: Record<DeficiencyType, number>;
  totalDeficiencies: number;
  firstPassRate: number;
}

DeficiencyTrendReportSchema:
{
  locationId?: string;
  discipline?: string;
  period: { from: string; to: string };
  topDeficiencyTypes: { type: DeficiencyType; count: number }[];
  trend: DeficiencyTrendPoint[];
  branchComparison: { locationId: string; locationName: string; firstPassRate: number; totalDeficiencies: number }[];
  disciplineComparison: { discipline: string; firstPassRate: number; topDeficiency: DeficiencyType }[];
  branchDisciplineMatrix: { locationId: string; discipline: string; firstPassRate: number; deficiencyCount: number }[][];
  reviewerWorkload: { reviewerId: string; reviewerName: string; assigned: number; resolved: number; overdueCount: number }[];
}

QualityOutlierSchema:   // for surface-to-dashboard outlier cards
{
  subjectType: 'CLINICIAN' | 'BRANCH' | 'DISCIPLINE';
  subjectId: string;
  subjectName: string;
  metric: string;
  value: number;
  threshold: number;
  detectedAt: timestamptz;
}
```

Compile all in `typebox-compiler.ts`.

---

### Routes

New files: `backend/src/contexts/qapi/routes/qapi.routes.ts` + `backend/src/contexts/analytics/routes/qualityAnalytics.routes.ts`

**QAPI event lifecycle:**
- `POST /api/v1/qapi/events` — create; `linkedTrendContext` optional (populated when raised from a trend spike in the UI)
- `GET /api/v1/qapi/events` — list; filters: `status`, `eventType`, `locationId`, `from`, `to`
- `PATCH /api/v1/qapi/events/:id` — update description/rootCauseAnalysis/actionItems; 409 if status=CLOSED
- `POST /api/v1/qapi/events/:id/action-items` — add action item
- `PATCH /api/v1/qapi/events/:id/action-items/:itemId` — mark complete
- `POST /api/v1/qapi/events/:id/close` — transition to CLOSED; requires `{ closureEvidence }` body; persists `closedAt`, `closedById`; event becomes immutable at DB level

**Clinician scorecards:**
- `GET /api/v1/analytics/clinician-scorecards` — list all clinicians (summary rows); filters: `locationId`, `discipline`, `from`, `to`; `supervisor` + `admin` roles only
- `GET /api/v1/analytics/clinician-scorecards/:userId` — full scorecard for one clinician

**Deficiency trend reporting:**
- `GET /api/v1/analytics/deficiency-trends` — full trend report; filters: `locationId`, `discipline`, `from`, `to`, `deficiencyType`; returns branch comparison + discipline comparison + matrix + reviewer workload

**Quality outlier detection:**
- `GET /api/v1/analytics/quality-outliers` — returns `QualityOutlier[]` for current period; used by alert dashboard and "Create QAPI event from trend" CTA

---

### BullMQ

**`qapi-overdue-check`** (daily 08:00 UTC):
- Queries `qapi_action_items` where `dueDate < now` and `completedAt IS NULL` and event `status != CLOSED`
- Emits `compliance:alert` Socket.IO + upserts `QAPI_ACTION_OVERDUE` alert type
- Runs `qualityOutlier` detection: first-pass rate drop >10pp week-over-week → `QualityOutlier`; billing-impact deficiency rate rising for 3+ consecutive weeks → `QualityOutlier`; posts to `compliance:alert` channel

Add `QAPI_ACTION_OVERDUE` + `FIRST_PASS_DECLINE` + `BILLING_DEFICIENCY_RISING` + `COMPLIANCE_DEFICIENCY_RISING` to `alert_type_enum` migration.

---

### Socket.IO events

Add to `shared-types/socket.ts`:
- `qapi:event:created` — { eventId, locationId, eventType }
- `qapi:event:closed` — { eventId, locationId }
- `qapi:action:overdue` — { eventId, actionItemId, assignedToId, locationId }
- `quality:outlier:detected` — { outlier: QualityOutlier }

---

### Frontend

**`/qapi` — QAPI workspace:**
- Event list (filterable by status/type/period), status badges (OPEN/IN_PROGRESS/CLOSED)
- "Raise QAPI event" form — optionally pre-populated from a trend context (e.g. "First-pass rate dropped from 87% to 71% in RN/Branch East, week of 2026-03-09")
- Event detail drawer: action item list with assignee + due date + completion; "Close Event" button (requires closure evidence text ≥ 50 chars); closed events: read-only badge

**`/analytics/scorecards` — Clinician scorecard dashboard:**
- Summary table: all clinicians, sortable by first-pass rate / avg revisions / overdue rate; discipline filter; period picker
- Clinician detail view: all 8 metrics, deficiency breakdown bar chart, rolling 12-week revision trend sparkline
- "Create QAPI event for this clinician" CTA on outlier rows

**`/analytics/deficiency-trends` — Trend reporting:**
- Top deficiency types (horizontal bar chart, current period)
- Weekly trend stacked area chart (by DeficiencyType)
- Branch comparison table (locationName / firstPassRate / totalDeficiencies / trend pill)
- Discipline comparison table
- Branch × discipline heatmap (color-coded by first-pass rate)
- Reviewer workload table (assigned / resolved / overdue)
- "Raise QAPI event from trend" button per anomalous row — pre-fills `linkedTrendContext`

---

**Done when:**
- QAPI events create/update/close; closed events return 409 on further PATCH; `closureEvidence` stored; action items independently queryable
- `qapi-overdue-check` job flags overdue action items and surfaces them in the alert dashboard
- Clinician scorecard returns all 8 metrics (firstPassApprovalRate, averageRevisionCount, medianTurnaroundHours, overdueReviewRate, billingImpactRate, complianceImpactRate, deficiencyBreakdown, revisionTrend) computed correctly from T2-9 `encounters` data
- Deficiency trend report returns branch comparison, discipline comparison, and branch × discipline matrix filterable by locationId/discipline/period/deficiencyType
- Quality outlier detection identifies first-pass decline ≥10pp week-over-week and rising billing-impact deficiency trends; posts `quality:outlier:detected` Socket.IO
- "Create QAPI event from trend" pre-fills `linkedTrendContext` and links outlier card to new event
- RLS: location A cannot read location B QAPI events or scorecards
- Route `GET /api/v1/analytics/quality-benchmarks` stays in T3-1a (HOPE/HQRP NQF measures); T3-11 does NOT duplicate it — internal branch comparisons use `deficiency-trends` route only

---

## T3-12 · Claim Audit Rules Engine + Bill-Hold Dashboard `HIGH`

> Configurable audit rule catalog and bill-hold policy engine. Called by T3-7a before submission. Upgraded MEDIUM → HIGH based on competitor research (2026-03-12 — Axxess/WellSky/FireNote). Architecture validated as more explicit than any competitor public material: explicit BLOCK/WARN, per-revision audit snapshots, explainable root-cause drilldowns, alert-driven owner lanes.

`needs:` T3-7a (claims), T3-2a (NOE/NOTR), T3-4 (benefit periods), T3-5 (signatures)

`read:` `BE-SPEC`, `docs/qa/CLAIM_AUDIT_RULES_ENGINE_COMPETITIVE_ANALYSIS.md`

**New service:** `backend/src/contexts/billing/services/claimAudit.service.ts`

Called by T3-7a `POST /api/v1/claims/:id/audit` — runs after readiness check passes, before state transitions to `READY_TO_SUBMIT`.

---

### DB migration

**`claim_audit_snapshots`** — one row per audit run per claim revision:
```typescript
{
  id: uuid PK;
  claimId: uuid FK;
  claimRevisionId: uuid FK;
  locationId: uuid FK;         // RLS
  auditedAt: timestamptz;
  passed: boolean;
  blockCount: integer;         // cached for dashboard queries
  warnCount: integer;          // cached for dashboard queries
  failures: jsonb;             // AuditFailure[] — see type below
  overrideTrail: jsonb;        // WarnOverride[] — populated by /override route
  auditedBy: uuid FK | null;   // null = system
  createdAt: timestamptz;
}
// WarnOverride: { ruleCode: string; overriddenBy: uuid; reason: string; overriddenAt: string }
```

RLS: `location_read` + `location_insert` + `location_update` policies (same pattern as `claim_audit_snapshots`).

---

### Rule catalog (12 groups)

Rules are version-locked in code (not DB-configurable at runtime — avoids silent rule drift). Group identifiers are the canonical string keys used in `AuditFailure.ruleGroup`.

| # | Group key | What it checks | Severity range |
|---|---|---|---|
| 1 | `ELECTION_AND_NOE` | Medicare ID present, election date valid, NOE accepted and not claim-blocking (T3-2a `isClaimBlocking`), payer config on file | BLOCK |
| 2 | `BENEFIT_PERIOD_AND_RECERT` | Active benefit period assigned, recert completed before period end, period number correct, HOPE-A filed if admission claim, HOPE-D filed if discharge claim (T3-1a) | BLOCK/WARN |
| 3 | `F2F_AND_CERTIFICATION` | F2F documented before recert date, within 30-calendar-day window, required period ≥3, valid provider role (T3-2b) | BLOCK/WARN |
| 4 | `SIGNED_ORDERS_AND_PLAN_OF_CARE` | No unsigned verbal orders pending (T3-9), all required documents signed (T3-5), care plan present and discipline-complete | WARN (orders) / BLOCK (signatures if billing-required doc) |
| 5 | `VISIT_COMPLETENESS` | Required visits per frequency plan completed for billing period (T2-10), IDG held within 15-day window, aide supervision completed within 14 days (42 CFR §418.76) | WARN |
| 6 | `DISCHARGE_AND_NOTR` | NOTR not claim-blocking, filed within 5 business days of revocation/death, correct terminal status (T3-2a) | BLOCK |
| 7 | `CLAIM_LINE_AND_REVENUE_CODE` | Revenue codes present, HCPCS/modifier valid for claim type, occurrence codes populated (CMS automation requirement) | BLOCK |
| 8 | `LEVEL_OF_CARE_AND_CONTINUOUS_CARE` | Routine home care vs continuous care codes match level-of-care data, continuous-care hour threshold met if billed, sub-state consistent with benefit period | BLOCK |
| 9 | `PAYER_AND_TIMELY_FILING` | Payer-specific bill-type rules satisfied, room-and-board payer logic valid, timely-filing window not expired, concurrent care sub-state consistent | BLOCK/WARN |
| 10 | `DUPLICATE_AND_SEQUENTIAL_BILLING` | No duplicate claim for same patient/period combination, correct bill-type sequence (8X1 before 8X7/8X8), no overlapping date spans | BLOCK |
| 11 | `CAP_AND_COMPLIANCE_RISK` | T3-3 `isCapAtRisk` flag (WARN only — does not block submission, but surfaced to billing director), T3-4 `billingRisk` flag triggers auto-hold | WARN |
| 12 | `REMITTANCE_OR_DENIAL_FOLLOW_UP` | Prior claim for same period was denied/rejected and has no approved replacement plan (requires T3-7b data; rule is a no-op until T3-7b completes) | WARN |

---

### Audit result types

```typescript
type AuditFailure = {
  ruleGroup: string;           // e.g. 'F2F_AND_CERTIFICATION'
  ruleCode: string;            // e.g. 'F2F_DOC_BEFORE_RECERT_DATE'
  severity: 'BLOCK' | 'WARN';
  message: string;             // human-readable explanation
  sourceObject: string;        // e.g. 'benefit_periods', 'notices_of_election'
  sourceObjectId?: string;     // FK value if navigable
  sourceField?: string;        // e.g. 'f2fDocumentedAt'
  remediationCTA: string;      // e.g. 'Record F2F documentation in Benefit Periods'
  ownerRole: 'billing' | 'supervisor' | 'clinician' | 'physician' | 'admin';
  claimBlocking: boolean;      // true if this failure triggers auto-hold on the claim
};

type AuditResult = {
  passed: boolean;
  claimAuditSnapshotId: string;
  blockCount: number;
  warnCount: number;
  failures: AuditFailure[];
};
```

- `BLOCK` failures → claim stays at `AUDIT_FAILED`; submission blocked
- `WARN` failures → supervisor override required with reason → logged to `audit_log` + appended to `overrideTrail` JSONB; then claim advances to `READY_TO_SUBMIT`
- `claimBlocking: true` on any failure → auto-hold placed regardless of severity

---

### Bill-hold policy engine

Auto-hold rules (applied on audit completion, independent of BLOCK/WARN). The engine calls T3-7a's existing `bill_holds` table and hold infrastructure — T3-12 does **not** add its own hold table:
- Any `AuditFailure` with `claimBlocking: true` → call T3-7a hold service with `COMPLIANCE_BLOCK`
- NOE `isClaimBlocking = true` (T3-2a) → call T3-7a hold service with `COMPLIANCE_BLOCK`
- T3-4 `billingRisk = true` → call T3-7a hold service with `COMPLIANCE_BLOCK`
- Single-claim manual hold/unhold: owned by T3-7a (`POST /api/v1/claims/:id/hold` + `POST /api/v1/claims/:id/unhold`)
- Bulk operations added by T3-12: `POST /api/v1/claims/bulk-hold` / `POST /api/v1/claims/bulk-release-hold` (billing manager role; atomic, all-or-none)

**Hold reason taxonomy (enum):** `MISSING_DOC` | `PAYER_ISSUE` | `MANUAL_REVIEW` | `COMPLIANCE_BLOCK` | `LATE_SUBMISSION` | `DUPLICATE_RISK`

---

### Billing alert types

Extends `alert_type_enum` (established in T2-8 migration):
- `CLAIM_VALIDATION_ERROR` — BLOCK-level audit failure; surfaces in billing tab
- `CLAIM_REJECTION_STATUS` — clearinghouse rejection after submission (populated by T3-7a)
- `BILL_HOLD_COMPLIANCE_BLOCK` — auto-hold from compliance flag
- `BILL_HOLD_MISSING_DOC` — missing document hold
- `BILL_HOLD_MANUAL_REVIEW` — manual hold by billing staff

---

### Billing alert dashboard

**Route:** `GET /api/v1/billing/audit-dashboard`

Seven dashboard sections (Axxess/WellSky benchmark):

**1. Claim Status Summary**
```typescript
{
  readyToBill: number;
  auditFailed: number;        // AUDIT_FAILED state — at least one BLOCK
  readyForOverride: number;   // WARN failures only — supervisor has not yet overridden
  onHold: number;             // any active bill hold
}
```

**2. Aging by Rule Group**
```typescript
// per rule group: claim count + age distribution
{ ruleGroup: string; claimCount: number; aging: { d0_2: number; d3_7: number; d8_14: number; d14plus: number } }[]
```

**3. Aging by Hold Reason**
```typescript
{ holdReason: HoldReason; claimCount: number; aging: { d0_2: number; d3_7: number; d8_14: number; d14plus: number } }[]
```

**4. Aging by Branch**
```typescript
{ locationId: string; locationName: string; claimCount: number; aging: { d0_2: number; d3_7: number; d8_14: number; d14plus: number } }[]
```

**5. Owner Lane Queue**
```typescript
{ ownerRole: 'billing' | 'supervisor' | 'clinician' | 'physician' | 'admin'; pendingCount: number; oldestAgedays: number }[]
```

**6. Top Rejection / Denial Drivers** _(no-op until T3-7b completes; returns empty array with `availableAfter: 'T3-7b'` flag)_
```typescript
{ ruleCode: string; denialCount: number; totalDollarImpact: number | null }[]
```

**7. Warn Override Volume**
```typescript
{ date: string; overrideCount: number; topReasons: string[] }[]  // last 30 days, daily buckets
```

---

### Socket.IO events

Add to `shared-types/socket.ts` and emit from `claimAudit.service.ts`:

```typescript
'billing:audit:failed'     // { claimId, patientId, locationId, blockCount, warnCount }
'billing:hold:placed'      // { claimId, patientId, locationId, holdReason, placedBy: uuid | 'system' }
'billing:hold:released'    // { claimId, patientId, locationId, releasedBy: uuid }
'billing:override:approved' // { claimId, patientId, locationId, ruleCode, overriddenBy: uuid }
```

---

### Routes

**Audit snapshot routes (new in T3-12):**
- `GET /api/v1/claims/:id/audit` — latest audit snapshot for claim
- `GET /api/v1/claims/:id/audit/history` — all snapshots across revisions
- `POST /api/v1/claims/:id/audit/override` — supervisor WARN override (requires `ruleCode` + `reason`; appends to `overrideTrail`; logs to `audit_log`)

**Bulk hold operations (new in T3-12 — extends T3-7a's single-claim hold infra):**
- `POST /api/v1/claims/bulk-hold` — bulk hold `{ claimIds: string[]; holdReason: HoldReason }` — atomic
- `POST /api/v1/claims/bulk-release-hold` — bulk release `{ claimIds: string[] }` — atomic

**Dashboard:**
- `GET /api/v1/billing/audit-dashboard` — all 7 dashboard sections

> Single-claim hold/unhold (`POST /api/v1/claims/:id/hold` + `POST /api/v1/claims/:id/unhold`) are T3-7a routes. T3-12's auto-hold engine calls T3-7a's hold service internally — no route duplication.

---

**Done when:**
- Claim with missing F2F → `F2F_AND_CERTIFICATION` BLOCK → stays at `AUDIT_FAILED`; auto-hold placed (claimBlocking=true)
- Claim with WARN-only failures → supervisor override stores reason in `overrideTrail` and `audit_log`; claim advances to `READY_TO_SUBMIT`
- All 12 rule groups produce correctly typed `AuditFailure` objects on seeded test data
- `claim_audit_snapshots` row stored per revision with correct `blockCount`/`warnCount` caches
- NOE `isClaimBlocking=true` auto-places `COMPLIANCE_BLOCK` hold
- T3-4 `billingRisk=true` auto-places `COMPLIANCE_BLOCK` hold
- `billing:audit:failed` + `billing:hold:placed` Socket.IO events emitted to location room
- Dashboard returns all 7 sections; aging buckets are correct; empty sections (T3-7b-dependent) return `[]` with `availableAfter` flag
- Bulk hold/release is atomic — partial failure rolls back all
- RLS: location A cannot read location B audit snapshots

---

## T3-13 · Chart audit mode + review checklists + survey-readiness `HIGH`

> Full chart-level audit capability — centralized workbench queue, discipline-specific review checklists, chart completeness scoring, survey-readiness, missing-document indicators, saved audit views, bulk QA actions. Deferred from T2-9 because it requires T3-5 (signatures), T3-1 (HOPE), T3-2 (NOE/NOTR), and T3-9 (orders) to be complete.
>
> Competitive context: Axxess is the strongest public benchmark for QA-center mechanics (queue, filters, bulk approve/return, comments, validation-driven review); FireNote is strongest on missing-document visibility and audit-readiness outcome messaging; WellSky is strongest on chart packaging. No competitor publicly exposes the full architecture below — differentiation opportunity on checklist templates, completeness scoring, DB-persisted saved views, and atomic bulk QA.

`needs:` T2-9 (note review + RevisionRequest type), T3-1 (HOPE), T3-2 (NOE/NOTR), T3-5 (electronic signatures), T3-9 (physician orders)
`feeds:` T3-10 (completeness summary consumed as optional cover-sheet section in audit packet export), T3-11 (checklist completion rates + deficiency mix feed QAPI scorecards)

`read:` `BE-SPEC`, `DB-ARCH`

---

### Discipline-specific review checklists

A checklist template is a set of required items for a given `(discipline, visit_type)` pair. Supervisors step through checklist items when reviewing a note. Checklist completion percentage feeds the patient's `surveyReadiness.score`.

**New table `review_checklist_templates`** (next available migration number — run `pnpm --filter @hospici/backend db:next-migration-number` first):
```typescript
{
  discipline: DisciplineType;           // RN | SW | CHAPLAIN | THERAPY | AIDE
  visitType: VisitType;                 // ROUTINE | ADMISSION | RECERTIFICATION | DISCHARGE
  items: ChecklistItem[];               // JSONB
  version: integer;                     // increment on every item change; old responses reference version at time of review
  isActive: boolean;
  effectiveDate: date;                  // when this version became active
}
// ChecklistItem: { id, label, required: boolean, regulatoryRef?: string, scoringWeight?: number }
// scoringWeight: optional 0-1 float; if present, item contributes proportionally to surveyReadiness.score
```

Seed templates for: `RN × ROUTINE`, `RN × ADMISSION`, `RN × RECERTIFICATION`, `SW × ROUTINE`, `CHAPLAIN × ROUTINE`.

**Checklist response stored per review** — add `checklist_responses` JSONB column to encounters (array of `{ itemId, checked, reviewerId, timestamp, templateVersion }`). Store `templateVersion` so historical responses remain interpretable after template version bumps.

**Routes:**
- `GET /api/v1/review-checklist-templates?discipline=&visitType=` — returns active template for that pair
- `GET /api/v1/review-checklist-templates/:id/history` — returns all versions for a `(discipline, visitType)` pair (audit/change history)

---

### Chart-audit workbench queue

A centralized supervisor workspace — a paginated list of patients in the audit queue, not patient-detail views. This is the primary entry point for QA staff doing routine or survey-prep chart review.

**Route:** `GET /api/v1/chart-audit/queue`
- `supervisor` + `compliance_officer` + `admin` roles
- Query params: `locationId`, `discipline`, `reviewerId`, `status` (NOT_STARTED | IN_PROGRESS | COMPLETE | FLAGGED), `deficiencyType`, `billingImpact: boolean`, `complianceImpact: boolean`, `missingDocSeverity: critical|warning`, `dateRangeStart`, `dateRangeEnd`, `page`, `limit`, `sortBy`, `sortDir`, `groupBy`
- Returns paginated list; each row:
```typescript
{
  patientId: string;
  patientName: string;           // PHI-encrypted value, decrypted for authorized roles
  primaryDiscipline: string;
  reviewStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE' | 'FLAGGED';
  missingDocCount: number;
  surveyReadinessScore: number;  // 0-100, computed lazily or from last chart-audit run
  assignedReviewerId: string | null;
  assignedReviewerName: string | null;
  lastActivityAt: string | null;
  billingImpact: boolean;
  complianceImpact: boolean;
}
```

**Route:** `GET /api/v1/chart-audit/dashboard`
- Returns workload summary cards:
```typescript
{
  total: number;
  byStatus: Record<ReviewStatus, number>;
  byDiscipline: Record<string, number>;
  byReviewer: { reviewerId: string; name: string; count: number }[];
  bySeverity: { critical: number; warning: number };
  avgSurveyReadinessScore: number;
}
```

---

### Chart audit mode (single-patient detail)

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

### DB-persisted saved audit views

Supervisors save named filter/sort/column configurations for both the note review queue and the chart-audit workbench queue. Large audit queues without saved views force repeated manual re-filtering — this is a primary usability differentiator.

**New table `review_queue_views`:**
```typescript
{
  ownerId: uuid FK → users.id;
  name: string;
  viewScope: 'note_review' | 'chart_audit';  // which queue this view applies to
  filters: jsonb;        // same shape as query params for the scoped queue endpoint
  sortConfig: jsonb;     // { sortBy: string; sortDir: 'asc' | 'desc' }
  columnConfig: jsonb;   // { visibleColumns: string[]; columnOrder: string[] }
  groupBy: text | null;  // e.g. 'discipline' | 'reviewer' | 'status'
  isShared: boolean;
  isPinned: boolean;     // pinned views appear at top of the saved-views list
  isDefault: boolean;    // at most one default per (ownerId, viewScope) — enforce with partial unique index
  locationId: uuid;
}
// Partial unique index: (ownerId, viewScope) WHERE isDefault = true
```

**Routes:**
- `GET /api/v1/review-queue/views?viewScope=` — list saved views for current user + shared views in location
- `POST /api/v1/review-queue/views` — save filter config
- `PATCH /api/v1/review-queue/views/:id` — update (name / filters / sort / columns / isShared / isPinned / isDefault)
- `DELETE /api/v1/review-queue/views/:id` — delete own view

---

### Bulk QA actions

Beyond bulk-acknowledge (already in T2-9), add:

**Route:** `POST /api/v1/review-queue/bulk-action` (encounter-level, for note review queue)
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

**Route:** `POST /api/v1/chart-audit/bulk-action` (chart-level, for workbench queue)
```typescript
body: {
  patientIds: string[];
  action: 'ASSIGN' | 'REQUEST_REVISION' | 'EXPORT_CSV';
  assignedReviewerId?: string;
  revisionRequest?: Omit<RevisionRequest, 'id' | 'resolvedAt' | 'resolvedComment'>;
}
// EXPORT_CSV: returns a CSV file (Content-Disposition: attachment) of the filtered queue rows
// All mutating actions are all-or-none (db.transaction). AuditService.log on every bulk action.
```

---

**Done when:**
- Checklist template returns correct items for `RN × ROUTINE`; template version stored on checklist responses
- `GET /api/v1/chart-audit/queue` returns paginated rows with all queue columns; all filter/sort/group params work
- `GET /api/v1/chart-audit/dashboard` returns workload cards broken out by status, discipline, reviewer, and severity
- `GET /api/v1/patients/:id/chart-audit` returns all 8 sections + `surveyReadiness` score; checklist completion percentage influences score; missing documents listed with severity
- Saved views persist across sessions; `viewScope`, `sortConfig`, `columnConfig`, `groupBy`, `isPinned`, `isDefault` all round-trip; partial unique index prevents two defaults for same (owner, scope)
- `PATCH /api/v1/review-queue/views/:id` works; shared views visible to location colleagues
- Chart-level `bulk-action` ASSIGN and REQUEST_REVISION are all-or-none (rolled back on partial failure); EXPORT_CSV returns downloadable CSV
- All mutating routes emit AuditService.log entries; unauthorized roles get 403 on all routes

