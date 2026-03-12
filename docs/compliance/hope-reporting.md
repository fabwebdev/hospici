# HOPE — Hospice Outcomes and Patient Evaluation
## CMS Quality Reporting Compliance Guide

**Version:** 1.0
**Date:** 2026-03-11
**Status:** Canonical Reference — Implementation Phase 3
**Replaces:** HIS (Hospice Item Set) — deprecated effective 2025-10-01
**Regulation:** 42 CFR §418.312 — Hospice Quality Reporting Requirements

---

## Overview

**HOPE (Hospice Outcomes and Patient Evaluation)** is CMS's standardized patient assessment instrument for hospice quality reporting. It replaced the Hospice Item Set (HIS) effective **October 1, 2025** for all new hospice admissions. Failure to comply with HOPE submission requirements results in a **2% reduction in Medicare payment rates** for the following fiscal year.

### HOPE vs HIS — Key Differences

| Dimension | HIS (deprecated) | HOPE (current) |
|---|---|---|
| Effective | Pre-October 2025 | October 1, 2025 onward |
| Assessment points | Admission + Discharge | Admission + Update Visit + Discharge |
| Clinical depth | Administrative/process | Clinical outcomes + functional status |
| Submission system | QIES | iQIES |
| Assessment window | 5 days (HIS-A) | 7 days (HOPE-A, HOPE-D) |
| Cognitive screening | Not included | BIMS + CAM (delirium) |
| Depression screening | Not included | PHQ-2 |
| Functional status | Not included | Full ADL assessment |
| Pain assessment | Basic | Multi-modal (NRS + verbal + behavioral) |
| Quality measures | Process measures only | Process + outcome measures |

---

## Assessment Types and Timelines

### HOPE-A — Admission Assessment

- **Trigger:** Hospice election / admission
- **Completion window:** Within **7 calendar days** of the hospice election date
- **Sections:** A (Administrative), B (Background), C (Cognitive), D (Mood/PHQ-2), F (Functional/ADLs), J (Pain), K (Nutritional), M (Medications), N (Diagnoses), O (Special Treatments), Q (Participation)
- **Code:** `assessmentType: "01"`
- **Late penalty:** Assessment outside the 7-day window requires supervisor documentation; impacts quality measure denominator

**Validation rule (enforced in code):**
```typescript
const window = validateHOPEAdmissionWindow(electionDate, assessmentDate);
// window.valid = false → throws HOPEWindowViolationError
```

### HOPE-UV — Update Visit Assessment

- **Trigger:** Each qualifying patient-family-centered visit (clinical discipline visits)
- **Completion window:** Same calendar day as the visit
- **Sections:** C (Cognitive), D (Mood), F (Functional), J (Pain), O (Special Treatments), Q (Participation)
- **Code:** `assessmentType: "02"`
- **Purpose:** Tracks clinical changes over the course of the hospice stay; feeds outcome measures

### HOPE-D — Discharge Assessment

- **Trigger:** Discharge or death
- **Completion window:** Within **7 calendar days** of discharge/death date
- **Sections:** F (Functional), J (Pain), P (Discharge Information), Q (Participation)
- **Includes Section P:** Discharge destination, place of death, discharge reason
- **Code:** `assessmentType: "03"`

**Validation rule (enforced in code):**
```typescript
const window = validateHOPEDischargeWindow(dischargeDate, assessmentDate);
// window.valid = false → throws HOPEWindowViolationError
```

---

## iQIES Submission

### System Overview

HOPE assessments are submitted electronically to **iQIES** (Internet Quality Improvement and Evaluation System), which replaced the legacy QIES system. iQIES is operated by CMS and accessible at [https://iqies.cms.gov](https://iqies.cms.gov).

### Submission Architecture (Hospici)

```
Clinician completes assessment
        ↓
HOPEService.createAdmissionAssessment()
  → validates 7-day window
  → inserts to hope_assessments (status: "completed")
  → emits BullMQ job: hope-submission queue
        ↓
hope-submission BullMQ worker
  → packages XML per iQIES specifications
  → POST to iQIES REST API
  → updates hope_assessments.status → "submitted"
        ↓
iQIES asynchronous response (webhook or polling)
  → accepted → status: "accepted", store iqiesTrackingId
  → rejected → status: "rejected", log errors, DLQ alert
```

### BullMQ Job Configuration

```typescript
// Job: "hope-submission"
// Queue: "hope-submission-queue"
// DLQ: "hope-submission-dlq"
{
  attempts: 3,
  backoff: { type: "exponential", delay: 2000 },
  removeOnComplete: { count: 100 },
  removeOnFail: false, // Keep for DLQ review
}
```

**Retry policy:**
| Attempt | Delay | Action |
|---|---|---|
| 1 | Immediate | First submission to iQIES |
| 2 | 2 seconds | Retry with same payload |
| 3 | 4 seconds | Final retry |
| All failed | — | Move to `hope-submission-dlq`, alert ops channel |

### iQIES Error Codes (Common)

| Error Code | Meaning | Resolution |
|---|---|---|
| `A0310A_INVALID` | Assessment type code not recognized | Verify `"01"/"02"/"03"` mapping |
| `WINDOW_VIOLATION` | Assessment outside 7-day window | Document exception; contact iQIES helpdesk |
| `DUPLICATE_SUBMISSION` | Assessment already accepted | Check for duplicate; update existing record |
| `REQUIRED_FIELD_MISSING` | Required section item absent | Validate schema before submission |
| `CCN_NOT_FOUND` | CMS Certification Number not recognized | Verify 6-digit CCN in A0100 |

---

## HQRP Quality Measures

### Required Measures (Current)

| NQF # | Measure Name | Type | Source |
|---|---|---|---|
| NQF #3235 | Hospice and Palliative Care Composite Process Measure – Comprehensive Assessment at Admission | Process | HOPE-A |
| NQF #3633 | Treatment Preferences | Process | HOPE-A |
| NQF #3634 (Part A) | Hospice Visits in Last Days of Life — RN/MD visits (≥2 in last 3 days) | Outcome | Claims + HOPE-D |
| NQF #3634 (Part B) | Hospice Visits in Last Days of Life — SWW/Chaplain visits (≥1 in last 7 days) | Outcome | Claims + HOPE-D |
| HCI | Hospice Care Index (10-indicator composite) | Composite | Claims |

### NQF #3235 — Comprehensive Assessment at Admission

**Denominator:** All patients with a completed HOPE-A during the measurement period.

**Numerator:** HOPE-A with all 7 required domains addressed:

| Domain | HOPE Section | Coding |
|---|---|---|
| Pain screening | Section J | `sectionJ.interviewConducted` ≠ `"0"` OR `staffPainIndicators` completed |
| Dyspnea screening | Section J + clinical notes | Dyspnea presence documented |
| Mood/depression screening | Section D | `phqLittleInterest` + `phqFeelingDown` completed, OR staff assessment |
| Cognitive status | Section C | BIMS completed OR `staffAssessment` completed |
| Nutritional status | Section K | `heightInInches` + `weightInLbs` documented, or swallowing assessment |
| Functional status | Section F | All ADL fields in F0400 completed |
| Advance directives | Section B | `advanceDirectiveDocumented` = true |

**Target:** ≥70% (industry benchmark; top performers achieve >90%)

### NQF #3634 — HVLDL (Hospice Visits When Death is Imminent)

Two-part measure for patients who **died** while enrolled in hospice:

- **Part A:** ≥2 RN or MD visits in last 3 days of life
- **Part B:** ≥1 social worker or chaplain visit in last 7 days of life

**Target:** Part A ≥70%, Part B ≥70%

### Reporting Periods

HQRP operates on **calendar year quarters**:

| Quarter | Period | Submission Deadline |
|---|---|---|
| Q1 | Jan 1 – Mar 31 | August 15 |
| Q2 | Apr 1 – Jun 30 | November 15 |
| Q3 | Jul 1 – Sep 30 | February 15 |
| Q4 | Oct 1 – Dec 31 | May 15 |

**Non-submission penalty:** 2% Medicare payment reduction for the entire following fiscal year.

---

## Database Schema (Phase 3)

When implemented, HOPE requires the following tables. All follow the column promotion policy with RLS.

### `hope_assessments` table

| Column | Type | Promoted? | Notes |
|---|---|---|---|
| `id` | UUID PK | — | |
| `patient_id` | UUID FK | ✅ Native | All clinical tables |
| `location_id` | UUID FK | ✅ Native | RLS required |
| `assessment_type` | VARCHAR(2) | ✅ Native | `01`/`02`/`03` — state machine queries |
| `assessment_date` | DATE | ✅ Native | Window validation queries |
| `election_date` | DATE | ✅ Native | Used with assessment_date for window check |
| `status` | VARCHAR(20) | ✅ Native | State machine: draft → in_progress → completed → submitted → accepted/rejected |
| `iqies_submission_id` | VARCHAR | Native | iQIES tracking |
| `submitted_at` | TIMESTAMPTZ | Native | |
| `data` | JSONB | JSONB | Full TypeBox-validated HOPE payload |
| `created_at` | TIMESTAMPTZ | ✅ Native | |
| `updated_at` | TIMESTAMPTZ | ✅ Native | |

**RLS policies required:**
```sql
ALTER TABLE hope_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY hope_assessments_location_read ON hope_assessments
  FOR SELECT USING (location_id = current_setting('app.current_location_id')::uuid);

CREATE POLICY hope_assessments_location_insert ON hope_assessments
  FOR INSERT WITH CHECK (location_id = current_setting('app.current_location_id')::uuid);

CREATE POLICY hope_assessments_location_update ON hope_assessments
  FOR UPDATE USING (location_id = current_setting('app.current_location_id')::uuid);
```

### `hope_iqies_submissions` table

Tracks each iQIES submission attempt (one assessment can have up to 3 attempts before DLQ).

### `hope_reporting_periods` table

One row per location per quarter. Tracks submission status and HQRP penalty risk.

### `hope_quality_measures` table

Stores computed measure rates per reporting period for dashboard display.

---

## Migration Sequence (Phase 3)

```bash
# 1. Get next migration number
pnpm --filter @hospici/backend db:next-migration-number

# 2. Create migration file: XXXX_hope_assessments.sql
# Include: CREATE TABLE hope_assessments, RLS policies, indexes

# 3. Apply migration
pnpm --filter @hospici/backend db:migrate

# 4. Compile validators (already registered in typebox-compiler.ts)
pnpm --filter @hospici/backend db:compile-validators

# 5. Wire route in server.ts
# await fastify.register(hopeRoutes, { prefix: "/api/v1/hope" });
```

---

## BullMQ Job — `hope-submission`

| Property | Value |
|---|---|
| Queue name | `hope-submission-queue` |
| DLQ name | `hope-submission-dlq` |
| Schedule | Event-driven (triggered on assessment completion) |
| Retries | 3 (exponential backoff) |
| DLQ alert | Ops channel + PagerDuty P1 |
| Schema | `HOPEiQIESSubmissionSchema` |

Add to job registry in `backend/src/jobs/`:
```typescript
"hope-submission": HOPEiQIESSubmissionSchema,
```

---

## Clinician Workflow Integration

### Assessment Completion Triggers

| Clinical Event | Assessment Required | Window |
|---|---|---|
| Hospice election | HOPE-A | 7 calendar days |
| Each qualifying visit | HOPE-UV | Same day |
| Discharge | HOPE-D | 7 calendar days |
| Death | HOPE-D | 7 calendar days |

### Frontend Compliance Alerts (Phase 3 UI)

- **Yellow banner** when HOPE-A is due within 3 days of admission
- **Red banner** when HOPE-A window expires in <24 hours
- **Hard block** on discharge workflow if HOPE-D not initiated
- **HQRP dashboard widget** showing current quarter submission status and penalty risk

---

## Compliance Testing Requirements

All HOPE-related PRs must include:

1. **Schema tests:**
   - Valid HOPE-A passes `Validators.HOPEAdmission.Check()`
   - HOPE-A with missing required section fails validation
   - HOPE-A with `assessmentDate` outside 7-day window throws `HOPEWindowViolationError`
   - HOPE-D with `assessmentDate` outside 7-day window throws `HOPEWindowViolationError`

2. **Quality measure tests:**
   - `calculateComprehensiveAssessmentNumerator()` returns true when all 7 domains addressed
   - `calculateHVLDLPartA()` returns true when ≥2 RN/MD visits
   - `calculateHVLDLPartB()` returns true when ≥1 SWW/chaplain visit

3. **RLS tests:**
   - User at location A cannot read HOPE assessments from location B
   - Append + read policies verified for `hope_assessments`

4. **BullMQ tests:**
   - DLQ alert fires when `hope-submission` job exhausts all retries (simulate iQIES 500)

---

## References

- [CMS HOPE Data Submission Specifications](https://www.cms.gov/medicare/quality/hospice/hope-assessment)
- [iQIES System Portal](https://iqies.cms.gov)
- [HQRP Measures Technical Specifications](https://www.cms.gov/medicare/quality/hospice/measures)
- [42 CFR §418.312 — Hospice Quality Reporting](https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-G/part-418/subpart-I/section-418.312)
- [CY 2024 Hospice Wage Index Final Rule](https://www.federalregister.gov/documents/2023/08/07/2023-16481/medicare-and-medicaid-programs-fy-2024-hospice-wage-index-and-payment-rate-update) — HOPE implementation finalized

---

_HOPE Compliance Guide v1.0 — Hospici — 2026-03-11_
