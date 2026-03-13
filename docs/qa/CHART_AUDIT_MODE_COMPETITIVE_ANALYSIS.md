# Chart Audit Mode Competitive Analysis

**Date:** 2026-03-12  
**Scope:** Hospici `T3-13` chart audit mode, including discipline-specific review checklists, survey-readiness packet completeness, missing-document indicators, bulk QA actions, and DB-persisted saved filter views  
**Reviewed local context:** `MASTER_PROMPT.md`, `docs/tasks/tier-3.md`, `docs/design/DESIGN_PROMPT.md`, `docs/qa/ADR_AUDIT_RECORD_EXPORT_COMPETITIVE_ANALYSIS.md`, `docs/qa/QAPI_SCORECARDS_COMPETITIVE_ANALYSIS.md`

---

## 1. Current Hospici Baseline

### What the codebase and prompt currently say

- `MASTER_PROMPT.md` defines `T3-13` as:
  - chart audit mode
  - discipline-specific review checklists
  - survey-readiness packet completeness
  - missing-document indicators
  - bulk QA actions
  - saved filter views persisted in DB
- `docs/tasks/tier-3.md` scopes `T3-13` to:
  - checklist templates by `(discipline, visit_type)`
  - checklist responses stored per review
  - chart-audit endpoint returning 8 sections plus `surveyReadiness`
  - missing-document indicators with severity
  - saved filter views
  - bulk assign and bulk revision-request workflows
- `docs/design/DESIGN_PROMPT.md` already assumes:
  - separate surveyor read-only portal
  - chart/survey-readiness context feeding ADR export
- `T2-9` already owns note-review workflow and client-side saved filter tabs, explicitly deferring DB-persisted saved views and chart audit to `T3-13`.

### Immediate conclusion

The local boundary is correct:

- `T2-9` = note-level review workflow
- `T3-13` = chart-level audit intelligence and workbench operations
- `T3-10` = packet export

Competitor public material strongly supports the need for:

- centralized QA queues
- filters/grouping
- approve / return workflows
- missing-data detection
- export / audit readiness

But competitors do not publicly expose all the higher-order chart-audit constructs Hospici is planning, especially:

- discipline-specific review checklist templates
- DB-persisted saved audit views
- explicit survey-readiness scoring
- bulk QA actions paired with chart-level completeness

That means Hospici can plausibly differentiate here instead of merely matching.

---

## 2. Competitor Research

## Axxess

### Confirmed public capabilities

1. **Dedicated QA Center**
   - Axxess publicly documents a `Quality Assurance (QA) Center` in hospice.
   - QA staff can view, approve, and return clinical documentation from a centralized queue.
   - Documentation flowing through QA includes clinical notes, plans of care, physician orders, HIS documents, and other reports.

2. **Queue filtering and grouping**
   - Axxess public QA documentation states users can filter by:
     - patient
     - patient status
     - location
     - date range
     - QA/document status
     - task name
     - assigned user
   - Users can also group by patient, event date, task, or clinician.

3. **Bulk QA actions**
   - Axxess publicly states QA staff can multi-select tasks and approve or return multiple items at once.

4. **Approve / return lifecycle with comments**
   - QA staff can approve items to completed status or return them for correction.
   - Axxess publicly documents comments on returned QA items and secure messaging back to clinicians.

5. **Dashboard visibility inside the QA Center**
   - Axxess publicly documents a pie-chart dashboard showing pending and returned items broken out by task and discipline.
   - Users can click the chart to filter to the selected status slice.

6. **Documentation validations before and during QA**
   - Axxess publicly documents field validations and HIS validations that:
     - highlight missing or incorrect information in red
     - move the user to the next required correction
     - treat some errors as mandatory to resolve before completion while warnings/inconsistencies may remain

7. **Permissioned QA access and bypass controls**
   - Axxess publicly documents QA Center permissions and the ability to configure which tasks bypass QA Center.

8. **Chart download and document management**
   - Axxess publicly documents chart download and document-management workflows, relevant for downstream audit packet assembly.

### Product read

Axxess is the strongest public benchmark for **the actual QA workbench**:

- centralized queue
- filters and grouping
- multi-select bulk actions
- approve / return
- comments
- document-level validations
- status dashboards

It is the clearest analog to the core workbench portion of Hospici `T3-13`.

## WellSky

### Confirmed public capabilities

1. **Patient-chart export for audit/legal/payer use**
   - WellSky publicly states chart data can be exported from within the application as:
     - PDF
     - ZIP files sorted into chart-attribute subfolders
   - The public workflow PDF explicitly calls this useful for external auditing, regulatory compliance, legal, and payer requests.

2. **All-or-specific chart export**
   - The same public WellSky workflow PDF states users can export all or specific pieces of the patient's chart.

3. **Enterprise workflow posture**
   - WellSky publicly signals strong multi-office and summary-level workflow control patterns in hospice billing and export workflows.

4. **Structured data export**
   - WellSky publicly documents CCDA export, suggesting strong packaging and interoperability maturity around chart data.

### Product read

WellSky is strongest publicly on **chart packaging and enterprise operations**, not specifically on hospice QA-center mechanics. Public sources reviewed do not clearly expose:

- a hospice QA queue
- review checklist templates
- saved audit views
- chart completeness scoring

**Inference:** WellSky likely supports pieces of these internally, but the reviewed public material most strongly substantiates audit/export packaging rather than chart-audit review UX.

## FireNote

### Confirmed public capabilities

1. **Missing-document and audit-gap visibility**
   - FireNote publicly states compliance teams can track missing documentation and identify gaps that would create problems during ADR requests before they become emergencies.

2. **Centralized QAPI review and action**
   - FireNote publicly states QAPI review and action planning are centralized in one location.

3. **Note review for in-progress and completed documentation**
   - FireNote publicly states compliance and QA teams can review encounters in real time, provide feedback, and guide corrections before documentation becomes a permanent risk.

4. **Proactive compliance reporting**
   - FireNote publicly highlights trend visibility for:
     - missed visits
     - upcoming hospice aide supervisory visits
     - upcoming F2F visits

5. **Audit-readiness outcome messaging**
   - FireNote publicly ties these tools to faster ADR/TPE response and better audit readiness.

6. **One-chart continuity**
   - FireNote publicly emphasizes one patient record across care lines, reducing fragmentation during review and export.

### Product read

FireNote is the strongest public benchmark for **audit readiness, missing-document visibility, and proactive compliance review**. It is less detailed publicly about the exact workbench mechanics, but the outcome orientation aligns very closely with:

- missing-document indicators
- chart completeness awareness
- proactive trend detection
- note review + QAPI linkage

---

## 3. Competitive Comparison

| Capability | Axxess | WellSky | FireNote | Hospici today |
| --- | --- | --- | --- | --- |
| Centralized QA / review queue | Yes, explicit | Not clearly public | Review visibility public | Planned |
| Filtering / grouping in QA workbench | Yes, explicit | Not clearly public | Not public | Planned |
| Bulk QA actions | Yes, explicit | Not public | Not public | Planned |
| Approve / return workflow | Yes, explicit | Not public | Feedback/corrections public | Planned via `T2-9` + `T3-13` |
| Review comments to clinician | Yes, explicit | Not public | Feedback public | Planned |
| Validation-driven missing-data detection | Yes, explicit | Not public | Missing-document visibility public | Planned |
| Survey / audit readiness messaging | Partial | Export-for-audit explicit | Strongest public signal | Planned |
| Missing-document indicators | Publicly implied via validations and QA | Not public | Yes, explicit | Planned |
| Discipline-specific review checklists | Not public | Not public | Not public | Planned |
| DB-persisted saved filter views | Not public | Not public | Not public | Planned |
| Chart completeness score | Not public | Not public | Not public | Planned |
| Section-selective chart export linkage | Yes | Yes | Publicly implied | Planned through `T3-10` |

### Core takeaway

No reviewed competitor publicly exposes the full chart-audit architecture Hospici is planning. Public signal breaks down like this:

- **Axxess:** strongest QA-center operations
- **WellSky:** strongest chart export / audit packaging support
- **FireNote:** strongest missing-document and audit-readiness posture

That makes `T3-13` another area where Hospici can build beyond visible competitor capability.

---

## 4. What Hospici Should Copy

### Must copy for market parity

1. **Centralized chart-review queue**
   - Axxess clearly shows this pattern matters.
   - Hospici needs a dedicated chart-audit workspace, not only patient-detail review screens.

2. **Rich filtering and grouping**
   - Patient, discipline, reviewer, status, date range, location, and deficiency impact should all be first-class filters.

3. **Bulk QA actions**
   - Axxess explicitly supports multi-select approve/return.
   - Hospici should keep bulk assign and bulk revision-request, and likely add bulk status operations where safe.

4. **Return-with-context workflow**
   - QA work must send clear corrective context back to clinicians.
   - This should remain tightly linked to `RevisionRequest[]` from `T2-9`.

5. **Missing-document and gap visibility**
   - FireNote's public messaging confirms the operational importance.
   - Chart audit mode must make omissions visible before export or survey response.

### Should copy if we want stronger operational depth

1. **Dashboard cards / workload visuals**
   - pending vs returned
   - by discipline
   - by reviewer
   - by severity

2. **Export of queue state**
   - Axxess supports Excel export of QA Center views.
   - Hospici could support CSV export of audit queues or saved views.

3. **Permissioned bypass / workflow policy**
   - Axxess exposes bypass controls.
   - Hospici may eventually want policy controls for which document types require chart-audit workflows.

---

## 5. What Hospici Should Differentiate On

### 1. Discipline-specific review checklist templates

This is a real opening. Axxess publicly exposes validations and QA review, but not discipline x visit-type checklist templates. Hospici should lean into:

- `(discipline, visitType)` checklist templates
- versioning of templates
- checklist completion stored with review
- checklist scoring contributing to chart completeness

### 2. Chart-level completeness model

FireNote highlights missing documentation and ADR readiness, but public materials do not describe an explicit chart completeness structure. Hospici should make completeness first-class across:

- encounters
- signed orders
- consents
- HOPE assessments
- IDG records
- filings
- care-plan freshness
- medication / MAR coverage

### 3. DB-persisted saved audit views

`T2-9` already has client-side saved tabs. `T3-13` should upgrade this into:

- user-owned saved views
- shared location views
- default team views for QA leads
- saved filter + sort + column set + grouping

This is a major usability differentiator in large audit queues.

### 4. Survey-readiness scoring linked to export

The clean local design is:

- `T3-13` computes readiness
- `T3-10` packages it into export if requested

Competitor public material suggests this linkage matters, but does not describe it clearly.

### 5. Bulk actions with atomicity and audit

Hospici's planned all-or-none bulk operations are stronger than typical queue tooling if executed well. Keep:

- transaction-backed bulk assign
- transaction-backed bulk revision request
- full audit trail for bulk actions

### 6. Multi-context review lanes

Hospici can build one chart-audit engine that supports:

- routine QA coaching
- survey preparation
- ADR/TPE readiness
- leadership review

Competitors publicly market pieces of this, but not the unified control plane.

---

## 6. Recommended Scope Expansion for `T3-13`

The current `T3-13` wording is strong. The main recommendation is to sharpen the workbench and saved-view model.

### T3-13 should explicitly own

- discipline-specific checklist templates and versioning
- chart completeness computation across major document classes
- missing-document indicator taxonomy with severity
- chart-audit workbench
- DB-persisted saved views
- bulk QA operations
- survey-readiness summary used by `T3-10`

### Recommended chart-audit workbench sections

1. **Queue**
   - patient
   - primary discipline
   - current review status
   - missing-doc count
   - survey-readiness score
   - assigned reviewer
   - last activity

2. **Filters**
   - location
   - discipline
   - reviewer
   - status
   - deficiency type
   - billing impact
   - compliance impact
   - missing-document severity
   - date range

3. **Saved Views**
   - personal
   - shared
   - pinned defaults

4. **Bulk Actions**
   - assign reviewer
   - request revision
   - export queue CSV

5. **Detail Panel**
   - checklist progress
   - missing documents
   - survey readiness by section
   - links to patient timeline / source record / export packet

### Recommended completeness sections

1. encounters
2. orders and signatures
3. consents
4. medications / MAR
5. HOPE / assessments
6. IDG records
7. NOE / NOTR filings
8. care plan and discipline coverage

---

## 7. Boundary With `T2-9`, `T3-10`, and `T3-11`

`T2-9` should own:

- review state machine
- revision requests
- note-level workflow

`T3-10` should own:

- packet assembly and export lifecycle

`T3-11` should own:

- trend reporting
- scorecards
- QAPI analytics

`T3-13` should own:

- chart-level completeness
- audit workbench
- checklist templates
- saved views
- bulk chart-audit operations

This remains the right boundary.

---

## 8. Bottom Line

Competitor public material strongly supports the need for chart-audit and QA workbench capabilities, but no reviewed source exposes the full architecture Hospici is planning.

Public benchmark summary:

- **Axxess:** strongest QA-center mechanics
- **WellSky:** strongest chart export/use for audit/legal/regulatory requests
- **FireNote:** strongest missing-document and audit-readiness posture

Hospici should keep `T3-13` ambitious and explicitly deliver:

1. **A centralized chart-audit workbench**
2. **Discipline-specific review checklists**
3. **Missing-document indicators and survey-readiness scoring**
4. **DB-persisted saved audit views**
5. **Bulk QA actions with full auditability**
6. **Tight handoff to `T3-10` export and `T3-11` analytics**

That would make `T3-13` one of the clearer areas where Hospici can exceed visible competitor capability.

---

## Sources

### Local files

- `MASTER_PROMPT.md`
- `docs/tasks/tier-3.md`
- `docs/design/DESIGN_PROMPT.md`
- `docs/qa/ADR_AUDIT_RECORD_EXPORT_COMPETITIVE_ANALYSIS.md`
- `docs/qa/QAPI_SCORECARDS_COMPETITIVE_ANALYSIS.md`

### Internet sources

- Axxess QA Overview: https://www.axxess.com/help/training-manuals/hospice/adminclerical/quality-assurance-qa-overview/
- Axxess QA Center Updates: https://www.axxess.com/help/axxesshospice/software-updates/qa-center-updates/
- Axxess Admin FAQs: https://www.axxess.com/help/axxesshospice/admin/admin-faqs/
- Axxess Comments on Items Returned from QA: https://www.axxess.com/help/axxesshospice/software-updates/comments-on-items-returned-from-qa/
- Axxess Documentation Validation Enhancements: https://www.axxess.com/help/axxesshospice/software-updates/documentation-validation-enhancements/
- Axxess Spotlight: QA Center: https://www.axxess.com/blog/hospice/axxess-hospice-spotlight-quality-assurance-center/
- Axxess Bypass QA Center: https://www.axxess.com/help/axxesshospice/software-updates/bypass-quality-assurance-center/
- WellSky workflow variances PDF: https://info.wellsky.com/rs/596-FKF-634/images/Moving_to_WellSky_Hospice_Palliative_Principal_Workflow_Variances.pdf
- FireNote Compliance Solutions: https://firenote.health/compliance-solutions
- FireNote homepage: https://firenote.health/
- FireNote CareLines: https://firenote.health/carelines

