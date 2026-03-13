# QAPI Management and Clinician Quality Scorecards Competitive Analysis

**Date:** 2026-03-12  
**Scope:** Hospici `T3-11` QAPI management + clinician quality scorecards + branch/discipline deficiency trend reporting, with upstream dependency on `T2-9` note review data  
**Reviewed local context:** `MASTER_PROMPT.md`, `docs/tasks/tier-3.md`, `docs/design/DESIGN_PROMPT.md`, `docs/tasks/tier-2.md`

---

## 1. Current Hospici Baseline

### What the codebase and prompt currently say

- `MASTER_PROMPT.md` defines `T3-11` as:
  - QAPI management
  - clinician quality scorecards
  - branch/discipline deficiency trend reporting
- `MASTER_PROMPT.md` also records that competitor QA research already expanded `T2-9` to capture:
  - `revisionCount`
  - `firstPassApproved`
  - structured `RevisionRequest[]`
  - `DeficiencyType` taxonomy
- `docs/tasks/tier-3.md` already scopes `T3-11` to:
  - `QAPIEventSchema`
  - action items
  - clinician scorecards
  - deficiency breakdown by `DeficiencyType`
  - trend reporting route by location/discipline/date range
- `docs/design/DESIGN_PROMPT.md` already assumes a `/qapi` screen and read/full access for quality, leadership, and selected operations roles.

### Immediate conclusion

Hospici already has unusually strong raw ingredients for clinician-quality analytics because `T2-9` captures structured deficiency and rework data. Competitor public material suggests most vendors emphasize:

- compliance oversight
- documentation gaps
- survey readiness
- benchmark reports
- enterprise analytics

But they rarely expose public detail on internal clinician scorecards at the level Hospici is already planning. That creates an opportunity: Hospici can plausibly build a more transparent and actionable scorecard system than competitor public material shows.

---

## 2. Competitor Research

## Axxess

### Confirmed public capabilities

1. **Performance reporting and benchmarking**
   - Axxess publicly promotes Axxess Intelligence reporting for agency performance and benchmark visibility.
   - Public help/materials include quality and performance reporting themes such as Home Health Compare, PEPPER, and survey-relevant reporting.

2. **Operational compliance and survey reporting**
   - Axxess public hospice help includes survey-relevant reports such as census reporting and a broad report catalog.
   - This indicates quality/compliance reporting is a formal product area, not an ad hoc export function.

3. **Workflow-level review and status controls**
   - Public Axxess hospice materials show structured workflows around documentation status, signatures, claim verification, export readiness, and approval queues.
   - These are not explicit "clinician scorecards," but they are the kinds of workflow states from which scorecards are typically derived.

4. **Enterprise intelligence positioning**
   - Axxess markets a data/analytics layer around agency operations and quality performance rather than only basic reports.

### Product read

Axxess appears strongest publicly on **agency-level reporting and operational visibility**, but public evidence is thin on specific clinician-level QA scorecard formulas such as:

- revision frequency
- first-pass approval rate
- deficiency-type distributions by clinician
- review turnaround time

**Inference:** Axxess likely supports parts of this internally or through services/reporting, but the reviewed public materials do not document those exact clinician-scorecard constructs.

## WellSky

### Confirmed public capabilities

1. **Enterprise analytics and performance management posture**
   - WellSky publicly positions itself as a large health-tech platform with reporting, analytics, and operational visibility across care settings.
   - Public materials emphasize analytics maturity more strongly than most smaller competitors.

2. **Quality, reimbursement, and operational insight tooling**
   - WellSky publicly markets tools tied to performance, reimbursement management, payer operations, and outcome visibility.
   - Even when not hospice-specific, this signals stronger enterprise reporting infrastructure.

3. **Organizational visibility and workbench patterns**
   - Public WellSky hospice workflow materials show org-level, office-level, and summary-level workflow control in billing/export contexts.
   - That suggests branch or office rollups are a normal pattern in the product.

4. **Customer-assurance and governance maturity**
   - WellSky's broader public trust/operations posture suggests reporting and quality management likely sit inside a mature enterprise governance model.

### Product read

WellSky appears strongest publicly on **enterprise analytics posture and multi-site operational visibility**. Compared with Axxess and FireNote, WellSky is the best public benchmark for:

- branch / office rollups
- enterprise dashboards
- management-level analytics

**Inference:** Public materials reviewed do not clearly expose clinician-documentation QA scorecards or deficiency-by-discipline dashboards in hospice-specific terms, so those features should not be claimed as confirmed.

## FireNote

### Confirmed public capabilities

1. **Documentation quality and audit-readiness are central product messages**
   - FireNote publicly emphasizes note review, missing-document visibility, audit readiness, and compliance prompts.

2. **Administrative review focus**
   - FireNote publicly states admins have visibility into the patient record and notes and can identify what needs to be corrected before finalization.

3. **Real-time compliance prompts and documentation integrity**
   - FireNote publicly emphasizes prompts that help prevent omissions and non-compliant charting before downstream review.

4. **Outcome-oriented quality claims**
   - FireNote publicly claims major charting time reduction and positions itself around cleaner documentation, smoother audits, and fewer downstream issues.

### Product read

FireNote is the strongest public benchmark for **documentation-quality workflow**, not for enterprise-style numeric scorecards. Public evidence supports:

- note-review oversight
- missing-document tracking
- audit-readiness improvement
- upstream prevention of documentation deficiencies

**Inference:** FireNote likely has strong internal/admin quality visibility, but the reviewed public pages do not expose exact scorecard metrics like first-pass approval rate, deficiency trends by clinician, or turnaround-time distributions.

---

## 3. Competitive Comparison

| Capability | Axxess | WellSky | FireNote | Hospici today |
| --- | --- | --- | --- | --- |
| QAPI / quality-management posture | Yes | Yes | Yes | Planned |
| Agency / enterprise quality reporting | Yes | Yes, strongest public posture | Partial, more workflow-oriented | Planned |
| Clinician documentation review visibility | Publicly implied | Publicly implied | Yes, strongest public signal | Planned via `T2-9` / `T3-13` |
| Structured deficiency taxonomy | Not public | Not public | Not public | Planned / partially modeled |
| First-pass approval metric | Not public | Not public | Not public | Planned from `T2-9` |
| Revision frequency metric | Not public | Not public | Not public | Planned from `T2-9` |
| Turnaround-time metric | Not public | Not public | Not public | Planned from `T2-9` |
| Branch / office trend rollups | Publicly implied | Strongest public signal | Not public | Planned |
| Discipline-specific deficiency trends | Not public | Not public | Not public | Planned |
| Action-item / CAPA style QAPI events | Publicly implied | Publicly implied | Not public | Planned |

### Core takeaway

Competitors clearly market **quality management**, but the reviewed public materials do **not** substantiate a detailed clinician-scorecard model of the kind Hospici is planning. That means Hospici can and should differentiate here instead of just copying surface patterns.

---

## 4. What Hospici Should Copy

### Must copy for market parity

1. **Formal QAPI workspace**
   - Competitors all signal that quality/compliance is a real product area.
   - Hospici needs a dedicated QAPI workspace, not a few reports buried elsewhere.

2. **Leadership-facing trend reporting**
   - Axxess and WellSky both imply management-level quality/performance visibility.
   - Hospici should expose branch/location rollups and time-series trend views clearly.

3. **Admin visibility into documentation problems**
   - FireNote's public messaging is clear here.
   - Supervisors and QA staff need to see what is missing, what is repeatedly deficient, and what is slowing finalization.

4. **Action-oriented quality management**
   - QAPI is not only retrospective analytics.
   - Hospici should support quality events, action items, due dates, owners, and closure evidence.

### Should copy if we want stronger operational depth

1. **Benchmark context**
   - branch vs branch
   - discipline vs discipline
   - current period vs prior period

2. **Executive summaries**
   - high-level quality overview for leadership
   - drilldown for QA staff and supervisors

3. **Survey/audit alignment**
   - quality trends should connect to chart audit and survey readiness, not live as isolated KPIs.

---

## 5. What Hospici Should Differentiate On

### 1. Clinician scorecards built from real review data

This is the biggest opening. Because `T2-9` already captures:

- `revisionCount`
- `firstPassApproved`
- `RevisionRequest[]`
- `DeficiencyType`
- assignment and due dates

Hospici can generate scorecards that competitor public material does not clearly show:

- first-pass approval rate
- average revisions per note
- deficiency mix by clinician
- median review turnaround
- overdue-review burden
- billing-impact and compliance-impact rates

### 2. Discipline-specific deficiency intelligence

Most vendors talk about quality broadly. Hospici can break it down by:

- RN
- SW
- CHAPLAIN
- THERAPY
- AIDE

That is materially useful because documentation risk patterns differ sharply by discipline.

### 3. Branch + discipline combined trend reporting

WellSky gives the strongest public signal for multi-site rollups, but Hospici can go further:

- branch trend over time
- discipline trend over time
- branch x discipline heatmap
- top rising deficiency categories
- first-pass variance across branches

### 4. Transparent deficiency taxonomy

A structured taxonomy is a competitive advantage if surfaced well. Instead of opaque "quality score" composites, Hospici can show:

- what deficiency categories are rising
- which are billing-impacting
- which are compliance-impacting
- which clinicians or branches need coaching

### 5. QAPI actions directly linked to measured trends

QAPI events should not be free-floating meeting notes. Differentiate by letting users create a QAPI event directly from:

- a spike in a deficiency type
- a branch first-pass drop
- an overdue-review trend
- a clinician outlier pattern

That would turn analytics into operational improvement.

---

## 6. Recommended Scope Expansion for `T3-11`

The current `T3-11` wording is good directionally but still underspecified. Recommended replacement:

### T3-11 · QAPI Management + Clinician Quality Scorecards + Deficiency Trends `HIGH`

- New analytics / qapi service built on `T2-9` review data
- TypeBox schemas:
  - `QAPIEvent`
  - `QAPIActionItem`
  - `ClinicianQualityScorecard`
  - `DeficiencyTrendPoint`
  - `DeficiencyTrendReport`
  - `QualityBenchmark`
  - `QualityOutlier`
- QAPI event features:
  - create / update / close event
  - assign action items
  - due dates
  - closure evidence
  - immutable closed events
- Clinician scorecard metrics:
  - review count
  - first-pass approval rate
  - average revision count
  - common deficiency types
  - median turnaround time
  - overdue review rate
  - billing-impact rate
  - compliance-impact rate
- Reporting dimensions:
  - clinician
  - discipline
  - location / branch
  - reviewer
  - date range
  - deficiency type
- Trend views:
  - deficiency type over time
  - branch comparison
  - discipline comparison
  - branch x discipline matrix
  - first-pass trend
  - turnaround trend
- Routes:
  - `GET /api/v1/qapi/events`
  - `POST /api/v1/qapi/events`
  - `PATCH /api/v1/qapi/events/:id`
  - `POST /api/v1/qapi/events/:id/close`
  - `GET /api/v1/analytics/clinician-scorecards`
  - `GET /api/v1/analytics/clinician-scorecards/:userId`
  - `GET /api/v1/analytics/deficiency-trends`
  - `GET /api/v1/analytics/quality-benchmarks`
- Alerting:
  - open QAPI action items overdue
  - sharp first-pass decline
  - rising billing-impact deficiency trend
  - rising compliance-impact deficiency trend

**Done when:** QAPI events support assignment and closure workflow; clinician scorecards compute correctly from `T2-9` review data; first-pass approval, revision frequency, deficiency mix, and turnaround are filterable by clinician/discipline/location/date range; branch and discipline trend reporting highlights rising deficiency categories; overdue action items surface in the alert dashboard.

---

## 7. Boundary With `T2-9` and `T3-13`

`T2-9` should own:

- note review states
- revision requests
- deficiency taxonomy
- reviewer workflow data

`T3-11` should own:

- derived metrics
- scorecards
- trend reporting
- QAPI events and action plans

`T3-13` should own:

- checklist templates
- chart-level completeness / survey readiness
- missing-document indicators

This keeps the analytics layer downstream of the review system rather than duplicating it.

---

## 8. Bottom Line

Public competitor evidence supports that QAPI and quality oversight are important product areas, but it does **not** show detailed clinician documentation scorecards with the specificity Hospici is already positioned to build.

That means Hospici should not underscope `T3-11`.

To be competitively meaningful, `T3-11` should deliver:

1. **Real QAPI event and action-item management**
2. **Clinician scorecards from structured review data**
3. **Branch and discipline deficiency trend reporting**
4. **Actionable drilldowns, not just summary charts**
5. **Linkage to audit readiness and compliance workflows**

This is one of the clearer areas where Hospici can plausibly exceed competitor public capability, not just match it.

---

## Sources

### Local files

- `MASTER_PROMPT.md`
- `docs/tasks/tier-3.md`
- `docs/design/DESIGN_PROMPT.md`
- `docs/tasks/tier-2.md`

### Internet sources

- Axxess Intelligence / reporting materials: https://www.axxess.com/help/axxesshospice/axxess-intelligence/
- Axxess Home Health Compare report: https://www.axxess.com/help/axxesshomecare/reports/home-health-compare-report/
- Axxess PEPPER report: https://www.axxess.com/help/axxesshomecare/reports/pepper-report/
- Axxess Census Report: https://www.axxess.com/help/axxesshospice/admin/census-report/
- WellSky analytics / payer / performance materials: https://wellsky.com/dde-payer-connection/
- WellSky hospice overview: https://wellsky.com/hospice-software/
- WellSky workflow variances PDF: https://info.wellsky.com/rs/596-FKF-634/images/Moving_to_WellSky_Hospice_Palliative_Principal_Workflow_Variances.pdf
- FireNote Compliance Solutions: https://firenote.health/compliance-solutions
- FireNote Informed Intelligence: https://firenote.health/informed-intelligence
- FireNote RapidChart: https://firenote.health/rapidchart-technology
- FireNote Who FireNote Helps: https://firenote.health/who-firenote-helps

