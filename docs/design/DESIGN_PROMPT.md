# Hospici — Frontend Design Prompt

> **Purpose:** Feed this document into a design session (Pencil, Figma, or any AI design tool) to generate the full Hospici UI.
>
> **Load order:** Read this file entirely before designing any screen. It overrides generic UI patterns — Hospici is a clinical compliance application, not a consumer app.
>
> **Design system source of truth:** `docs/design-system.md` — OKLCH tokens, shadcn/ui component specs, and CMS compliance component code are defined there. This prompt references them; it does not re-define them.
>
> **Screen count:** 56 distinct screens + modals + print layouts. Organized in §5 (core 23), §5B (additional 27 found in codebase audit), and §5B.28–5B.33 (6 role-specific screens from 30-role ABAC model). Roles source: `backend/docs/SECURITY_MODEL.md` v3.0. Designed in priority order per §10.

---

## 1. Product Identity

**Hospici** is a HIPAA-compliant hospice management platform for clinical staff, billing coordinators, and administrators. Users are healthcare professionals working in high-stakes, time-constrained environments — often on tablets in patient homes.

### Design Principles

| Principle | What it means in practice |
|-----------|--------------------------|
| **Density over decoration** | Clinical staff scan for data, not aesthetics. Prioritize information density. No hero images, no gradients for decoration. |
| **Compliance is non-negotiable** | Certain UI states cannot be dismissed, closed, or bypassed. These are encoded in law (42 CFR §418). |
| **Field-first** | Primary user is a nurse charting on a 10" tablet in a patient's living room. Touch targets ≥44px. One-handed thumb reach considered for primary actions. |
| **Hierarchy of urgency** | `destructive` (red) = legal block or patient safety. `warning` (amber) = approaching deadline. `success` (green) = completed. `clinical` (teal) = informational. |
| **Role-aware** | A physician sees their order inbox. A billing coordinator sees claims. An aide sees their supervision schedule. The same screen has different affordances per role. |

### What this app is NOT

- Not a consumer health app (no rounded friendly illustrations)
- Not a dashboard-heavy analytics tool (data exists to enable action, not admiration)
- Not a legacy clinical system (no tables-inside-tables, no modals-inside-modals)

---

## 2. Design System Summary

> Full specs in `docs/design-system.md`. Key constraints repeated here for design context.

### Color Tokens

| Token | OKLCH | Use |
|-------|-------|-----|
| `primary` | `oklch(0.623 0.214 259.8)` — Clinical Blue | Primary CTAs, nav selection |
| `destructive` | `oklch(0.577 0.245 27.3)` — Red | Hard blocks, critical alerts, delete |
| `warning` | `oklch(0.769 0.188 84.6)` — Amber | Deadline warnings, 80%+ cap |
| `success` | `oklch(0.527 0.154 150.1)` — Green | Completed, signed, saved |
| `clinical` | `oklch(0.591 0.126 181.3)` — Teal | Clinical decision support, informational |
| `muted` | `oklch(0.965 0.009 264.5)` — Light gray | Secondary text, timestamps |

### Typography

- **Inter** — all UI text, labels, headings
- **JetBrains Mono** — all clinical numeric data: MRN, vitals, pain scores, doses, dates/times in dense tables

### Component Library

shadcn/ui (Radix UI primitives). Copy-owned. All in `frontend/src/components/ui/`. Never import from `node_modules`.

---

## 3. Application Shell

### Layout

```
┌─────────────────────────────────────────────────────────┐
│ TOP BAR (h-14, sticky)                                  │
│ [Logo] [Location selector]     [Alerts badge] [User]    │
├──────────┬──────────────────────────────────────────────┤
│          │                                              │
│ SIDEBAR  │  MAIN CONTENT AREA                           │
│ (w-64,   │                                              │
│ fixed,   │  [Patient header — sticky, shown when        │
│ desktop) │   patient is in context]                     │
│          │                                              │
│          │  [Page content]                              │
│          │                                              │
└──────────┴──────────────────────────────────────────────┘
```

**Top bar:** Height 56px. Logo left. Location selector (dropdown, multi-location users). Right: Alert bell with count badge (red, pulsing if critical alerts exist), user avatar + role chip.

**Sidebar:** Width 256px on desktop, collapses to icon-only rail (48px) on tablet. Bottom of sidebar: Session timer (counts down from 30 min idle with amber at 5 min remaining, see §7.2).

**Patient header:** Shown only on patient-scoped routes (`/patients/:id/*`). Sticky below top bar. Displays: patient name, MRN (monospace), admission status badge, care model chip (HOSPICE/PALLIATIVE/CCM), last-saved timestamp, Save Now button. Contains decline trajectory sparklines (4 mini charts, see §6.5).

**Break-glass banner:** When active, renders as a full-width amber stripe below patient header. Not dismissable. Shows expiry countdown + reason.

### Sidebar Navigation

Nav items are **role-filtered** — each role group sees only its relevant sections (see §4). Section headers are non-clickable labels. Roles with no clinical access (billing, scheduler, intake, etc.) see a simplified sidebar with only their relevant sections.

```
─────────────────────
  Dashboard
─────────────────────
  Patients                    ← CLINICAL_DIRECT, PHYSICIAN, SUPERVISORY, ADMIN
  Global Search  ⌘K
─────────────────────
  CLINICAL                    ← CLINICAL_DIRECT, SUPERVISORY, EMERGENCY
  Encounters
  VantageChart
  Assessments
  Medications
  Care Plans
─────────────────────
  COMPLIANCE                  ← CLINICAL_DIRECT, PHYSICIAN, SUPERVISORY, ADMIN
  IDG Meetings
  Aide Supervision
  F2F Documentation
  NOE / NOTR
  Benefit Periods
  Hospice Cap
  HOPE / HQRP
─────────────────────
  BILLING                     ← BILLING, ADMIN
  Claims
  ERA Remittance
  QAPI
─────────────────────
  OPERATIONS                  ← OPERATIONAL, ADMIN
  Scheduling          ← scheduler, admin
  Intake / Referrals  ← intake_coordinator, admin
  Bereavement         ← bereavement_coordinator, social_worker
  DME Orders          ← dme_coordinator, admin
  Pharmacy Review     ← pharmacy_consultant
─────────────────────
  OVERSIGHT                   ← SUPERVISORY, QUALITY_COMPLIANCE, ADMIN
  Review Queue
  Alerts
  Reports
  Audit Log
─────────────────────
  ADMIN                       ← admin, super_admin
  User Management
  BAA Registry
  FHIR / API Settings
  VantageChart Templates
  Settings
─────────────────────
  [Session: 24:13]
─────────────────────
```

---

## 4. Role-Based UI Variation

**30 roles** defined in `backend/docs/SECURITY_MODEL.md` v3.0 (ABAC via CASL). The previous 7-role model was v2.0 and is deprecated. All role references in this document use the v3.0 names.

UI must adapt per role — hide nav items the role cannot access, disable actions the role cannot perform. Role groups (defined in `ABACService`) simplify policy checks in frontend guards.

**Universal for all roles:** Alert banner (own-scope alerts only), session timer, global search, My Profile.

---

### Role Groups & Access Summary

#### Group: CLINICAL_DIRECT
> `registered_nurse` · `lpn` · `social_worker` · `chaplain` · `physical_therapist` · `occupational_therapist` · `speech_therapist` · `dietitian`

| Role | Primary screens | Key differences vs RN |
|------|----------------|-----------------------|
| `registered_nurse` | Patients, Encounters, VantageChart, All 5 assessments, Medications, Care Plan (RN), IDG, Aide Supervision, Orders (create) | Primary documenter. Full clinical access. Can create NOE. |
| `lpn` | Patients, Encounters (ADL/basic notes only), Assessments (limited), Medications (administer, no prescribe) | Cannot sign recertifications. Cannot create NOEs. VantageChart available (aide variant). |
| `social_worker` | Patients (assigned), Encounters (SW discipline), Care Plan (SW section), IDG, Bereavement notes | No medication access. Cannot create orders. |
| `chaplain` | Patients (assigned), Encounters (chaplain discipline), Care Plan (chaplain section), IDG | Spiritual care notes only. No clinical charting. |
| `physical_therapist` | Patients (assigned), Encounters (therapy), Care Plan (therapy section), IDG | PT-specific VantageChart steps. |
| `occupational_therapist` | Patients (assigned), Encounters (therapy), Care Plan (therapy section), IDG | OT-specific VantageChart steps. |
| `speech_therapist` | Patients (assigned), Encounters (therapy), Care Plan (therapy section), IDG | SLP-specific VantageChart steps. |
| `dietitian` | Patients (assigned), Encounters (nutrition), Care Plan (nutrition section), IDG | Nutrition assessment and meal plan. |

#### Group: CLINICAL_AIDE
> `aide_cna` · `aide_hha`

| Role | Primary screens | Restrictions |
|------|----------------|--------------|
| `aide_cna` | Assigned patients only (read-only summary), ADL documentation, Aide Supervision (own records) | No medication access. No clinical notes. No orders. |
| `aide_hha` | Same as `aide_cna` | Same restrictions. Both see VantageChart (ADL/Aide variant only). |

#### Group: PHYSICIAN
> `physician_attending` · `physician_np` · `medical_director` · `physician_consultant`

| Role | Primary screens | Key differences |
|------|----------------|-----------------|
| `physician_attending` | Order Inbox (sign/reject), Encounters (read), F2F documentation, Recertification sign, Patient list (read) | Cannot document clinical notes. Primary order signer. |
| `physician_np` | Same as `physician_attending` | Can document SOAP notes. Nurse practitioner scope. |
| `medical_director` | All physician screens + QAPI, Location-level reports, Supervisory review | Signs recertifications as Medical Director. QAPI oversight. |
| `physician_consultant` | Patient summary (read-only, consult-scoped), Encounters (read, consulted cases only) | Limited to cases where they are the consulting physician. |

#### Group: SUPERVISORY
> `clinical_supervisor_rn` · `clinical_director`

| Role | Primary screens | Key differences |
|------|----------------|-----------------|
| `clinical_supervisor_rn` | All clinical + Note Review Queue + Team roster (assigned staff) | Can approve/reject clinician notes. Supervisory audit view. Break-glass eligible. |
| `clinical_director` | Everything `clinical_supervisor_rn` can do + Location admin + Full reporting + QAPI oversight | Director of Nursing role. Highest clinical authority at location. |

#### Group: OPERATIONAL
> `intake_coordinator` · `scheduler` · `volunteer` · `volunteer_coordinator` · `bereavement_coordinator` · `emergency_oncall`

| Role | Primary screens | Key differences |
|------|----------------|-----------------|
| `intake_coordinator` | Referral Intake (§5B.28), Patient Admission Wizard (create only), Insurance verification, Patient list (read) | No clinical documentation after admission. No billing write. |
| `scheduler` | IDG Scheduling, Visit scheduling calendar, Aide supervision schedule | No clinical content. No patient PHI beyond name/schedule. |
| `volunteer` | Volunteer schedule (own), Activity log (own) | No patient records. No PHI. |
| `volunteer_coordinator` | Volunteer roster, Volunteer schedules, Activity reports | No patient clinical records. |
| `bereavement_coordinator` | Bereavement support (§5B.29), Patient list (read, post-death only), Family contact records | Activated after patient death. No clinical charting. |
| `emergency_oncall` | Full clinical access (after-hours context), After-hours encounters | Break-glass eligible. After-hours documentation with mandatory `oncall` flag on encounter. |

#### Group: BILLING
> `billing_specialist` · `revenue_manager`

| Role | Primary screens | Key differences |
|------|----------------|-----------------|
| `billing_specialist` | NOE/NOTR, Claims, Benefit Periods, Cap, ERA Remittance, Pre-submission audit | No clinical note content. Sees patient demographics (name, MRN) for billing context. |
| `revenue_manager` | Everything `billing_specialist` + Reports, QAPI (read), Audit log (location scope) | RCM oversight. Can override WARN-level claim audit failures. |

#### Group: QUALITY_COMPLIANCE
> `quality_assurance` · `compliance_officer`

| Role | Primary screens | Key differences |
|------|----------------|-----------------|
| `quality_assurance` | QAPI (full), Audit log (location), Reports, Patient list (read), Encounters (read) | No clinical write. QAPI primary owner. |
| `compliance_officer` | Everything + BAA Registry, Security settings, Audit log (full), ADR Export | HIPAA compliance lead. Can access ADR export. |

#### Group: ADMINISTRATIVE
> `admin` · `super_admin` · `operations_manager` · `hr_admin`

| Role | Primary screens | Key differences |
|------|----------------|-----------------|
| `admin` | All location screens — clinical, billing, scheduling, QAPI, reports, user management | Location-scoped. Cannot access other locations. |
| `super_admin` | All screens across all locations + FHIR/API settings, VantageChart templates, system config | System-wide access. Only role that can manage FHIR apps. |
| `operations_manager` | Reports, Location settings, Staff roster (read), Billing (read), QAPI (read) | Operational view. No clinical documentation. |
| `hr_admin` | User management (create/deactivate staff accounts), Role assignment | **No patient access whatsoever.** Personnel administration only. |

#### Group: EXTERNAL
> `pharmacy_consultant` · `dme_coordinator`

| Role | Primary screens | Key differences |
|------|----------------|-----------------|
| `pharmacy_consultant` | Medication review (§5B.30), Drug interaction reports | Read-only. Scoped to medication data only. No patient demographics except MRN. |
| `dme_coordinator` | DME order tracking (§5B.31), Equipment inventory | Read-only patient context. Manages equipment orders from physicians. |

#### Group: SURVEYOR _(time-limited, survey-scoped)_
> `surveyor_state` · `surveyor_accreditation`

Both roles are **temporary** — granted during active CMS survey or TJC/ACHC accreditation visit. Read-only. Scoped to surveyed records. No PHI write. All access logged with `survey_type` metadata.

UI: Surveyor portal is a **separate read-only context** (`/survey`) — not the standard clinical navigation. Shows: patient census, selected encounters, IDG records, QAPI events, compliance metrics. No edit affordances anywhere.

#### Group: PORTAL _(external-facing, separate app surface)_
> `family_caregiver` · `patient_portal`

These roles access a **separate minimal portal** — not the clinical application. Out of scope for this design document. Placeholder: `/portal` route context, distinct branding, no clinical nav.

| Role | Access |
|------|--------|
| `family_caregiver` | Patient summary (non-clinical), Care plan (family copy, read-only), Bereavement resources post-death |
| `patient_portal` | Billing summary (EOB), Care plan summary (read-only), Appointment summary |

---

## 5. Screen Inventory

### 5.1 Authentication

**Login** (`/login`)
- Email + password fields
- "Sign in" button (primary)
- TOTP code field (appears after email/password verified — step 2)
- No "remember me" — HIPAA §164.312(a)(2)(iii) session control
- Error: "Invalid credentials" — never specify which field is wrong

**MFA Enrollment** (forced on first login)
- QR code for authenticator app
- Manual entry fallback (base32 seed)
- Verification code field + "Verify and continue"
- Cannot skip

**Session Expiry Warning**
- Toast (Sonner) at 25 min idle: "Session expiring in 5 minutes"
- Full-screen overlay at 30 min: "Session expired for security. Please sign in again." — no dismiss, redirect to login

---

### 5.2 Dashboard (`/dashboard`)

Role-aware home page. Not a KPI vanity board — a work queue.

**Layout:** Two columns, 8:4 ratio.

**Left (8/12):**
- Compliance alerts panel — top 5 most urgent from all 8 alert types. "View all →" link.
- Today's schedule: encounters due, IDG meetings, aide supervisions
- Patients requiring attention: IDG overdue (red), HOPE window closing (amber), benefit period expiring (amber)

**Right (4/12):**
- My patients count chip
- Last signed note timestamp
- Cap year gauge (if billing role)
- Quick actions: "New Admission", "Start Visit Note", "File NOE"

---

### 5.3 Patient List (`/patients`)

Filterable, sortable table.

**Columns:** Name, MRN, Admission Date, Status badge, Care Model chip, IDG Due (badge: red if overdue, amber if within 3 days, green if OK), NOE Status, Primary Clinician.

**Filters (top bar):** Status (admitted/discharged), Care Model, Primary Clinician, Compliance flag (IDG overdue, HOPE pending).

**Row action:** Click → patient detail. No row-level inline actions (keeps density clean).

**Empty state:** "No patients match your filters" with clear-filters button.

---

### 5.4 Patient Detail / Chart (`/patients/:id`)

This is the master layout for all patient-scoped work. The **patient header** (see §3) is always visible. Content area below it uses a tabbed navigation:

**Tabs:** Overview · Encounters · Assessments · Medications · Care Plan · IDG · Orders · Timeline

**Overview tab:**
- Left: Patient demographics (PHI fields — name, DOB masked by default, reveal on click with audit), diagnoses, allergies (critical allergy alert if present), primary physician, care team
- Right: Benefit period timeline widget, cap utilization gauge, next IDG date, HOPE window status
- Decline trajectory sparklines (4 mini charts: pain, dyspnea, nausea, functional status) — see §6.5

---

### 5.5 Patient Admission (`/patients/new`)

Multi-step form. 5 steps shown as a top progress bar.

**Step 1 — Demographics:** Name, DOB, address, phone, emergency contact (all PHI — encrypted at rest)

**Step 2 — Clinical:** Primary diagnosis (ICD-10 search), secondary diagnoses, allergies, care model selector (HOSPICE / PALLIATIVE / CCM)

**Step 3 — Physician:** Attending physician (search + select), certifying physician, F2F status

**Step 4 — Election:** Election date (NOE date picker with 5-business-day deadline auto-calculated), benefit period start

**Step 5 — Care Team:** Assign primary RN, SW, chaplain, aide

**Sticky footer:** Step indicator + Back / Next / "Admit Patient" (step 5 only, destructive variant with confirmation dialog)

---

### 5.6 Encounters / Visit Notes

**Encounter List** (`/patients/:id/encounters`)
- Chronological list. Each row: Date, Visit type badge, Clinician, Status (Draft / Pending Review / Approved / Signed), Review status chip.
- "Start New Visit" button (primary, top right)

**New/Edit Encounter** (`/patients/:id/encounters/new` or `/:encId/edit`)
- Left panel: Visit metadata (date, type, clinician, vital signs)
- Main panel: Note text area (free text fallback) OR VantageChart launcher button (primary CTA)
- Right rail: Care plan quick-reference (collapsed by default), medication list, last 3 pain scores

**VantageChart Entry Point:** Prominent card with "Generate with VantageChart™" button. Below it: "Manual entry" link in muted text. This is the primary documentation method.

**Signed Encounter** (read-only)
- Note text (read-only, non-editable)
- VantageChart method chip: "Template" or "Template + AI Enhanced"
- Signature block: clinician name, timestamp, signature hash
- Review status chip + reviewer name + review note (if applicable)
- No edit affordance. Re-opening requires supervisor approval logged to audit.

---

### 5.7 VantageChart™ Wizard (`/patients/:id/encounters/:encId/vantage-chart`)

> See `docs/tasks/tier-2.md §T2-7` for full architecture.

**Layout:** Two-panel, 60/40 split. Persistent. No chrome (sidebar hidden, patient header pinned).

**Left panel (60%) — Step input:**
- Step progress bar across top (9 steps, pill-style)
- Current step form (one step visible at a time)
- QuickActions bar above form: contextual shortcuts ("Same as last visit", "Pain resolved", "Patient sleeping")
- Voice input toggle (microphone icon, top right of panel)
- Back / Continue / "Generate Draft" (final step)

**Right panel (40%) — Live narrative preview:**
- Real-time updating narrative text (debounced 500ms)
- Compliance ring: circular progress indicator (0–100%) showing completeness of required fields. Sections turn green as completed.
- "Enhance with AI" button (below narrative, disabled until Layer 1 complete)
- When AI enhanced: diff view — original text gray strikethrough, enhanced text below. "Revert to template" link.
- Word count + estimated reading time (clinical context: DON reviewing notes)

**9 Steps:**

| Step | Key inputs |
|------|------------|
| 1 · Patient Status | Consciousness level, orientation, comfort level, position tolerated |
| 2 · Pain Assessment | Pain scale selector (NRS/FLACC/PAINAD/FACES/ESAS), score, location body map, character, aggravating/relieving factors |
| 3 · Symptom Review | CheckboxGrid (3-col): dyspnea, nausea, fatigue, anxiety, constipation, anorexia, secretions, edema, wound status |
| 4 · Interventions | Medications administered (from MAR), repositioning, wound care, oxygen, comfort measures — CheckboxGrid |
| 5 · Psychosocial | Patient/family response to illness, coping, spiritual/cultural needs, anticipatory grief |
| 6 · Care Plan | Goals reviewed toggle, active SMART goals review (read-only pull from care plan), deviations noted |
| 7 · Safety | Fall risk (low/medium/high), home environment, caregiver capability, equipment functioning |
| 8 · Plan Changes | Any changes to medication, frequency, services, physician orders needed |
| 9 · Review | Full narrative preview, clinician attestation checkbox, submit to review queue |

**Step transitions:** Slide in from right (AnimatePresence, framer-motion).

**Auto-save:** Each completed step saves draft. Unsaved indicator in right panel header.

---

### 5.8 Pain Assessments (`/patients/:id/assessments`)

**Assessment List:** Table. Columns: Date, Scale Type badge, Score, Clinician, Summary.

**New Assessment Form:**
- Scale selector at top (5 tabs: NRS · FLACC · PAINAD · FACES · ESAS)
- Form fields change per scale type
- **NRS:** VisualAnalogScale slider (0–10, colored gradient: green→yellow→red). Score rendered large in JetBrains Mono.
- **FLACC:** 5 category selectors (Face, Legs, Activity, Cry, Consolability), each 0–2. Total auto-calculated.
- **PAINAD:** 5 category selectors (Breathing, Vocalization, Facial Expression, Body Language, Consolability), 0–2 each.
- **FACES:** 6 face image buttons (0,2,4,6,8,10). Patient selects their face.
- **ESAS:** 10 sliders (Pain, Tiredness, Drowsiness, Nausea, Lack of Appetite, Shortness of Breath, Depression, Anxiety, Wellbeing, Other). All 0–10.

---

### 5.9 Care Plan (`/patients/:id/care-plan`)

**Layout:** Left rail = discipline tabs (RN · SW · Chaplain · Therapy · Aide). Content area = selected discipline's section.

**Each discipline section:**
- Free-text assessment narrative
- SMART Goals sub-section: expandable list of goals. Each goal shows: goal statement, SMART breakdown (5 fields, collapsible), target date, status badge (Active / Met / Revised). "+ Add Goal" button.
- Last updated by + timestamp in muted text footer

**Read-only for other disciplines:** SW can see RN section but cannot edit. Only a user's own discipline section is editable.

**Autosave per section:** Save indicator in section header.

---

### 5.10 Medications (`/patients/:id/medications`)

**Medication List:**
- Active medications table: Name, Dose, Route, Frequency, Start Date, Prescriber, Drug interactions badge (amber if interactions found)
- "Add Medication" button → slide-in sheet (not modal — keeps patient context visible)

**Medication Detail Sheet:**
- All fields editable (registered_nurse role)
- Drug interaction panel: pulls from OpenFDA. Show interacting medications list with severity badge.
- MAR tab: administration history, "Record Administration" button (fires `medication:administered` Socket.IO event)

**Critical allergy conflict:** If medication matches a documented allergy, render a full-width destructive alert above the medication form. Cannot proceed without supervisor override.

---

### 5.11 IDG Meetings (`/patients/:id/idg` or `/idg`)

**IDG List:** Table with compliance status. Days-since-last-IDG counter. Overdue = red banner at top.

**IDG Overdue Hard-Block Modal:** See `docs/design-system.md §8.1`. Appears over any patient-scoped page when IDG is overdue. No dismiss. No close X. One button only.

**No-Prep IDG — Live Meeting View** (`/patients/:id/idg/:meetingId/live`):
- Full-screen meeting mode. Clean, minimal.
- Top: Meeting date, attendees (avatar list with role chips)
- Center: Each discipline has a card with their structured input fields (status update text, goals reviewed toggle, concerns textarea)
- All attendees can type simultaneously (real-time feel, saved on input blur)
- "Close Meeting" button (bottom right, primary) — triggers assembled IDG note generation
- Assembled note preview (read-only) shown after close, with "Sign Meeting Record" CTA

---

### 5.12 Aide Supervision (`/patients/:id/aide-supervision` or `/aide-supervision`)

**Supervision tracker:**
- Calendar view of all aide supervisions. Each cell: aide name, supervision date, supervising RN.
- Overdue (>14 days): red cell. Due within 2 days: amber. OK: green.
- "Record Supervision" button → sheet form

**Compliance alert:** Alert banner if any patient aide supervision is overdue. Links directly to the patient.

---

### 5.13 NOE / NOTR (`/billing/noe`)

**NOE List:** Table. Columns: Patient, Election Date, Filing Deadline (auto-calculated + color coded), Status badge (Draft / Submitted / Accepted / Rejected), Days Remaining.

**NOE Create/Edit:**
- Election date (NOE date picker with 5-business-day deadline preview — see `docs/design-system.md §7.6`)
- State machine status stepper: Draft → Submitted → Accepted/Rejected
- Rejection workflow: reason textarea, re-file button

**NOTR:**
- Auto-generated when revocation is recorded. Banner: "NOTR required by [date]"
- NOTR filing form mirrors NOE form structure

---

### 5.14 Benefit Periods

**Benefit Period Timeline** (visible on patient overview + dedicated page):
- Horizontal timeline. 4 periods shown as colored segments: 90d · 90d · 60d · 60d
- Current period highlighted. Elapsed days shown. Days remaining shown.
- F2F indicator on period 3+ : green checkmark if documented, red warning if missing.

---

### 5.15 Hospice Cap (`/billing/cap`)

**Location-level cap dashboard:**
- Large cap utilization gauge (circular, 0–100%). Red zone at 80%+.
- Cap year label: "Nov 1, 2025 – Oct 31, 2026"
- Patient-level breakdown table: each admitted patient's per-day cap contribution
- "Alert at 80%" toggle (should always be on)

---

### 5.16 HOPE / HQRP (`/hope`)

**HOPE Assessment Form** (`/patients/:id/hope/:assessmentId`):
- Section accordion (HOPE-A sections A through Q)
- Each section has a progress indicator: % of required fields complete
- **Completeness ring** (top right, persistent): circular 0–100% gauge. Updates in real time as clinician fills fields. Sections fill green as completed. "Ready to Submit" state at 100%.
- "Submit to iQIES" button — disabled until completeness = 100%

**Quality Benchmark Dashboard** (`/hope/benchmarks`):
- 4 measure cards: NQF #3235, #3633, #3634, HCI
- Each card: location score (large) vs CMS national average (smaller, muted). Trend sparkline (4 quarters).
- Color: above average = success, below = warning, significantly below = destructive

---

### 5.17 Compliance Alert Dashboard (`/alerts`)

**Alert banner (global, persistent):** Fixed at top of main content area (below top bar) on all authed pages. Shows: count of critical alerts (red badge), count of warnings (amber badge). Click → alert dashboard. Pulsing animation on critical.

**Alert Dashboard:**
- Full-page. Two columns: Critical (left, destructive bg tint) · Warning/Info (right).
- Each alert card: AlertType chip, patient name + MRN, daysRemaining counter (large, monospace), description, "Go to Patient →" link.
- Filters: All · NOE · NOTR · IDG · Aide · HOPE · F2F · Cap · Benefit Period
- Sort: Days Remaining (default), Patient Name, Alert Type
- Real-time: Socket.IO `alert:new` inserts a card with slide-down animation

---

### 5.18 Note Review Queue (`/review-queue`) — Supervisor only

**Review Queue:**
- Table: Patient, Encounter Date, Clinician, Visit Type, Days in Queue, Status.
- "PENDING" tab (default) · "REVISION REQUESTED" tab · "APPROVED" (recent, last 7 days)

**Review Detail** (`/review-queue/:encounterId`):
- Left: Encounter note (read-only, rendered markdown-style prose)
- Right: Review panel
  - "Approve" button (success)
  - "Request Revision" button (outline → opens textarea for revision note, then confirm)
  - Revision note history (if prior revisions)
- Socket.IO `encounter:revision-requested` pushes toast to clinician's session

---

### 5.19 Physician Order Inbox (`/orders/inbox`) — Physician only

**Inbox:**
- Cards, not a table (scanning is easier for physicians). Each card: Order type chip, patient name, ordering clinician, content summary, due date countdown (CMS 72h for verbals), action buttons.
- "Sign" button (primary) → signature confirmation dialog → signed confirmation
- "Reject" button (outline destructive) → rejection reason textarea → confirm

**Unsigned verbal order at 71h:** Card turns red, amber pulsing border. Socket.IO `order:expiring` triggers toast.

---

### 5.20 ADR Export (`/patients/:id/export`)

- Date range pickers (from / to)
- "Request Export" button → triggers BullMQ async job
- Progress bar (polling) → "Download Export" button when ready
- Export hash displayed (SHA-256, monospace) for tamper verification
- Access: super_admin + compliance_officer only. Other roles see 403 message.

---

### 5.21 QAPI (`/qapi`)

**Event List:** Table. Type chip, reported by, occurred at, status badge, action items count.

**New Event Form:**
- Event type selector
- Patient association (optional)
- Occurrence date + description
- Root cause analysis (textarea, collapsible)
- Action items (dynamic list: action description, assigned to, due date)

**Overdue action items:** Highlighted amber in event table. Alert dashboard integration.

---

### 5.22 Pre-Submission Claim Audit (`/billing/claims/:claimId/audit`)

**Audit Result Panel:**
- Pass/Fail banner (success or destructive)
- Rule list: each rule as a row. Status: PASS (checkmark, green) · BLOCK (X, red) · WARN (triangle, amber)
- BLOCK items: Cannot submit. Must resolve first.
- WARN items: "Override" button → reason textarea → supervisor confirmation → logged to audit
- "Submit Claim" button — only enabled when 0 BLOCK failures

---

### 5.23 Settings (`/settings`)

**User Management** (admin/super_admin):
- User list table, role chip per user, invite button, deactivate toggle
- Role editor: checkboxes mapped to ABAC permissions (read-only display for most; editable by super_admin only)

**Location Settings:**
- Location name, address, NPI
- Active CMS periods: current benefit period, cap year display

**BAA Registry** (super_admin only):
- Vendor table: Name, PHI type exposed, BAA status (signed/pending/not-required), BAA date
- Add vendor row

---

## 5B. Additional Screens

> These screens were identified through codebase audit of backend schemas, route stubs, and task tier specs. They complete the full product surface area.

---

### 5B.1 Patient Discharge Workflow (`/patients/:id/discharge`)
- **Roles:** registered_nurse, admin
- **Trigger:** "Discharge Patient" button on patient overview (destructive, requires confirmation)
- **Layout:** Single-page form with discharge type selector at top — drives what fields appear below.
- **Discharge types:**
  - **Expected Death** — most common. Date of death, time, pronouncing physician, location (home/inpatient). Triggers HOPE-D 7-day window alert.
  - **Revocation** — patient revokes election. Triggers NOTR 5-business-day deadline + auto-generates NOTR record. Reason text (min 20 chars) required.
  - **Transfer to another hospice** — receiving agency NPI required. Triggers NOTR.
  - **Live discharge** — patient no longer meets hospice criteria. Physician documentation required.
- **CMS rules enforced:**
  - Discharge date cannot be future date
  - HOPE-D window shown: `discharged_at + 7 days`
  - NOTR generated automatically on revocation/transfer (5 business days)
- **Done when:** Status transitions to `discharged`; HOPE-D window alert fires; NOTR auto-generated if applicable.

---

### 5B.2 Death Documentation (`/patients/:id/death`)
- **Roles:** registered_nurse, admin
- **Route:** Sub-step of discharge workflow (type = Expected Death) or standalone if not yet discharged
- **Fields:** Date of death (date picker), time of death (time input), pronouncing clinician (search/select), location at time of death (home / inpatient / SNF / hospital), witness name (optional), family notified toggle, physician notification timestamp
- **Triggers:** HOPE-D assessment window (7 calendar days). Banner appears on patient record: "HOPE-D required by [date]".
- **Clinical significance:** Death documentation is the start of the HOPE-D filing clock.

---

### 5B.3 Revocation Workflow (`/patients/:id/revoke`)
- **Roles:** registered_nurse, admin
- **Entry point:** "Record Revocation" action on patient overview or NOE detail
- **Fields:** Revocation date, reason (free text, min 20 chars), patient/family representative who requested, clinician documenting
- **Immediate effects:** NOTR record auto-generated (5-business-day deadline shown), NOE status transitions to `revoked`, benefit period closed, cap contribution calculation frozen
- **Confirmation modal:** "This will close the patient's hospice election and generate a required NOTR. This cannot be undone without supervisor override." — destructive confirm button.

---

### 5B.4 Recertification Workflow (`/patients/:id/recertify`)
- **Roles:** registered_nurse (clinical narrative), admin (administrative), physician_attending / physician_np (certification signature)
- **Layout:** Stepper, 3 steps
  - **Step 1 — Clinical summary:** Clinician documents continued hospice eligibility (6-month prognosis), functional decline narrative, current diagnoses with progression
  - **Step 2 — F2F (Period 3+ only):** If this is benefit period 3 or 4, F2F documentation is required. Fields: F2F date (must be within 30 days prior to recert), setting (home/office/telehealth), physician who conducted F2F, clinical findings
  - **Step 3 — Physician certification:** Physician signs the recertification electronically (T3-5 e-signature). Counter-signature by Medical Director if required by location policy.
- **CMS block:** Period 3/4 "Complete Recertification" button disabled if no valid F2F date within 30 prior days. Error: "Face-to-face encounter required for period 3+ recertification."
- **On completion:** New benefit period record created, previous period closed, recertification logged to audit.

---

### 5B.5 Face-to-Face Documentation (`/patients/:id/f2f/new`)
- **Roles:** registered_nurse (creates), physician_attending / physician_np (countersigns)
- **Standalone form** (can also be inline in recertification step 2)
- **Fields:** Encounter date, encounter setting (home visit / office visit / telehealth), physician (search/select), clinical narrative (free text — findings supporting continued hospice eligibility, 6-month prognosis, functional status), signed attestation checkbox
- **Physician e-signature required to finalize**
- **Done when:** F2F record linked to benefit period; recertification unblocked for period 3/4.

---

### 5B.6 New IDG Meeting — Schedule Form (`/patients/:id/idg/new`)
- **Roles:** registered_nurse, admin
- **Context:** This is the destination of the IDG Hard-Block Modal's single CTA. Also accessible from IDG tab.
- **Fields:** Scheduled date/time (date+time picker), location/format (in-home / office / telehealth / phone), required attendees checklist (RN, MD, SW — all required by 42 CFR §418.56; chaplain, therapy optional), patient/family participation toggle
- **Validation:** Cannot schedule in the past. Must be within 7 days for overdue patients.
- **On save:** IDG record created with `status: 'scheduled'`; IDG hard-block modal clears for this patient; calendar entry in scheduling view.

---

### 5B.7 Electronic Signature Capture (`/patients/:id/sign/:documentType/:documentId`)
- **Roles:** registered_nurse (clinical docs), physician_attending / physician_np (orders, recerts, F2F), admin (admin docs)
- **Used by:** Encounters, orders, recertifications, F2F, IDG meeting records
- **Layout:** Document preview (read-only) on left/top, signature panel on right/bottom
- **Signature panel:**
  - "I attest that the above documentation is accurate and complete" — attestation text (cannot edit)
  - Signature input: typed name (legal electronic signature standard) + confirm button
  - On sign: document becomes immutable, signature hash logged to `audit_logs`, timestamp and signer ID stored
- **Re-sign blocked:** If document already has status `signed`, returns 409 with "Document is already signed."
- **Document types:** encounter, order, recertification, f2f, idg_record, consent

---

### 5B.8 Claims List (`/billing/claims`)
- **Roles:** billing_specialist, admin, super_admin
- **Display:** Table
- **Columns:** Patient, Claim Period, Type (837i), Status badge (Draft / Pending Audit / Audit Failed / Queued / Submitted / Accepted / Rejected), Filed Date, Amount, Clearinghouse Response
- **Filters:** Status, date range, patient
- **Row actions:** "View audit →", "Re-submit" (if rejected), "Download 837i"
- **Button:** "Create Claim" (top right)

---

### 5B.9 Claim Detail (`/billing/claims/:id`)
- **Roles:** billing_specialist, admin, super_admin
- **Sections:**
  - Claim header: patient, benefit period, claim type, total amount
  - Line items: service codes, units, amounts, HCPCS codes
  - **Pre-Submission Audit panel** (reuses T3-12 component): PASS / BLOCK / WARN rule list with override flow for WARN items
  - Submission status timeline: Draft → Audit → Queued → Submitted → Response
  - Clearinghouse response (ERA 835 fields if available): payment amount, denial reason, adjustment codes
  - "Submit Claim" button: disabled if BLOCK failures exist in audit panel

---

### 5B.10 ERA 835 Remittance View (`/billing/remittance`)
- **Roles:** billing_specialist, admin
- **Display:** Table of all received ERA 835 files from clearinghouse
- **Columns:** Received Date, Payer, Check/EFT number, Total Payment, Claims Count, Auto-Posted (badge: yes/partial/no)
- **Remittance Detail Sheet:** Individual claim payment detail — service adjustments, denial codes, patient responsibility, payment amount, auto-post status
- **Auto-post:** ERA 835 ingestion matches to submitted claims automatically; unmatched remittances flagged for manual review

---

### 5B.11 HOPE Assessment List — Location-wide (`/hope/assessments`)
- **Roles:** registered_nurse, admin, super_admin
- **Display:** Table of all HOPE assessments for the location (not patient-scoped)
- **Columns:** Patient, Assessment Type badge (HOPE-A / HOPE-UV / HOPE-D), Window Start, Window Deadline (color-coded), Status (Draft / Complete / Submitted / Accepted / Rejected), Completeness % (progress pill)
- **Filters:** Assessment type, status, date range, clinician
- **Alert:** Banner if any assessment is within 48 hours of window deadline
- **"New Assessment" button:** Redirects to patient context first (patient search)

---

### 5B.12 iQIES Submission History (`/hope/submissions`)
- **Roles:** admin, super_admin
- **Display:** Table of all submissions to CMS iQIES
- **Columns:** Submission Date, Assessment ID, Assessment Type, Patient (masked MRN only), Status (Accepted / Rejected / Pending), CMS Tracking Number, Error Message (if rejected)
- **Rejected row:** Expandable detail — CMS error code, description, corrective action needed
- **DLQ Alert integration:** Failed submissions that triggered Dead Letter Queue alert appear here with `ALERT` chip
- **Quarterly deadline tracker:** Banner showing days until next HQRP reporting period closes. At 0 days = destructive banner "HQRP deadline today — 2% penalty risk"

---

### 5B.13 Audit Log Viewer (`/admin/audit-logs`)
- **Roles:** super_admin only
- **Display:** Dense, paginated table
- **Columns:** Timestamp (JetBrains Mono), User, Role, Action badge (view/create/update/delete/sign/export/break_glass/login/logout), Resource Type, Resource ID (monospace), IP Address
- **Filters:** User, Role, Action, Resource Type, Date range, Patient ID, Break-glass only (toggle)
- **Export:** "Export CSV" for date range (logged to audit — meta-audit)
- **PHI handling:** Patient names NOT shown — resource IDs only. Authorized users must cross-reference resource IDs with patient records manually.
- **Immutable:** No delete, no edit, no archive UI. Append-only confirmed by UI copy.

---

### 5B.14 My Profile / Account Settings (`/settings/profile`)
- **Roles:** All authenticated users (own profile only)
- **Sections:**
  - Personal info (display name, title/credentials — not PHI)
  - **Change password:** Current password + new password (meets HIPAA complexity requirements) + confirm
  - **MFA management:** Current TOTP device shown (masked name), "Re-enroll MFA device" button → triggers re-enrollment flow (same as first-login flow), cannot remove MFA entirely
  - **Active sessions:** List of active sessions (device, IP, last activity). "Terminate all other sessions" button.
  - Notification preferences: Socket.IO event toasts on/off per event type (cannot disable session expiry)

---

### 5B.15 FHIR / API Settings (`/settings/fhir`)
- **Roles:** super_admin only
- **Sections:**
  - **SMART App Registry** (T4-1): Table of registered SMART applications — app name, client_id, scopes granted, status (active/revoked). "Register New App" button → client_id + client_secret generation flow.
  - **JWKS Endpoint:** Display location JWKS URL (read-only). "Rotate Keys" button.
  - **Active Scopes:** Checkboxes for enabled SMART scopes from security model §11. Cannot enable scopes not yet implemented.
  - **API Access Log:** Last 100 FHIR API calls (timestamp, SMART client, scope, resource type, response code)

---

### 5B.16 VantageChart Template Management (`/admin/vantage-templates`)
- **Roles:** super_admin, admin
- **Purpose:** View, edit, and version narrative fragment templates stored in DB. Admin can customize templates per discipline/visit type without a code deployment.
- **Layout:** Left rail — discipline + visit type selector (RN/SW/Chaplain/Therapy/Aide × ROUTINE/ADMISSION/RECERTIFICATION/DISCHARGE). Right — template fragment list.
- **Template card:** Fragment ID, trigger condition (expr-eval expression, read-only — only super_admin can edit), template string with `{variable}` placeholders highlighted, last edited by, version history link.
- **Editing rules:**
  - Trigger conditions are read-only for admin (only super_admin). Prevents accidental eval breakage.
  - Template strings editable by admin. Live preview panel shows rendered output with sample data.
  - All template edits versioned. Rollback to prior version via version history.
  - `NarrativeTemplateSchema` validation on save — invalid template rejected with error.
- **New template button:** "Add Fragment" → opens template editor with trigger + template fields.

---

### 5B.17 Global Patient Search (`/search`)
- **Roles:** All authenticated users (RLS-scoped — users only see patients they have access to)
- **Entry point:** Search icon in top bar (or keyboard shortcut `⌘K`)
- **Layout:** Command palette style (full-screen overlay)
  - Search input at top (auto-focused)
  - Results appear below as user types (300ms debounce)
  - Result rows: patient name, MRN (monospace), admission status badge, care model chip, primary clinician
  - Keyboard navigation: ↑↓ to select, Enter to navigate to patient
- **Search scope:** Name (fuzzy), MRN (exact), diagnosis (ICD-10 description)
- **No results state:** "No patients found for [query]" — never "No access" (avoid information disclosure)
- **Recent patients:** Shows last 5 viewed patients when search input is empty

---

### 5B.18 SMART on FHIR Authorization Screen (`/fhir/authorize`)
- **Roles:** External SMART apps (any role, depending on requested scopes)
- **Context:** Shown when a registered SMART app (e.g., external EHR, analytics tool) requests access via OAuth 2.0 Authorization Code flow
- **Layout:**
  - App logo + name + requesting organization
  - Scope list: human-readable translations of requested SMART scopes ("Read patient demographics", "Read clinical observations", "Write clinical notes")
  - "This app cannot access your personal credentials. Access expires in 1 hour."
  - "Authorize" (primary) + "Deny" (outline destructive)
- **Post-authorize:** Redirect to app's `redirect_uri` with authorization code
- **Session scope:** Authorization is per-session, per-patient-context, per-app. Revocable from FHIR settings (§5B.15).

---

### 5B.19 Patient Timeline Tab (`/patients/:id/timeline`)
- **Roles:** All who can access the patient (RLS-gated)
- **Sub-tab inside Patient Detail** (§5.4)
- **Display:** Chronological activity feed. Newest at top.
- **Entry types (color-coded left border):**
  - 🔵 Encounter completed / signed (primary)
  - 🟢 Care plan updated (success)
  - 🟡 IDG meeting held (warning)
  - 🔵 Medication change (clinical)
  - 🟠 NOE filed / NOTR filed (warning)
  - 🔴 Compliance alert fired (destructive)
  - ⚫ Audit event (muted) — only visible to admin/super_admin
- **Each entry:** Timestamp (JetBrains Mono), event description, author/system, "Go to record →" link
- **Filters:** Entry type, date range, author
- **Infinite scroll** (not pagination — clinicians scan vertically)

---

### 5B.20 Patient Orders Tab (`/patients/:id/orders`)
- **Roles:** registered_nurse (create + view), physician_attending / physician_np (sign + view), admin (view)
- **Sub-tab inside Patient Detail** (§5.4)
- **Display:** Table + status columns
- **Columns:** Date Created, Type chip (VERBAL / DME / FREQUENCY_CHANGE / MEDICATION), Content summary, Ordering Clinician, Physician, Due Date (color-coded for verbals approaching 72h), Status badge (PENDING_SIGNATURE / SIGNED / REJECTED / EXPIRED)
- **"Create Order" button** → inline sheet form (order type, content, physician assignment)
- **Unsigned verbal orders within 12h of 72h expiry:** Row turns red, amber pulsing border on Due Date cell

---

### 5B.21 Reports & Analytics (`/reports`)
- **Roles:** admin, super_admin, revenue_manager, operations_manager, billing_specialist (billing reports only)
- **Report categories (card-based grid):**
  - **Census Report** — admitted patients by date range, care model, primary clinician
  - **Compliance Summary** — NOE/NOTR filing rates, IDG compliance %, aide supervision compliance %, HOPE submission rate
  - **Cap Utilization** — per-patient cap contribution for cap year, projected year-end total
  - **VantageChart Usage** — Layer 1 vs Layer 2 usage rates, average documentation time (privacy-safe: no PHI in report)
  - **QAPI Trend** — adverse events by type, resolution time, open vs closed rate
- **Each report:** Date range filter, "Generate" button → async (202 → download). All report generation logged to `audit_logs`.
- **Note:** No real-time analytics beyond what's on the dashboard and alert pages.

---

### 5B.22 BAA Registry (`/settings/baa`)
- **Roles:** super_admin only
- **Vendor table columns:** Vendor Name, Services / PHI Exposure Type, BAA Status badge (Signed / Pending / Not Required / Expired), BAA Date, Contract Owner, Notes
- **Pre-populated vendors** (from T3-8): Valkey host, SMTP provider, hosting, backup/DR, clearinghouse, OpenFDA (note: no PHI transmitted), Claude API / Anthropic (note: PHI stripped before call per VantageChart T2-7 Layer 2 design)
- **Add vendor:** "+ Add vendor" button → inline row with all fields
- **BAA expiry alert:** If a BAA's renewal date is within 30 days, row highlighted amber + alert in compliance dashboard
- **Note moved from §5.23c:** Standalone page, not inside Settings tabs, due to legal sensitivity.

---

### 5B.23 NOE / NOTR Detail & Correction (`/billing/noe/:id`)
- **Roles:** billing_specialist, admin
- **Detail view:** All NOE fields, current status, filing history (timeline of status transitions), CMS response (if acknowledged/rejected)
- **Correction workflow** (if rejected or late):
  - "File Correction" button → opens correction form pre-populated with original fields
  - Correction reason required (free text, min 20 chars)
  - Late filing reason required if past 5-business-day deadline
  - Resets status to `corrected` → re-submitted
- **CMS audit trail:** Every NOE status transition shown with timestamp, user, and response code

---

### 5B.24 Benefit Period Detail Sheet (slide-in panel)
- **Trigger:** Clicking a period segment in the BenefitPeriodTimeline component
- **Not a full page** — renders as a right-side sheet over patient detail
- **Content:**
  - Period number, dates, length (90d or 60d)
  - Days elapsed, days remaining (monospace counters)
  - F2F status (period 3/4): date, physician, setting, link to F2F record or "Document F2F" CTA
  - Recertification status: signed / unsigned / not yet required
  - "Begin Recertification" CTA (if period approaching end within 10 days)
  - Associated NOE / NOTR filings for this period

---

### 5B.25 Late NOE / NOTR Filing Supervisor Override
- **Context:** Modal that appears when billing coordinator attempts to submit a NOE/NOTR past its deadline
- **Not dismissable without action**
- **Content:** "This NOE is X days past the 5-business-day deadline. Late filing requires supervisor authorization."
- **Fields:** Late filing reason (min 20 chars), supervisor confirmation (supervisor must be logged in or enter their credentials — depending on implementation)
- **Audit:** Override logged with supervisor's userId, reason, and timestamp

---

### 5B.26 Error Pages

**404 — Not Found** (`/*` catch-all)
- Message: "Page not found"
- Context-sensitive: "Back to Patients" if previously on a patient-scoped route, otherwise "Back to Dashboard"
- Clinical context preserved (patient header NOT shown — we don't know the patient)

**403 — Forbidden** (returned from API or restricted route)
- Message: "You don't have permission to access this resource."
- No details about why (information disclosure risk)
- "Request access from your administrator" + Back link

**500 — Server Error**
- Message: "Something went wrong. Please try again."
- Error ID (monospace, for support) — never show stack trace or PHI
- "Refresh page" button + "Contact support" link

**Maintenance Mode** (Fastify maintenance header)
- Full-screen takeover
- Message: "Hospici is undergoing scheduled maintenance."
- Estimated return time (if known)
- Emergency contact for urgent patient care needs

---

### 5B.27 Print / Export Layouts

These are render-mode variants of existing screens (no new routes — query param `?print=true`):

**Encounter Print View** (`/patients/:id/encounters/:encId?print=true`)
- Header: facility name + NPI, patient name + MRN + DOB, encounter date/type/clinician
- Body: full note prose
- Signature block: clinician name, credentials, timestamp, signature hash (monospace)
- Review/approval status if applicable
- No interactive elements. `@media print` CSS only.

**Care Plan Print View** (`/patients/:id/care-plan?print=true`)
- All discipline sections (all tabs on one page, page breaks between disciplines)
- SMART goals table per discipline
- Printed date / "Printed by" footer

**IDG Meeting Record Print View** (`/patients/:id/idg/:meetingId?print=true`)
- Meeting date, attendees with role and credentials
- Each attendee's notes section (from `attendee_notes` JSONB)
- Assembled IDG note
- Signatures (if signed)

**HOPE Assessment Print View** (`/patients/:id/hope/:assessmentId?print=true`)
- Formatted per CMS HOPE instrument layout
- All sections A–Q
- Completeness confirmation and submission date

---

---

### 5B.28 Referral Intake (`/intake`)
- **Roles:** intake_coordinator, admin
- **Purpose:** Manage incoming referral requests before patient is formally admitted. Intake coordinators live here — they do not navigate the clinical UI.
- **Referral List:** Table with Referral Date, Referring provider, Patient name (pre-admission, not yet in PHI system), Primary diagnosis, Insurance status badge (Verified / Pending / Denied), Priority (Urgent / Routine), Status (New / In Progress / Admitted / Declined)
- **Referral Detail / Intake Form:**
  - Referring provider + contact
  - Patient demographics (pre-admission — stored in a staging table before formal admission record is created)
  - Insurance verification status + Medicare ID pre-check
  - Clinical summary from referring provider (free text)
  - Hospice eligibility assessment (initial — does not replace physician certification)
  - "Admit Patient" CTA → launches Patient Admission Wizard (§5.5) pre-populated from referral data
  - "Decline Referral" (with reason) → closes referral
- **Dashboard widget:** Open referrals count + oldest pending referral age on intake_coordinator's dashboard variant

---

### 5B.29 Bereavement Support (`/bereavement`)
- **Roles:** bereavement_coordinator, social_worker, admin
- **Context:** Activated after patient death. Focuses on family support, not clinical documentation.
- **Bereavement Case List:** Table — Patient name, Date of death, Primary family contact, Case status (Active / Closed), Next contact date, Bereavement coordinator
- **Case Detail:**
  - Family contact log: each contact attempt/made, method (call/visit/card), notes (no PHI — family interactions only)
  - Bereavement plan: risk assessment (complicated grief indicators), planned support timeline (13 months standard), resources provided
  - "Log Contact" button → quick contact entry sheet
  - "Close Case" (after 13-month bereavement period)
- **Note:** No patient clinical record access. Family name and contact info only.

---

### 5B.30 Pharmacy Medication Review (`/pharmacy`)
- **Roles:** pharmacy_consultant
- **Purpose:** Read-only view of all active medications for the location. Consultant reviews for interactions, appropriateness, controlled substance monitoring.
- **Medication Summary List:** All active medications across all admitted patients (patient identified by MRN only — no name, no demographics). Columns: MRN, Medication, Dose, Route, Frequency, Prescriber, Start Date, OpenFDA Interactions (badge)
- **Drug Interaction Report:** Aggregate view — all pairs of medications with known interactions flagged across the location. Severity badges (Major / Moderate / Minor). Link to specific patient record (MRN only).
- **No edit affordances.** Read-only throughout. All access logged to audit with `pharmacy_review` action.

---

### 5B.31 DME Order Tracking (`/dme`)
- **Roles:** dme_coordinator, admin
- **Purpose:** Track equipment orders from physician → DME supplier → delivery confirmation.
- **Order List:** Table — Patient (MRN + name), Equipment type, Ordered by (physician), Order date, Supplier, Delivery status badge (Pending / Ordered / Delivered / Returned), Due date
- **Order Detail Sheet:**
  - Equipment details, quantity, delivery address (pulled from patient record — PHI)
  - Supplier contact + tracking number
  - Status update (dme_coordinator can update delivery status)
  - Delivery confirmation + signature (family signature, T5-8 pattern)
- **Integration:** DME orders originate from physician orders (§5B.20 `type: 'DME'`); dme_coordinator sees a filtered view of those orders.

---

### 5B.32 Scheduling Calendar (`/scheduling`)
- **Roles:** scheduler, admin, clinical_supervisor_rn, clinical_director
- **Purpose:** Manage and visualize all clinical visit schedules across the location.
- **Calendar View:** Week view default. Each cell = a scheduled visit (color-coded by visit type and clinician discipline). Drag-to-reschedule on desktop.
- **Filters:** Clinician, Discipline, Patient, Visit type, Date range
- **Scheduling a Visit:** Click empty time slot → sheet form: patient search, visit type, clinician assignment, estimated duration, notes to clinician
- **Conflicts:** Overlapping visits for same clinician highlighted amber. Double-booked patient highlighted red.
- **IDG Scheduling tab:** Separate view for IDG meeting scheduling across all patients. Shows patients approaching 15-day deadline.
- **Aide Visit compliance view:** Visual of aide visit frequency vs ordered frequency per patient. Deviations flagged amber.

---

### 5B.33 Surveyor Read-Only Portal (`/survey`)
- **Roles:** surveyor_state, surveyor_accreditation
- **Context:** Time-limited, survey-scoped. Enabled by admin for the duration of a CMS or accreditation survey. Separate navigation — not the clinical sidebar.
- **Landing:** Survey context banner: "Active survey: [type] — access expires [date]. All access is logged."
- **Available views (read-only, no edit affordances anywhere):**
  - Patient census (admitted patients, dates, status)
  - Selected encounters (surveyor requests specific records from admin, who grants access to those records)
  - IDG meeting records
  - QAPI events and action items
  - Compliance metrics (NOE filing rates, IDG compliance %, HOPE submission rate)
  - Aide supervision logs
- **Not available:** Billing records, individual clinical notes (unless specifically requested via admin grant), user management, any settings
- **Audit:** Every page view logged with `survey_type` and surveyor identity

---

## 6. Custom Clinical Components (not in design-system.md)

These components need to be designed — they are new, not yet in the component library.

### 6.1 VisualAnalogScale (VantageChart)

0–10 horizontal slider for NRS pain input.
- Track is a gradient: green (0) → yellow (4–6) → orange (7–8) → red (9–10)
- Thumb: large circle (44px, accessible), shows current value inside
- Below track: labels "No pain" (left) · "Worst possible" (right)
- Selected value displayed large in JetBrains Mono above the slider

### 6.2 CheckboxGrid (VantageChart)

Multi-select symptom grid. 3 columns.
- Each item: checkbox + label, fills cell
- Selected items: bg-clinical/10 border-clinical
- "Select all" / "Clear" row at bottom
- Used in: Symptom Review step, Interventions step

### 6.3 ToggleGroup (VantageChart)

Single-select button group for categorical clinical choices (e.g., consciousness level: Alert / Confused / Unresponsive).
- Horizontal strip of pill buttons
- Selected: bg-primary text-primary-foreground
- Unselected: outline style
- Max 5 options per group (more than 5 → SmartSelect)

### 6.4 SmartSelect (VantageChart)

Dropdown with search + custom entry option. Used for diagnoses, medications, ICD-10 codes.
- Type to search existing options
- "Add custom: [typed text]" appears at bottom if no exact match
- Badge shows selected items (multi-select variant)

### 6.5 Decline Trajectory Sparklines (Patient Header)

4 mini sparkline charts rendered inline in the patient header.

| Sparkline | Data |
|-----------|------|
| Pain | NRS/FLACC/PAINAD score over last 10 assessments |
| Dyspnea | ESAS shortness-of-breath score over last 10 |
| Nausea | ESAS nausea score over last 10 |
| Functional | Functional status score over last 10 |

Each sparkline: 80px wide, 24px tall. No axes. Trend line only (SVG path).
Color: improving (downward for pain/dyspnea/nausea) = success. Worsening = destructive. Stable = muted.
Tooltip on hover: last 3 values + dates.

Use `recharts` (lightweight) or pure SVG paths.

### 6.6 HOPE Completeness Ring

Circular progress indicator, 80px diameter, in the top-right of HOPE assessment form and HOPE submission header.

- 0% empty ring (muted track)
- Filling arc in primary color
- Center text: `{score}%` in JetBrains Mono
- At 100%: ring turns success green, text changes to "✓ Ready"
- Animated (smooth fill as fields are completed)

### 6.7 ComplianceRing (VantageChart right panel)

Same as 6.6 but positioned in right panel of VantageChart. Slightly larger (96px). Sections of the ring colored individually per step completion.

### 6.8 BenefitPeriodTimeline

Horizontal SVG timeline. Used on patient overview and `/billing/benefit-periods`.

```
[───────────────][──────────────][──────────][──────────]
  Period 1: 90d    Period 2: 90d  Per 3: 60d  Per 4: 60d
   Completed        In Progress   Upcoming    Upcoming
```

- Current period: primary fill. Elapsed days shown as darker segment within period.
- F2F badge on period 3 and 4: green checkmark or red warning.
- Clicking a period → benefit period detail sheet.

### 6.9 CapGauge

Circular gauge (similar to fuel gauge, 270° arc).

- 0–79%: primary fill
- 80–99%: warning fill, amber
- 100%+: destructive fill, red
- Center: `{percent}%` in JetBrains Mono (large), "of cap used" below in muted small text
- Used on patient overview (small, 80px) and cap dashboard (large, 200px)

### 6.10 AlertBadge (global, top bar)

Small badge on bell icon in top bar. Red background, white text, count of critical alerts.
- Pulses (`animate-pulse-subtle` from design system) when count > 0
- Turns amber when only warnings, no criticals

---

## 7. Key Interaction Patterns

### 7.1 Autosave

All clinical forms autosave on 2-second debounce after last input.

Visual feedback in patient header (never via toast for saves):
- `idle` — no indicator
- `saving` — spinner icon + "Saving..." in muted text
- `saved` — checkmark icon + "Saved HH:mm" in muted text
- `error` — alert icon + "Save error — retry" in destructive text + "Save Now" button turns red

Toast is only used for: non-autosaved actions (signing, submitting to iQIES, filing NOE, approving notes).

### 7.2 Session Timer

Visible in sidebar footer: "Session: MM:SS" (counts down from 30:00).

- White text when > 10 min remaining
- Amber text + warning icon at 5 min: socket.io `session:expiring` fires
- Toast warning at 5 min: "Session expiring in 5 minutes — save your work"
- At 0:00: full-screen modal (not dismissable) → redirect to login

### 7.3 Socket.IO Real-Time Events

| Event | UI effect |
|-------|-----------|
| `alert:new` | Alert badge count increments + pulse. New card slides into alert dashboard. |
| `noe:deadline-warning` | Toast warning with deadline date. |
| `session:expiring` | Toast + sidebar timer turns amber |
| `encounter:revision-requested` | Toast: "Revision requested on [visit type] note" + sidebar Review Queue badge increments |
| `order:expiring` | Toast: "Unsigned order expiring in [hours]h" |
| `cap:threshold:alert` | Alert bar at top of all screens: "Cap threshold exceeded — review required" |
| `medication:administered` | Toast: "Medication administered recorded" (clinician who submitted) |

### 7.4 Break-Glass Flow

1. Clinician clicks "Emergency Access" on a patient they don't have permission to access
2. Modal: "Break-Glass Emergency Access" — reason textarea (min 20 chars), "Request Emergency Access" button
3. On grant: break-glass banner renders across all patient pages (amber stripe). 4-hour expiry countdown.
4. All actions within break-glass session show in audit log with `break_glass: true` flag
5. On expiry: patient access revoked, return to patient list

### 7.5 PHI Display

PHI fields (name, DOB, address, phone, SSN, MRN) are displayed in a "masked by default" pattern in patient list and overview:

- Patient name: shown (required for identification in clinical context)
- DOB: shown as age only (e.g., "74 years") with "Show DOB" icon click to reveal full date (logs to audit)
- SSN: `***-**-####` — last 4 only. Full reveal requires supervisor role.
- Address/phone: shown in full for active clinicians on the patient's care team. Masked for non-assigned clinicians.

---

## 8. CMS Compliance UI Rules (non-negotiable)

These cannot be changed without a regulatory review.

| Rule | UI requirement |
|------|---------------|
| IDG 15-day hard block | Modal with no dismiss, no close X, no Escape key, one action only: "Schedule IDG Meeting". See §5.11 and `docs/design-system.md §8.1`. |
| HOPE completeness | "Submit to iQIES" button disabled until completeness ring = 100% |
| F2F for period 3+ | Benefit period 3/4 "Certify" button disabled if no F2F date within 30 prior days |
| NOE deadline | Election date picker always shows 5-business-day deadline. Never allow submission after deadline without supervisor override logged to audit. |
| NOTR deadline | NOTR due date shown in red when within 2 business days. Auto-files if clinician records revocation and `autoFileNOTR` setting is on. |
| Signed encounter | No edit affordance on status `APPROVED`. No pencil icon, no edit button, no "unlock" flow for standard roles. |
| Audit on PHI reveal | Any "reveal PHI" action (DOB, SSN) triggers an audit log entry. No UI confirmation required — silent background log. |
| Session | Session timer always visible. No "extend session" button — clinician must re-authenticate. |

---

## 9. Responsive Behavior

| Breakpoint | Layout |
|------------|--------|
| `sm` (640px) | Single column. Sidebar hidden, bottom tab bar shown (5 primary tabs). |
| `md` (768px) | Single column. Sidebar icon rail (48px). |
| `lg` (1024px) | Two column. Sidebar expanded (256px). |
| `xl` (1280px) | Three column layouts unlocked (e.g., VantageChart two-panel, care plan + patient rail). |

**Tablet-first clinical interactions:**
- All form inputs: min height 44px
- Touch targets: min 44×44px
- Modals: max-width 90vw on tablet
- Dense data tables: horizontal scroll on `sm`/`md` with sticky first column (patient name/MRN)

---

## 10. Screen Priority for Initial Design Pass

50 distinct screens + modals + print layouts total. Design in this order — each tier unblocks the next.

**Priority 1 — Core clinical loop (daily use, market-entry critical):**
1. Patient List (§5.3)
2. Patient Detail — Overview tab (§5.4)
3. VantageChart 9-step wizard (§5.7) — desktop + tablet
4. Login + MFA enrollment (§5.1)
5. IDG Hard-Block Modal (§5.11a) — CMS required, non-dismissable
6. Global alert badge + Alert Dashboard (§5.17)

**Priority 2 — Clinical workflows:**
7. Encounter list + new encounter + signed encounter (§5.6a/b/c)
8. Dashboard — registered_nurse variant (§5.2)
9. Pain assessment — all 5 scales (§5.8)
10. HOPE assessment form + completeness ring (§5.16)
11. NOE create/edit + deadline picker (§5.13)
12. Patient Admission Wizard — 5 steps (§5.5)

**Priority 3 — Compliance & billing core:**
13. Care plan — multi-discipline tabs + SMART goals (§5.9)
14. Medication list + MAR + drug interaction (§5.10)
15. Discharge workflow — all 4 discharge types (§5B.1)
16. Revocation + NOTR auto-generation (§5B.3)
17. Recertification wizard + F2F doc (§5B.4, §5B.5)
18. Note review queue — supervisor (§5.18)
19. Cap gauge dashboard (§5.15)
20. Physician order inbox (§5.19)
21. Electronic signature capture (§5B.7)

**Priority 4 — Supporting workflows:**
22. IDG meeting list + schedule form + live meeting view (§5.11, §5B.6)
23. Aide supervision calendar + record form (§5.12)
24. HOPE assessment list location-wide (§5B.11)
25. iQIES submission history (§5B.12)
26. Claims list + claim detail (§5B.8, §5B.9)
27. Pre-submission claim audit (§5.22)
28. Benefit period timeline + detail sheet (§5.14, §5B.24)
29. NOE/NOTR detail + correction flow + late filing override (§5B.23, §5B.25)
30. Global patient search / command palette (§5B.17)
31. Patient timeline tab (§5B.19)
32. Patient orders tab (§5B.20)

**Priority 5 — Admin, analytics, interop:**
33. ADR export (§5.20)
34. QAPI event list + detail (§5.21)
35. Quality benchmark dashboard (§5.16 benchmarks)
36. ERA 835 remittance view (§5B.10)
37. Reports & analytics (§5B.21)
38. Audit log viewer (§5B.13)
39. My profile / MFA management (§5B.14)
40. VantageChart template management (§5B.16)
41. FHIR / API settings (§5B.15)
42. BAA registry (§5B.22)
43. Settings — user management + location (§5.23a/b)
44. SMART on FHIR authorization (§5B.18)
45. Dashboard — billing_specialist, scheduler, intake_coordinator, bereavement_coordinator variants (§5.2)

**Priority 6 — Role-specific portals:**
46. Referral Intake (§5B.28) — intake_coordinator
47. Scheduling Calendar (§5B.32) — scheduler
48. Bereavement Support (§5B.29) — bereavement_coordinator
49. Pharmacy Medication Review (§5B.30) — pharmacy_consultant
50. DME Order Tracking (§5B.31) — dme_coordinator
51. Surveyor Read-Only Portal (§5B.33) — surveyor_state / surveyor_accreditation

**Priority 7 — System states + print:**
52. Error pages: 404, 403, 500, maintenance (§5B.26)
53. Encounter print layout (§5B.27)
54. Care plan print layout (§5B.27)
55. IDG meeting record print layout (§5B.27)
56. HOPE assessment print layout (§5B.27)

---

## 11. What NOT to Design

- No onboarding flow / product tour (clinical apps skip this — users are trained)
- No marketing landing page (separate product concern)
- No consumer health patient-facing screens (this is staff-only)
- No charts or graphs beyond what's specified (sparklines, cap gauge, completeness ring, quality benchmarks — that's it)
- No dark mode toggle in UI (dark mode is supported via CSS tokens but not user-toggled in MVP — OS setting only)
