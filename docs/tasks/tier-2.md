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

> Operational staff (DON, billing coordinator, admin) need real-time view of all compliance gaps and claim-blocking issues.

`needs:` T1-6 (BullMQ), T1-8 (Socket.IO), T2-1 (patients)

**AlertType enum** (add to `@hospici/shared-types`):
`NOE_DEADLINE | NOTR_DEADLINE | IDG_OVERDUE | AIDE_SUPERVISION_OVERDUE | HOPE_WINDOW_CLOSING | F2F_REQUIRED | CAP_THRESHOLD | BENEFIT_PERIOD_EXPIRING`

**Alert object schema:**
```typescript
{
  type: AlertType;
  severity: 'critical' | 'warning' | 'info';
  patientId: string;
  patientName: string; // PHI — encrypted at rest, decrypted for authorized roles only
  dueDate: date;
  daysRemaining: number;
  description: string;
}
```

**Backend routes:**
- `GET /api/v1/alerts/compliance`
- `GET /api/v1/alerts/billing`

Pre-computed alerts cached in Valkey (TTL 5 min) — all BullMQ deadline jobs feed into this. Dashboard loads instantly.

**Frontend:**
- Persistent alert banner (count badge) visible on all authed pages
- Full dashboard at `_authed/alerts/index.tsx` — sortable by severity, filterable by type, patient deep-link
- Critical alerts (0 days remaining): red + pulsing indicator
- Socket.IO `alert:new` pushes real-time updates

**Done when:** Dashboard shows all 8 alert types from real data; Socket.IO pushes new alert within 1s of BullMQ detecting gap; Valkey cache hit on second request; PHI fields only visible to roles with `PHI_ACCESS` permission

---

## T2-9 · Note review system `MEDIUM`

> Supervisors (DON, clinical manager) review in-progress and finalized notes. Enables compliance coaching and prevents documentation liabilities.

`needs:` T1-4 (audit), T1-8 (Socket.IO), T2-1

**Encounters table additions:**
- `review_status: pgEnum('note_review_status', ['PENDING', 'APPROVED', 'REVISION_REQUESTED'])`
- `reviewer_id`, `review_note`, `reviewed_at`

**Routes:**
- `GET /api/v1/review-queue` (supervisor only — all encounters with `review_status: 'PENDING'`)
- `POST /api/v1/encounters/:id/review` (supervisor only — body: `{ status: 'APPROVED' | 'REVISION_REQUESTED'; note?: string }`)

**Workflow:** When `REVISION_REQUESTED`, Socket.IO emits `encounter:revision-requested` to clinician's session with reviewer's note. Clinician edits, re-submits; status returns to `PENDING`.

**RLS:** `PENDING` and `REVISION_REQUESTED` readable by supervisor + authoring clinician. `APPROVED` is read-only for all roles.

**Audit:** Every status transition logged to `audit_logs`.

**Done when:** Supervisor sees pending notes queue; `REVISION_REQUESTED` triggers Socket.IO to clinician; approved note cannot be edited; all transitions in audit log
