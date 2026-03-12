# EDI 837i Competitive Analysis

**Date:** 2026-03-12  
**Scope:** Hospici `T3-7` EDI 837i claim generation, with adjacent impacts on `T3-12` pre-submission audit, `T3-2` NOE/NOTR filing, and ERA 835 reconciliation  
**Reviewed local context:** `MASTER_PROMPT.md`, `docs/tasks/tier-3.md`, `docs/design/DESIGN_PROMPT.md`, `docs/qa/FIRENOTE_COMPETITIVE_ANALYSIS.md`

---

## 1. Current Hospici Baseline

### What the codebase and prompt currently say

- `MASTER_PROMPT.md` lists `T3-7` as `EDI 837i claim generation` and `T3-12` as a separate `31-point` pre-submission audit.
- `docs/tasks/tier-3.md` currently scopes `T3-7` to:
  - `POST /api/v1/claims`
  - 837i generation
  - BullMQ `claim-submission` queue to clearinghouse
  - ERA 835 ingestion and remittance matching
  - done when 837i validates, DLQ alert fires, and ERA 835 auto-posts remittance
- `docs/design/DESIGN_PROMPT.md` already assumes billing UX that is broader than the current task text:
  - claims list with `Draft / Pending Audit / Audit Failed / Queued / Submitted / Accepted / Rejected`
  - claim detail with clearinghouse response and ERA data
  - pre-submission audit screen
  - remittance view with auto-post and unmatched-review flow

### Immediate conclusion

Hospici already knows the right *surrounding* screens, but the backend task wording is still too narrow. Competitors do not sell 837i generation as "emit one X12 file." They sell a **revenue-cycle workflow** made up of:

- claim readiness detection
- claim generation rules
- pre-submit validation/scrubbing
- claim hold and exception management
- bulk submission
- clearinghouse or payer connectivity
- remittance posting and reconciliation
- denial/rejection follow-up

That fuller operational scope belongs partly in `T3-7` and partly in `T3-12`, but the split needs to be explicit.

---

## 2. Competitor Research

## Axxess

### Confirmed public capabilities

1. **Integrated electronic claim generation and submission**
   - Axxess public billing FAQs state claim files can be generated from the product and submitted electronically through clearinghouses that accept electronic claims.
   - For hospice billing specifically, Axxess states EDI submissions go through a clearinghouse and UB-04 can be printed if a payer requires paper.

2. **Hospice claims, NOEs, and NOTRs are generated and verified in one billing workspace**
   - Axxess public documentation states Axxess Hospice automatically generates claims, NOEs, and NOTRs and checks them for terminal errors.
   - Claims, NOEs, and NOTRs all run through the same validation and submission workflow.

3. **Clearinghouse-integrated rules engine validation before submission**
   - Axxess publicly documents that during verification, claims/NOEs/NOTRs run through Axxess RCM clearinghouse validations.
   - Errors surface before submission, and each item can carry an error badge.

4. **Bulk submission**
   - Axxess explicitly supports selecting multiple verified claims and submitting them in bulk.

5. **Operational readiness indicators before verification**
   - In public hospice billing help, Axxess shows `Visits Completed` and `Orders Completed` indicators and instructs users to confirm signed/dated orders, F2F, CTI, and NOE acceptance before claim verification.

6. **Manual billing holds**
   - Axxess publicly documents the ability to manually hold claims from billing.

7. **Claim automation**
   - Axxess publicly documents automatic population of hospice-specific occurrence-code logic, including OC 55 on applicable discharge/death claims.

8. **ERA/remittance workflow**
   - Axxess states ERAs can populate automatically, can be linked to claims, and can automatically post.
   - The public billing help also references payment and adjustment posting to associated claims.

9. **Billing dashboard and claim summary**
   - Axxess public billing help describes claim-ready counts, bill holds, and a claim summary across paid, pending payment, pending, returned, rejected, and denied states.

### Product read

Axxess is strongest publicly on **integrated hospice billing operations**:

- claim/NOE/NOTR generation in one workflow
- clearinghouse rules-engine validation before submit
- operational readiness checks tied to clinical prerequisites
- billing holds and dashboard visibility
- automatic ERA posting

For Hospici, Axxess is the clearest benchmark for what a hospice-specific 837i workflow should feel like.

## WellSky

### Confirmed public capabilities

1. **Dedicated payer connection platform**
   - WellSky publicly markets `Payer Connection` with:
     - DDE
     - claims transfer
     - 837 claims processing
     - 835 claims processing

2. **837 validation depth**
   - On the public Payer Connection page, WellSky states 837 institutional and professional claims are verified against 837 specs and more than 7,000 business rules.

3. **835 processing and denial/payment analytics**
   - The same page states 835 processing includes payment reconciliation, trend analysis, denial management reporting, and analytics.

4. **Hospice claim-worklist model**
   - In WellSky's public workflow-variances PDF, hospice claims appear in Billing Manager `Ready` or `Not Ready` tabs based on timing/discharge state in one product line.
   - The same document states claim generation in another WellSky hospice product can be done at top organizational level or filtered by office/payer scope.

5. **Claim action breadth**
   - The same WellSky workflow PDF states claim summary supports send, mark as sent, delete, void, check status, edit, and duplicate claim actions.

6. **Notices and correction claims auto-generation**
   - The workflow PDF states notices (`8XA`, `8XB`, `8XC`, `8XD`) and correction claims (`8X7`, `8X8`) generate automatically.

7. **Document-workflow QA before chart/billing completion**
   - WellSky's public Forcura integration flyer states signed documents return into QA status for verification of accurate signature/date before chart attachment and approval/billing.

### Product read

WellSky appears strongest on **revenue-cycle infrastructure depth**:

- broad payer-connectivity tooling
- very large validation rule library
- centralized claim summary operations
- mature 835 reconciliation and denial reporting
- top-level organizational billing controls

**Inference:** Based on public material, WellSky's public 837 story is stronger on clearinghouse-grade transaction processing and back-office operations than on hospice-clinician workflow simplicity.

## FireNote

### Confirmed public capabilities

1. **Claims creation and payer-specific setup**
   - FireNote's public billing page states the product supports payer management, claim creation, and claim logic configuration by payer and claim type.

2. **Month-end-focused billing workflow**
   - FireNote publicly emphasizes month-end close, financial settings, reporting, and claim progress tracking through the month.

3. **Flexible room-and-board workflows**
   - FireNote's public billing page specifically calls out multiple workflows for room-and-board claims.

4. **Export-oriented finance model**
   - FireNote publicly emphasizes raw-data exports and GL mapping aligned with an accounting system.

5. **Operational/billing linkage**
   - FireNote's public team page states admissions, scheduling, reporting, month-end, and claims tools work together to prevent bottlenecks and keep billing moving.

6. **Documentation-to-billing defensibility**
   - FireNote's broader public messaging around compliance and clinician-authored documentation suggests billing quality is downstream of stronger documentation integrity and workflow completeness.

### Product read

FireNote's public billing story is comparatively lighter on explicit transaction-processing details than Axxess or WellSky. The public positioning emphasizes:

- claim creation
- payer-specific claim logic
- month-end workflow
- flexible R&B handling
- exports/reporting

**Inference:** FireNote likely competes more on the idea that cleaner clinical documentation and more intuitive hospice workflow reduce billing friction upstream. Public sources reviewed do not substantiate a detailed clearinghouse-validation, ERA, or denial-management feature set at the same level Axxess and WellSky do.

---

## 3. Competitive Comparison

| Capability | Axxess | WellSky | FireNote | Hospici today |
| --- | --- | --- | --- | --- |
| Native 837i/institutional claim generation | Yes | Yes | Publicly claims claim creation, but 837i detail not explicit | Planned |
| Hospice-specific claim workbench | Yes | Yes | Publicly implied | Design prompt only |
| NOE/NOTR tightly integrated with claims | Yes, explicit | Notices/corrections public in workflow docs | Not public | Partially planned in separate tasks |
| Pre-submit rules-engine validation | Yes, explicit | Yes, explicit 7,000+ business rules | Not public | Split into future `T3-12` |
| Readiness tabs / ready-not-ready queues | Publicly implied via claim-ready/dashboard | Yes, explicit | Progress tracking public | Design prompt only |
| Manual claim holds | Yes | Not clearly public from reviewed sources | Not clearly public | Not implemented |
| Bulk submit / batch ops | Yes, explicit | Central summary actions public | Not public | Not implemented |
| Correction / void workflows | Yes, hospice bill types include replacement/void | Yes, correction claims public | Claim-type logic public, but unclear | Not implemented |
| ERA 835 ingestion / auto-post | Yes, explicit | Yes, explicit | Not public | Planned |
| Denial reporting / analytics | Dashboard and statuses public | Explicit on Payer Connection | Not public | Not implemented |
| Clearinghouse integration depth | Strong | Very strong | Not public | Planned |
| Hospice-specific compliance prerequisites before claim verify | Yes, explicit | Publicly implied via workflow ecosystem | Publicly implied via documentation quality | Not implemented |

---

## 4. What Hospici Should Copy

### Must copy for market parity

1. **Claim workbench, not just claim endpoint**
   - Axxess and WellSky both expose claim operations as queue/workbench workflows.
   - Hospici needs generated claims to move through explicit operational states, not just "created" and "submitted."

2. **Readiness gating before verify/submit**
   - Axxess publicly checks claim prerequisites tied to hospice operations:
     - NOE accepted
     - signed/dated orders
     - F2F and CTI
     - completed visits
   - Hospici should copy this pattern and connect it to `T3-2`, `T3-4`, `T3-5`, and `T2-10`.

3. **Two-stage validation**
   - There should be local domain validation and then clearinghouse-style rules validation.
   - Competitors do not rely on raw X12 generation alone.

4. **Manual and automatic hold mechanics**
   - Axxess shows operational claim holds are a real workflow requirement.
   - Hospici needs bill holds with reason codes and release rules.

5. **ERA posting and reconciliation**
   - Axxess and WellSky both market 835 processing publicly.
   - Hospici should treat ERA as first-class, not a postscript to 837.

6. **Correction / void / replacement support**
   - Hospice claim workflows require more than original claims.
   - Axxess and WellSky both expose this publicly.

### Should copy if we want stronger operational depth

1. **Bulk actions**
   - submit selected
   - mark sent
   - retry
   - hold/unhold
   - download/export batch

2. **Top-level billing visibility**
   - WellSky's org-level claim generation and summary controls are useful for multi-branch hospice operations.

3. **Status dashboards**
   - Axxess claim count summaries and billing dashboards make bottlenecks visible.

---

## 5. What Hospici Should Differentiate On

### 1. Cleaner separation between `T3-7` and `T3-12`

Right now the plan risks an awkward split:

- `T3-7` sounds like transport/generation
- `T3-12` sounds like the actual billing brain

Recommended differentiation:

- `T3-7` owns claim lifecycle, 837i mapping, clearinghouse submission, ERA 835 ingestion, claim state machine
- `T3-12` owns the configurable audit rule catalog and bill-hold policy engine used by `T3-7`

That gives Hospici a more coherent architecture than a vague "generate file here, audit elsewhere" setup.

### 2. Stronger linkage to clinical provenance

Hospici can out-execute competitors by tying claim readiness directly to:

- signed artifacts from `T3-5`
- note review state from `T2-9`
- benefit-period validity from `T3-4`
- NOE/NOTR filing status from `T3-2`
- scheduling completion and missed-visit exceptions from `T2-10`

Competitors publicly expose parts of this. Hospici can make it explicit and auditable.

### 3. Better claim audit explainability

If `T3-12` becomes a transparent rules engine, Hospici can show:

- blocking errors vs warnings
- exact source object and field causing each issue
- remediation CTA and owner role
- audit-history snapshots by claim revision

That would be stronger than generic "validation failed" UX.

### 4. Tamper-evident claim revision history

Pair claim generation with:

- canonical payload hash
- generated X12 hash
- clearinghouse submission batch ID
- previous revision linkage
- replacement/void lineage

This would produce a defensible claim audit trail that is stronger than most competitor public descriptions.

---

## 6. Recommended Scope Expansion for `T3-7`

The current `T3-7` wording is too small. Recommended replacement:

### T3-7 · Hospice Claim Lifecycle + 837i + ERA 835 `HIGH`

- New billing claim lifecycle service in billing context
- TypeBox schemas:
  - `Claim`
  - `ClaimLine`
  - `ClaimRevision`
  - `ClaimSubmission`
  - `ClaimRejection`
  - `Remittance835`
  - `RemittancePosting`
  - `BillHold`
- Claim state machine:
  - `DRAFT`
  - `NOT_READY`
  - `READY_FOR_AUDIT`
  - `AUDIT_FAILED`
  - `READY_TO_SUBMIT`
  - `QUEUED`
  - `SUBMITTED`
  - `ACCEPTED`
  - `REJECTED`
  - `DENIED`
  - `PAID`
  - `VOIDED`
- Generation paths:
  - original claim
  - replacement claim
  - void claim
  - correction claim lineage
- Readiness engine:
  - benefit period valid
  - NOE / NOTR status valid
  - required visits complete
  - required orders and certifications signed
  - F2F / CTI present when required
  - claim not blocked by compliance alerts
- X12 support:
  - UB-04 aligned institutional claim model
  - 837i mapping
  - export/download generated transaction
  - clearinghouse transport metadata
- Queueing:
  - BullMQ submission queue
  - retry policy
  - DLQ with billing alerts
- ERA:
  - ingest 835
  - auto-match to submitted claims
  - auto-post payments/adjustments when confidence is high
  - unmatched-remittance exception queue
- Workbench routes:
  - generate claims
  - list/filter claims
  - get claim detail
  - run audit
  - submit single/bulk
  - hold/unhold
  - replace/void
  - retry rejected
  - list remittances
  - inspect remittance posting

**Done when:** Claim generation supports original/replacement/void flows; readiness checks block submission until hospice prerequisites are met; 837i validates against X12 validator; clearinghouse queue and DLQ path are tested; ERA 835 auto-posts matched remittances and routes unmatched items for manual review.

---

## 7. Recommended Scope Expansion for `T3-12`

The current `31-point` audit task should become the reusable rules engine that powers claim readiness and bill holds.

### T3-12 should own

- configurable rule catalog
- blocking vs warning severity
- claim-audit snapshots
- bill-hold reason taxonomy
- dashboard and aging of unresolved claim issues
- remediation ownership by role

### Example rule groups

- election / benefit period validity
- face-to-face timing
- certification / recertification signatures
- order completeness
- visit completion gaps
- discharge / revocation consistency
- payer-specific bill-type constraints
- revenue code / HCPCS / modifier consistency
- room-and-board payer logic
- sequencing / duplicate-claim protection

---

## 8. Adjacent Changes Recommended

### `MASTER_PROMPT.md`

The planning log should eventually capture that competitor research drove a `T3-7` expansion, the same way prior competitor research expanded `T3-1`, `T3-2`, and `T3-4`.

### `docs/design/DESIGN_PROMPT.md`

The design prompt is already directionally right. It should eventually add:

- explicit hold badges and hold reasons
- ready/not-ready queues
- bulk claim actions
- correction / void lineage view
- denial and rejection panels
- unmatched ERA work queue

### `docs/tasks/tier-3.md`

`T3-7` and `T3-12` should be rewritten together in one pass so their boundaries are clean.

---

## 9. Bottom Line

If Hospici implements only the current `T3-7` wording, it will ship a file generator and queue, not a competitive hospice billing workflow.

To be market-credible against Axxess and WellSky, Hospici claim generation needs:

1. **Claim lifecycle states**
2. **Hospice-specific readiness gating**
3. **Rules-engine validation before submission**
4. **Operational holds and exception queues**
5. **Replacement/void/correction support**
6. **ERA 835 posting and reconciliation**
7. **Dashboard/workbench UX for billing teams**

FireNote's public billing story is less explicit on transaction depth, but it reinforces a separate point: billing quality is downstream of cleaner clinical and compliance workflows. Hospici should keep that linkage explicit in the architecture.

---

## Sources

### Local files

- `MASTER_PROMPT.md`
- `docs/tasks/tier-3.md`
- `docs/design/DESIGN_PROMPT.md`
- `docs/qa/FIRENOTE_COMPETITIVE_ANALYSIS.md`

### Internet sources

- Axxess RCM Rules Engine Validations: https://www.axxess.com/help/axxesshospice/axxess-intelligence/rcm-rules-engine-validations/
- Axxess RCM Rules Engine Validations update: https://www.axxess.com/help/axxesshospice/software-updates/axxess-rcm-rules-engine-validations/
- Axxess Professional Claims: https://www.axxess.com/help/axxesshospice/billing/professional-claims/
- Axxess Billing FAQs: https://www.axxess.com/help/axxesshospice/billing/billing-faqs/
- Axxess Remittance Advice: https://www.axxess.com/help/axxesshospice/axxess-intelligence/remittance-advice/
- Axxess Manual Claim Holds: https://www.axxess.com/help/axxesshospice/software-updates/manually-hold-claims-from-billing/
- Axxess Billing Hospice overview: https://www.axxess.com/help/billing-hospice/
- Axxess Claim Automation Updates: https://www.axxess.com/help/axxesshospice/software-updates/claim-automation-updates/
- WellSky Payer Connection: https://wellsky.com/dde-payer-connection/
- WellSky workflow variances PDF: https://info.wellsky.com/rs/596-FKF-634/images/Moving_to_WellSky_Hospice_Palliative_Principal_Workflow_Variances.pdf
- WellSky + Forcura flyer: https://info.wellsky.com/rs/596-FKF-634/images/WellSkyForcura_Flyer_Web.pdf
- FireNote Billing Solutions: https://firenote.health/billing-solutions
- FireNote Who FireNote Helps: https://firenote.health/who-firenote-helps
- FireNote Compliance Solutions: https://firenote.health/compliance-solutions
- FireNote RapidChart: https://firenote.health/rapidchart-technology

