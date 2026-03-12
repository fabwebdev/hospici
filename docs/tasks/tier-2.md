# Tier 2 — Clinical Core

> `needs:` Tier 0 + Tier 1 complete. Run Phase 1 exit gate (T1-9) first.
> Never combine two MEDIUM tasks in one session. HIGH tasks get their own session.

---

## T2-1 · Patient CRUD — backend `MEDIUM`

Routes: `GET /api/v1/patients`, `POST /api/v1/patients`, `GET /api/v1/patients/:id`, `PATCH /api/v1/patients/:id`

- Use Drizzle `patients` table from T0-5
- Call `AuditService.log()` on every PHI read/write
- Encrypt PHI fields via T1-5 service

`read:` `backend/src/contexts/clinical/schemas/patient.schema.ts`

**Done when:** `POST /api/v1/patients` creates a patient; `GET /:id` returns decrypted fields; `audit_logs` row exists

---

## T2-2 · Patient list + detail — frontend `MEDIUM`

- Replace hardcoded mock in `patients/index.tsx` with `createServerFn` → real API
- Create `_authed/patients/$patientId.tsx` route
- Wire TanStack Query `useQuery` with key from `lib/query/keys.ts`
- Replace all `<a href>` with `<Link>` in `_authed.tsx`

`read:` `FE-CONTRACT`
`needs:` T2-1

**Done when:** Patient list shows DB records; navigation uses client-side routing

---

## T2-3 · Pain assessments + decline trajectory `MEDIUM`

**Routes:** `POST /api/v1/patients/:id/assessments`, `GET /api/v1/patients/:id/assessments`

**All 5 pain scale schemas required** (schema-first workflow for each):

| Scale | Status | Notes |
|-------|--------|-------|
| FLACC | ✅ exists | — |
| PAINAD | ⬜ | Dementia/non-verbal patients |
| NRS (Numeric Rating Scale) | ⬜ | 0-10 adult |
| Wong-Baker FACES | ⬜ | Pediatric verbal |
| ESAS (Edmonton Symptom Assessment) | ⬜ | Multi-symptom |

Each needs: TypeBox schema + Drizzle row in `pain_assessments` + migration entry with `assessment_type` discriminator.

**Decline trajectory:** `GET /api/v1/patients/:id/trajectory` — time-series of symptom and functional status scores across all assessments, ordered chronologically. Frontend renders mini sparklines per symptom (pain, dyspnea, nausea, functional status) in patient header.

VantageChart (T2-7) Layer 1 reads the last 3 trajectory points to auto-populate "patient response trend" in narrative templates.

`read:` `backend/src/contexts/clinical/schemas/flaccScale.schema.ts`

**Done when:** All 5 scale types storable and retrievable; `assessment_type` validates against enum; trajectory endpoint returns ordered time-series; sparkline renders in patient header

---

## T2-4 · IDG meeting recording + compliance enforcement `MEDIUM`

**Routes:** `POST /api/v1/idg-meetings`, `GET /api/v1/patients/:id/idg-meetings`

- Schema's `checkIDGCompliance()` and `hasRequiredAttendees()` logic exists — wire into route preHandler
- Frontend IDG modal: **hard-block, single action "Schedule IDG Meeting", no dismiss**

**No-Prep IDG enhancement:** Add `attendee_notes` JSONB column to `idg_meetings`:
```typescript
// Schema: keyed by userId+role, value is each discipline's structured input
{ [userId: string]: { role: string; notes: string; goalsReviewed: boolean; concerns: string | null } }
```
Each attendee documents their update _during_ the live meeting. IDG note assembled automatically from attendee contributions on meeting close (`status: 'completed'` transition). Eliminates pre-meeting prep (Firenote's "No-Prep IDG" equivalent).

`read:` `DESIGN` (IDG modal spec), `backend/src/contexts/scheduling/schemas/idgMeeting.schema.ts`

**Done when:** 15-day overdue patient triggers hard-block modal; attendee validation (RN+MD+SW) enforced at API; modal cannot be dismissed; attendee notes persist to `attendee_notes` JSONB; assembled IDG note generated on `status: 'completed'`

---

## T2-5 · Care plan schema + routes `MEDIUM`

No care plan schema exists. Full schema-first workflow.

**TypeBox schema → Drizzle table → migration → routes:**
- `POST /api/v1/patients/:id/care-plan`
- `GET /api/v1/patients/:id/care-plan`
- `PATCH /api/v1/patients/:id/care-plan/:discipline` (role-gated, partial update)

**Unified interdisciplinary care plan requirements:**
- `discipline_sections` JSONB — keyed by role: `RN | SW | CHAPLAIN | THERAPY | AIDE`
- Each discipline edits their own section without overwriting others
- PATCH is RLS-gated by role

**SMART Goal Builder:** Each discipline section includes a `goals` array:
```typescript
{
  goal: string;
  specific: string;
  measurable: string;
  achievable: string;
  relevant: string;
  timeBound: string;
  targetDate: date;
  status: 'active' | 'met' | 'revised';
}
```

Care plan embedded in encounter response — no separate module navigation required.

`read:` `DRIZZLE`, `BE-SPEC` §Phase 2

**Done when:** Care plan created and retrieved; RLS policy in migration file; RN section update does not overwrite SW section; SMART goals storable per discipline; `GET /api/v1/patients/:id/encounters/:encId` includes care plan inline

---

## T2-6 · Medication management `MEDIUM`

No medication module exists anywhere. Full schema-first workflow.

### Feature scope

| Area | Implementation |
|------|---------------|
| Active medication list | `medications` table — status `ACTIVE \| DISCONTINUED \| ON_HOLD` |
| Comfort-kit tracking | `is_comfort_kit` boolean promoted column; comfort kit medications filtered separately |
| PRN management | `frequency_type: SCHEDULED \| PRN`; `prn_reason`, `prn_max_doses_per_day` |
| MAR (administration recording) | `medication_administrations` table — type `GIVEN \| OMITTED \| REFUSED` |
| Effectiveness monitoring | `effectiveness_rating` (1–5) + `adverse_effect_noted` + `adverse_effect_description` on each MAR row |
| Controlled substance tracking | `dea_schedule` enum `I–V`; `is_controlled_substance` boolean promoted column |
| Allergy tracking | `patient_allergies` table — `allergen_type`, `severity`, `reaction` |
| Drug interaction check | OpenFDA `/drug/interaction.json` — queried on POST medication against all active meds |
| Physician order linkage | Nullable `physician_order_id` FK on medications (wired to T3-9) |
| Pharmacy coordination | `pharmacy_name`, `pharmacy_phone`, `pharmacy_fax` on medications |
| Caregiver teaching | `patient_instructions` (text) + `teaching_completed` flag + timestamp/userId |
| Medication reconciliation | `reconciled_at`, `reconciled_by`, `reconciliation_notes` on medications |
| Hospice billing classification | `medicare_coverage_type: PART_A_RELATED \| PART_D \| NOT_COVERED \| OTC` |

### Drizzle tables
- `medications` — full medication list (all fields above)
- `medication_administrations` — MAR records
- `patient_allergies` — drug/food/environmental allergies
All three in migration 0010 with RLS policies.

### Routes
- `GET /api/v1/patients/:id/medications` — active med list (with interaction warnings)
- `POST /api/v1/patients/:id/medications` — add medication + OpenFDA interaction check
- `PATCH /api/v1/patients/:id/medications/:medId` — update status / discontinue / reconcile / teaching
- `GET /api/v1/patients/:id/medications/:medId/administrations` — MAR history
- `POST /api/v1/patients/:id/medications/:medId/administer` — record administration
- `GET /api/v1/patients/:id/allergies` — allergy list
- `POST /api/v1/patients/:id/allergies` — add allergy
- `PATCH /api/v1/patients/:id/allergies/:allergyId` — inactivate allergy

**Socket.IO:** `medication:administered` event fires on every MAR record.
Note: eRx/EPCS integration deferred to T4-3.

`read:` `DRIZZLE`, `BE-SPEC`

**Done when:** Full med list CRUD; MAR records with effectiveness + adverse effects; PRN and comfort-kit filtering; OpenFDA returns interaction warnings; allergy CRUD; Socket.IO event fires; RLS policy in migration; controlled substance flag queryable

---

## T2-7 · VantageChart™ — structured narrative generation `HIGH`

> Hospici's primary documentation differentiator. Goal: reduce routine RN visit documentation by 70%+ vs legacy EMRs. **This is its own dedicated session.**

`read:` `VANTAGE` (full spec), `FE-CONTRACT`
`needs:` T2-1 (patients), T1-4 (audit), T1-5 (PHI encryption)

### Architecture — two-layer approach

**Layer 1 (core, always active): Template-based deterministic assembly**
- Clinician makes structured selections (vitals, symptoms, functional status, pain score, interventions)
- Rules engine (`vantageChart.engine.ts`) assembles clinical narrative from pre-authored fragments
- Fully deterministic, traceable to explicit clinician input — no hallucination risk
- Fragments in `vantageChart.templates.ts` per discipline (RN, SW, CHAPLAIN, THERAPY, AIDE) and visit type (ROUTINE | ADMISSION | RECERTIFICATION | DISCHARGE)
- Each fragment has `trigger` condition + `template` string with `{variable}` substitution

**Layer 2 (optional, clinician-toggled): LLM polish**
- After Layer 1 generates draft, clinician may click "Enhance with AI"
- Sends deterministic draft (NOT raw PHI) to Claude API for prose refinement
- **PHI rule:** Layer 2 call receives only assembled narrative text — no patient identifiers, no MRN, no name
- Original draft always preserved; changes highlighted; one-click revert
- Defaults **off**

**Voice-to-structured input (Layer 1 enhancement):**
- Browser `window.SpeechRecognition` Web API (no custom ML)
- Regex-based intent extraction maps speech → structured `VantageChartInput` fields on frontend
- Voice does not bypass structured data capture

### Critical implementation decisions

- `handlebars` npm package for template rendering. **Pre-compile all templates at build time** via `backend/src/config/vantagechart-compiler.ts` — never compile at request time
- **NEVER use `new Function()` for template conditions** — use `expr-eval` npm package (sandboxed). `new Function` is RCE if a DB template is ever compromised
- Templates stored as JSON in DB, validated against `NarrativeTemplateSchema` on insert
- Context cache in **Valkey** (not in-memory Map) — key: `vantage:context:{patientId}`, TTL 300s
- `ContextResolverService`: fetches last 5 encounters + 5 pain assessments, computes pain trend (improving/worsening/stable, ±2 threshold), symptom burden score, IDG-relevant topics, pre-populates unchanged fields if last visit < 7 days
- Full traceability: `AssemblyResult.traceability[]` maps each sentence → source fragment ID → input data snapshot. Stored in `encounters.vantage_chart_traceability` JSONB. **Required for CMS audit**
- `VantageChartValidator` on finalize: if structured input >90% identical to prior visit, surface warning (not block)

### Backend

| File | Purpose |
|------|---------|
| `backend/src/contexts/clinical/services/vantageChart.service.ts` | Layer 1 engine |
| `backend/src/contexts/clinical/services/vantageChart.templates.ts` | Narrative fragments |
| `backend/src/contexts/clinical/services/vantageChart.llm.ts` | Layer 2 Claude API call (isolated) |

**Routes:**
- `POST /api/v1/patients/:id/encounters/:encId/vantage-chart/generate` → `{ draft: string; method: 'TEMPLATE' }`
- `POST /api/v1/patients/:id/encounters/:encId/vantage-chart/enhance` → `{ enhanced: string; original: string; method: 'LLM'; tokens_used: number }`
- Draft is **never auto-saved** — clinician must `PATCH /encounters/:encId`

**Encounters table additions:** `vantage_chart_draft`, `vantage_chart_method: 'TEMPLATE' | 'LLM' | null`, `vantage_chart_accepted_at`, `vantage_chart_traceability` JSONB

**Rate limiting:** Layer 2 only — 10 enhance requests/user/hour

**Audit:** Every call logs `VANTAGE_CHART_GENERATED` (L1) or `VANTAGE_CHART_ENHANCED` (L2) with method, discipline, visit type, encounter ID, tokens_used (L2). Never log PHI or draft text.

### Frontend

| File | Purpose |
|------|---------|
| `frontend/src/routes/_authed/patients/$patientId/encounters/$encounterId/vantage-chart.tsx` | Main route |
| `vantage-chart.functions.ts` | `getPatientContextFn`, `previewNarrativeFn`, `finalizeNoteFn`, `enhanceWithLLMFn` |

**Layout:** Two-panel split — left 60% step input, right 40% live narrative preview with compliance ring

**9 steps:** `patient-status → pain-assessment → symptom-review → interventions → psychosocial → care-plan → safety → plan-changes → review`

**Step transitions:** `AnimatePresence` from `framer-motion` (add to frontend deps)

**Live preview:** Debounced 500ms call to `previewNarrativeFn` on every input change

**QuickActions bar per step:** "Same as last visit", "Pain resolved" — primary time-saver mechanism

**Primitives needed:** `ToggleGroup`, `VisualAnalogScale` (0-10 slider), `CheckboxGrid` (3-col multi-select), `SmartSelect`, `QuickActions`

**Auto-save:** Draft to `encounters.vantage_chart_draft` on each step completion (optimistic mutation)

**New deps:** backend: `handlebars`, `expr-eval` · frontend: `framer-motion`

**Done when:** Layer 1 returns coherent RN routine visit narrative from structured input; Layer 2 returns refined prose; PHI test confirms no identifiers in LLM payload; one-click revert works; audit log distinguishes TEMPLATE vs LLM; rate limit 429 on Layer 2 breach; traceability stored per note; copy-paste detection warns >90% match; routine visit completable in <12 min

---

## T2-8 · Compliance alert dashboard `MEDIUM`

> Operational staff (DON, billing coordinator, admin) need a real-time operational command center surfacing compliance gaps, with clear "why blocked?" context and escalation workflow.

`needs:` T1-6 (BullMQ), T1-8 (Socket.IO), T2-1 (patients)

`read:` `BE-SPEC`, `DB-ARCH`

---

### AlertType enum (add to `@hospici/shared-types/alerts.ts`)

```typescript
// 10 types — data exists for all of these now
export const AlertType = {
  NOE_DEADLINE:               'NOE_DEADLINE',              // 42 CFR §418.22 — 5-day rule
  NOTR_DEADLINE:              'NOTR_DEADLINE',             // 5-day revocation rule
  IDG_OVERDUE:                'IDG_OVERDUE',               // 42 CFR §418.56 — hard block
  AIDE_SUPERVISION_OVERDUE:   'AIDE_SUPERVISION_OVERDUE',  // 42 CFR §418.76
  AIDE_SUPERVISION_UPCOMING:  'AIDE_SUPERVISION_UPCOMING', // day 12 warning
  HOPE_WINDOW_CLOSING:        'HOPE_WINDOW_CLOSING',       // ≤2 days remaining
  F2F_REQUIRED:               'F2F_REQUIRED',              // benefit period 3+
  CAP_THRESHOLD:              'CAP_THRESHOLD',             // ≥80% hospice cap
  BENEFIT_PERIOD_EXPIRING:    'BENEFIT_PERIOD_EXPIRING',   // recert needed
  RECERTIFICATION_DUE:        'RECERTIFICATION_DUE',       // cert expiring + F2F dependency flag
} as const;
```

**Hard-block types** (cannot be snoozed): `IDG_OVERDUE`, `NOE_DEADLINE` (critical), `NOTR_DEADLINE` (critical), `HOPE_WINDOW_CLOSING` (≤0 days).

**Deferred types** (homed to correct tasks — do not build stubs here):
- `HOPE_VALIDATION_ERROR`, `HOPE_SUBMISSION_READY` → T3-1 (HOPE live routes)
- `NOTE_INCOMPLETE`, `NOTE_REVIEW_REQUIRED` → T2-9 (note review system)
- `PLAN_OF_CARE_UNSIGNED` → T3-5 (electronic signatures)
- `MISSED_VISIT`, `VISIT_FREQUENCY_VARIANCE` → T2-10 (visit scheduling — new task)
- `CLAIM_VALIDATION_ERROR`, `CLAIM_REJECTION_STATUS`, `BILL_HOLD_*` → T3-12 (extend pre-submission audit)
- `RAPID_DECLINE_RISK`, `REVOCATION_RISK` → T4-9 (predictive analytics — new task)

---

### Alert object schema

```typescript
interface Alert {
  id: string;                  // uuid — needed for PATCH /status
  type: AlertType;
  severity: 'critical' | 'warning' | 'info';
  patientId: string;
  patientName: string;         // PHI — encrypted at rest, decrypted for authorized roles only
  dueDate: string;             // ISO date
  daysRemaining: number;
  description: string;
  // "Why blocked?" pattern — every alert must populate both fields
  rootCause: string;           // machine-readable root cause, e.g. "NOE not submitted"
  nextAction: string;          // human-readable step, e.g. "Submit NOE before Friday"
  // Escalation state
  status: 'new' | 'acknowledged' | 'assigned' | 'resolved';
  assignedTo: string | null;   // userId — drives role-based work queues
  snoozedUntil: string | null; // ISO date — null for hard-block types, enforced in service
  resolvedAt: string | null;
}
```

---

### Backend

| File | Purpose |
|---|---|
| `shared-types/src/alerts.ts` | `AlertType` const + `AlertSchema` (TypeBox) + `AlertListResponse` + `AlertStatusPatchBody` |
| `backend/db/schema/compliance-alerts.table.ts` | `compliance_alerts` Drizzle table |
| Migration 0012 | `compliance_alerts` table + RLS (location_id scoped) + partial index on `status != 'resolved'` |
| `alert.service.ts` | `listAlerts(filters)`, `upsertAlert()` (called by BullMQ workers), `acknowledgeAlert()`, `assignAlert()`, `resolveAlert()`, `snoozeAlert()` (guards hard-block types — throws if attempted) |
| `alert.routes.ts` | `GET /api/v1/alerts/compliance`, `GET /api/v1/alerts/billing` (returns `[]` until T3-7), `PATCH /api/v1/alerts/:id/status` |
| BullMQ workers (T1-6/T1-7) | Replace `fastify.log` TODO stubs → call `alertService.upsertAlert()` with `rootCause` + `nextAction` fields |
| `typebox-compiler.ts` | Register `AlertSchema`, `AlertListResponse`, `AlertStatusPatchBody` |

Pre-computed alerts cached in Valkey (TTL 5 min). `upsertAlert()` writes DB + invalidates Valkey key. Dashboard loads from cache.

---

### Frontend

| File | Purpose |
|---|---|
| `alerts.functions.ts` | `getComplianceAlertsFn`, `getBillingAlertsFn`, `patchAlertStatusFn` |
| `_authed.tsx` | Add `AlertBanner` — critical count badge, warning count badge, one-click drill-in to `/alerts` |
| `_authed/alerts/index.tsx` | Dual-tab dashboard: **Operational** (compliance types) / **Billing** (empty until T3-7) |
| `AlertCard` component | Type icon + severity color + patient link + `rootCause` + `nextAction` + status selector dropdown |
| `WorkQueue` component | "My items" tab — filters `assignedTo = currentUserId` + `status != 'resolved'` |
| Socket.IO handler in `_authed.tsx` | `compliance:alert` event → invalidate query + update banner count optimistically |

**Alert card UX rules:**
- Hard-block types: no snooze option rendered, badge pulses
- `status = 'new'`: blue dot indicator
- `status = 'acknowledged'`: grey, no pulse
- `status = 'assigned'`: shows assignee avatar
- `daysRemaining ≤ 0`: red background, `OVERDUE` pill

---

**Done when:** Dashboard shows all 10 alert types from real data; BullMQ workers populate `rootCause` + `nextAction` on every alert; Socket.IO pushes new alert within 1s; Valkey cache hit on second request; hard-block types cannot be snoozed (service throws, frontend hides control); PHI only visible to `PHI_ACCESS` roles; `PATCH /status` updates DB + emits `compliance:alert:updated` over Socket.IO; role-based work queue shows correct subset

---

## T2-9 · Note review system `MEDIUM` ✅ DONE

> Supervisors (DON, clinical manager) review in-progress and finalized notes. Enables compliance coaching and prevents documentation liabilities. Expanded from original 3-state design based on competitor QA research (FireNote, Axxess, WellSky).

`needs:` T1-4 (audit), T1-8 (Socket.IO), T2-1, T2-8 (alert service)

`read:` `BE-SPEC`, `DB-ARCH`

---

### Status enum (7 states)

```typescript
pgEnum('note_review_status', [
  'PENDING',             // submitted by clinician, awaiting review
  'IN_REVIEW',           // supervisor has opened the note
  'REVISION_REQUESTED',  // deficiencies recorded, returned to clinician
  'RESUBMITTED',         // clinician addressed revisions, back in queue
  'APPROVED',            // clinically acceptable — read-only for all roles
  'LOCKED',              // fully compliant + signed + bill-safe (set by T3-5 signature workflow)
  'ESCALATED',           // supervisor escalated — requires escalation_reason
])
```

State machine: `PENDING → IN_REVIEW → REVISION_REQUESTED → RESUBMITTED → IN_REVIEW → APPROVED → LOCKED`. `ESCALATED` reachable from `IN_REVIEW` or `REVISION_REQUESTED`. `LOCKED` set by T3-5 (electronic signatures); T2-9 only reaches `APPROVED`.

---

### Deficiency taxonomy

```typescript
// shared-types/src/noteReview.ts
export const DeficiencyType = {
  CLINICAL_SUPPORT:         'CLINICAL_SUPPORT',        // missing assessment detail / supporting clinical data
  COMPLIANCE_MISSING:       'COMPLIANCE_MISSING',       // compliance wording risk / unsupported eligibility phrasing
  SIGNATURE_MISSING:        'SIGNATURE_MISSING',        // note unsigned (links to T3-5)
  CARE_PLAN_MISMATCH:       'CARE_PLAN_MISMATCH',       // note inconsistent with current care plan
  VISIT_FREQUENCY_MISMATCH: 'VISIT_FREQUENCY_MISMATCH', // visit frequency variance vs plan
  MEDICATION_ISSUE:         'MEDICATION_ISSUE',         // medication reconciliation gap
  HOPE_RELATED:             'HOPE_RELATED',             // HOPE window or documentation issue
  BILLING_IMPACT:           'BILLING_IMPACT',           // note holding claim / recert / order processing
} as const;
```

---

### Encounters table additions (Migration 0014)

```typescript
// Add to encounters table
review_status:       pgEnum('note_review_status', [...7 states...]).notNull().default('PENDING')
reviewer_id:         uuid FK → users.id, nullable
reviewed_at:         timestamp, nullable
escalated_at:        timestamp, nullable
escalation_reason:   text, nullable          // required if status = 'ESCALATED'
// Structured revision requests — replaces free-text note
revision_requests:   jsonb.default('[]')     // RevisionRequest[]
// Review metadata
priority:            integer.notNull().default(0)   // 0=normal, 1=high, 2=critical
assigned_reviewer_id: uuid FK → users.id, nullable
due_by:              timestamp, nullable
billing_impact:      boolean.notNull().default(false)
compliance_impact:   boolean.notNull().default(false)
first_pass_approved: boolean.notNull().default(false)
revision_count:      integer.notNull().default(0)
```

**RevisionRequest shape** (stored in `revision_requests` JSONB array):
```typescript
interface RevisionRequest {
  id: string;               // uuid
  deficiencyType: DeficiencyType;
  comment: string;
  severity: 'low' | 'medium' | 'high';
  dueBy: string;            // ISO date
  resolvedAt: string | null;
  resolvedComment: string | null;
}
```

---

### Routes

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/api/v1/review-queue` | supervisor | Filtered queue — query params: `status`, `priority`, `assignedReviewerId`, `billingImpact`, `complianceImpact`, `discipline`, `patientId` |
| `POST` | `/api/v1/encounters/:id/review` | supervisor | Transition status — body: `{ status, revisionRequests?: RevisionRequest[], escalationReason?: string }` |
| `PATCH` | `/api/v1/review-queue/:encounterId/assign` | supervisor | Assign reviewer — body: `{ assignedReviewerId, priority?, dueBy? }` |
| `POST` | `/api/v1/encounters/:id/review/escalate` | supervisor | Escalate — body: `{ escalationReason }` — always requires reason (audit pattern) |
| `GET` | `/api/v1/encounters/:id/review/history` | supervisor + author | Full revision history: original note + each revision cycle side-by-side |
| `POST` | `/api/v1/review-queue/acknowledge` | supervisor | Bulk-acknowledge — body: `{ encounterIds: string[] }` — only valid for `status: 'new'` alerts |

---

### Alert type additions (add to `@hospici/shared-types/alerts.ts`)

```typescript
NOTE_REVIEW_REQUIRED: 'NOTE_REVIEW_REQUIRED',  // note submitted, awaiting supervisor
NOTE_INCOMPLETE:      'NOTE_INCOMPLETE',         // note missing required sections
NOTE_OVERDUE_REVIEW:  'NOTE_OVERDUE_REVIEW',     // review SLA exceeded (dueBy passed)
```

BullMQ daily job checks `encounters` for `review_status IN ('PENDING','IN_REVIEW','RESUBMITTED')` where `due_by < now()` → emits `NOTE_OVERDUE_REVIEW` alert.

---

### Socket.IO events

| Event | Emitted when | Target |
|---|---|---|
| `encounter:revision-requested` | status → `REVISION_REQUESTED` | authoring clinician's session |
| `encounter:resubmitted` | status → `RESUBMITTED` | assigned reviewer's session |
| `review:assigned` | `PATCH /assign` called | assigned reviewer's session |
| `review:overdue` | BullMQ job fires `NOTE_OVERDUE_REVIEW` | supervisor location room |
| `review:approved` | status → `APPROVED` | authoring clinician's session |
| `review:escalated` | status → `ESCALATED` | location room (all supervisors) |

---

### RLS

- `PENDING`, `IN_REVIEW`, `REVISION_REQUESTED`, `RESUBMITTED`: readable by supervisor + authoring clinician
- `APPROVED`: read-only for all roles (no edits permitted)
- `ESCALATED`: readable by supervisor + admin only
- Assignment (`assigned_reviewer_id`): only supervisor/admin can write

---

### Frontend

| File | Purpose |
|---|---|
| `noteReview.functions.ts` | `getReviewQueueFn`, `submitReviewFn`, `assignReviewerFn`, `escalateReviewFn`, `getReviewHistoryFn`, `bulkAcknowledgeFn` |
| `_authed/review-queue/index.tsx` | Queue with client-side saved filter tabs: `Needs Review`, `Revision Requested`, `Resubmitted`, `Overdue`, `High Priority`, `Billing Impact` |
| `ReviewCard` component | Status chip + deficiency chips (one per `DeficiencyType`) + priority badge + `billingImpact` / `complianceImpact` flags + assignee selector + `dueBy` SLA timer |
| `RevisionHistoryPanel` component | Side-by-side: original note text ↔ current draft — client-side diff (`diff` npm package) |
| Socket.IO handlers | All 6 events above → invalidate query + toast notification |

**Queue filter tabs** are client-side preset filter configs only — no DB-persisted saved views (deferred to T3-13 chart audit module).

---

### Backend service

```typescript
// backend/src/contexts/clinical/services/noteReview.service.ts
NoteReviewService.listQueue(filters)          // with Valkey TTL-30s cache per location
NoteReviewService.submitReview(encId, body, reviewerId)  // validates state machine transitions
NoteReviewService.assignReview(encId, body)
NoteReviewService.escalate(encId, reason, reviewerId)   // requires reason — audit mandatory
NoteReviewService.getHistory(encId)
NoteReviewService.bulkAcknowledge(encounterIds)
```

On every status transition: increment `revision_count` (if REVISION_REQUESTED), set `first_pass_approved = true` (if APPROVED and `revision_count === 0`), log to `audit_logs`.

---

### Deferred from this task (follow-on tasks)

| Feature | Deferred to |
|---|---|
| `LOCKED` status set by electronic signature | T3-5 |
| Discipline-specific review checklists | T3-13 (chart audit module) |
| Chart audit / survey-readiness packet | T3-13 |
| Quality scorecards + revision trend reporting | T3-11 (QAPI) |
| AI/rules-assisted QA hints | T4-9 (predictive analytics) |
| Missing signature / unsigned order indicators | T3-5 |
| Attachment-aware review sidebar (orders, care plan) | T3-9 |

---

**Done when:** Queue shows all 7-state encounters with correct filter tabs; structured revision requests stored as `RevisionRequest[]` JSONB (not free-text); all 6 Socket.IO events fire to correct recipients; side-by-side revision history renders; assignment + escalation (with required reason) routes work; `NOTE_REVIEW_REQUIRED` / `NOTE_OVERDUE_REVIEW` alerts appear in T2-8 dashboard; `first_pass_approved` and `revision_count` tracked from first transition; `APPROVED` note cannot be edited; all transitions in `audit_logs`

---

## T2-10 · Visit scheduling + frequency tracking `MEDIUM`

> Enables `MISSED_VISIT` and `VISIT_FREQUENCY_VARIANCE` alert types (deferred from T2-8). Provides the visit frequency plan and actual visit records needed by compliance monitoring.

`needs:` T2-5 (care plan), T2-8 (alert service)

**New tables (Migration 0013):**
- `scheduled_visits` — `patient_id`, `discipline`, `scheduled_date`, `frequency_plan` (from care plan), `status: 'scheduled' | 'completed' | 'missed' | 'cancelled'`
- RLS on `location_id`

**AlertType additions** (add to `@hospici/shared-types/alerts.ts` when this task is built):
- `MISSED_VISIT` — scheduled_date passed, status still `scheduled`
- `VISIT_FREQUENCY_VARIANCE` — completed visits in rolling 30 days < planned frequency

**BullMQ:** Daily job checks `scheduled_visits` for missed → emits `alertService.upsertAlert({ type: 'MISSED_VISIT', rootCause: 'Visit not completed by scheduled date', nextAction: 'Contact clinician to reschedule or document reason' })`

**Routes:**
- `GET /api/v1/patients/:id/scheduled-visits`
- `POST /api/v1/patients/:id/scheduled-visits`
- `PATCH /api/v1/scheduled-visits/:id/status`

**Done when:** Missed visit alert appears in T2-8 dashboard within 24h of missed date; frequency variance alert fires when actual < planned; care plan frequency drives scheduling defaults

