# Claim Audit Rules Engine and Billing Alert Dashboard Competitive Analysis

**Date:** 2026-03-12  
**Scope:** Hospici `T3-12` claim audit rules engine, audit snapshots, bill-hold policy engine, and billing alert dashboard, with dependency on `T3-7a` claim lifecycle  
**Reviewed local context:** `MASTER_PROMPT.md`, `docs/tasks/tier-3.md`, `docs/design/DESIGN_PROMPT.md`, `docs/qa/EDI_837I_COMPETITIVE_ANALYSIS.md`

---

## 1. Current Hospici Baseline

### What the codebase and prompt currently say

- `MASTER_PROMPT.md` now defines `T3-12` as:
  - 12 rule groups
  - `BLOCK` / `WARN`
  - audit snapshots
  - bill-hold policy engine
  - billing alert dashboard
- `docs/tasks/tier-3.md` currently scopes `T3-12` to:
  - a configurable audit rule catalog called by `T3-7a`
  - `BLOCK` failures that stop submission
  - `WARN` failures that require supervisor override with audit logging
  - auto-hold rules and hold reason taxonomy
  - billing alerts such as `CLAIM_VALIDATION_ERROR`, `CLAIM_REJECTION_STATUS`, and `BILL_HOLD_*`
  - latest-audit and override routes
- `docs/design/DESIGN_PROMPT.md` already assumes:
  - a pre-submission audit panel with `PASS`, `BLOCK`, `WARN`
  - supervisor override for warnings
  - claim detail timeline and submission gating
  - revenue manager permission to override warn-level failures
- The existing compliance alert system already has a billing-tab stub waiting for `T3-12`.

### Immediate conclusion

The local architecture is now strong and much more specific than before. The main question is whether this scope matches what competitors actually do in public-facing product behavior. Public evidence says yes on the general pattern:

- pre-submit rules validation
- claim holds
- claim-ready / not-ready visibility
- billing dashboards
- denial/rejection visibility
- payment/reconciliation analytics

But competitors usually describe this as operational billing tooling, not as an explicitly modeled `BLOCK/WARN + snapshots + bill-hold engine` architecture. That gives Hospici room to differentiate by being more explainable and auditable than competitor public materials.

---

## 2. Competitor Research

## Axxess

### Confirmed public capabilities

1. **Integrated rules-engine validation before submission**
   - Axxess publicly states claims, NOEs, and NOTRs are automatically run through Axxess RCM clearinghouse validations during verification.
   - Errors surface before submission, and records with errors show an error-count badge.
   - Users can submit only after errors are resolved; bulk submit for verified items is supported.

2. **Explicit errors and warnings in the rules engine**
   - Axxess RCM public help states claim validation shows errors and warnings directly in the workflow.
   - This is the clearest public analogue to Hospici's `BLOCK` / `WARN` split, even though Axxess does not publicly use those exact labels in hospice help.

3. **Billing dashboard with bill-hold and claim-status visibility**
   - Axxess publicly documents a hospice Billing Dashboard / Admin Dashboard with tiles for:
     - Claims Ready to Bill
     - Bill Holds
     - Claim Count Summary
   - Claim Count Summary includes statuses such as paid, pending payment, pending, returned, rejected, and denied.

4. **Real-time hold categories**
   - Axxess publicly documents Bill Holds caused by:
     - Outstanding Orders
     - Incomplete Visits
     - Sequential Billing
     - Plan of Care
   - These update in real time and have report drilldowns.

5. **Manual hold and release workflows**
   - Axxess publicly supports manual claim holds with required reason entry.
   - Claims can be held or released individually or in bulk.

6. **Automatic hold logic for specific compliance scenarios**
   - Axxess publicly documents an automatic billing hold for continuous-care requirements not met.
   - The hold exposes detail and links users back to the underlying task note/date that needs correction.

7. **Claim automation that reduces manual billing errors**
   - Axxess publicly documents hospice claim automation such as automatic occurrence-code population during verification.

8. **Collections / outstanding claims visibility**
   - Axxess publicly documents a Collections screen for outstanding claims with export support.

### Product read

Axxess is the strongest public benchmark for **billing operations visible inside the hospice product**:

- validate before submit
- badge and dashboard visibility
- real-time bill holds
- manual and automatic holds
- claim status summary
- workflow links back to the root cause

For Hospici `T3-12`, this is the best benchmark for the dashboard and hold-policy side.

## WellSky

### Confirmed public capabilities

1. **Large rules scrubber for 837 claims**
   - WellSky publicly states 837 claims are checked against 837 specifications and more than 7,000 business rules.

2. **Payment reconciliation, trend analysis, and denial management reporting**
   - WellSky publicly states 835 processing includes:
     - payment reconciliation
     - trend analysis
     - denial management reporting
     - analytics tools

3. **Secure billing-data history and analytics posture**
   - WellSky publicly positions Payer Connection as a full billing services environment, not only a transport utility.

4. **Claim action breadth in workflow materials**
   - WellSky public workflow documentation shows claim summary actions such as send, mark sent, delete, void, check status, edit, and duplicate.

5. **Ready / Not Ready queue pattern**
   - The same workflow material shows billing manager tabs for `Ready` and `Not Ready`.

### Product read

WellSky is the strongest public benchmark for **rules-engine depth and denial analytics**, especially:

- large rule volume
- denial-management reporting
- payment/reconciliation analytics
- queue-based billing operations

**Inference:** Public sources reviewed do not expose a hospice-specific `BLOCK` / `WARN` model or detailed hold taxonomy, so those should not be claimed as confirmed competitor features. But the public signal is strong that WellSky operates at enterprise scrubber/reporting depth.

## FireNote

### Confirmed public capabilities

1. **31-point internal billing audit**
   - FireNote's public competitive materials explicitly state every claim goes through an automated `31-point` internal billing audit before submission.

2. **Billing and finance workflow controls**
   - FireNote publicly states billing teams can configure claim logic by payer and claim type.
   - Public billing materials emphasize month-end progress tracking, payer management, and granular reporting.

3. **Data-export and finance reporting posture**
   - FireNote publicly highlights raw-data exports and granular reporting for finance workflows.

4. **Compliance-first documentation posture**
   - FireNote's broader public messaging emphasizes documentation integrity and audit readiness, which likely reduces downstream billing exceptions even if the public claim-audit mechanics are not described in detail.

### Product read

FireNote is the clearest public benchmark for **the existence of a named internal billing audit**, but public detail on the actual rule engine is limited. Public sources do not enumerate the 31 checks, their severities, override policy, or bill-hold model.

**Inference:** FireNote likely treats the audit as a largely productized internal scrubber tied to cleaner documentation workflows, but the reviewed public materials do not substantiate explicit snapshotting, override trails, or dashboard taxonomy.

---

## 3. Competitive Comparison

| Capability | Axxess | WellSky | FireNote | Hospici today |
| --- | --- | --- | --- | --- |
| Pre-submit rules validation | Yes, explicit | Yes, explicit | Yes, explicit 31-point audit | Planned |
| Error visibility before submission | Yes | Yes, implied | Yes, audit implied | Planned |
| Warning-level nuance / override path | Errors and warnings public in RCM | Not clearly public | Not public | Planned |
| Audit snapshot per revision | Not public | Not public | Not public | Planned |
| Manual bill holds | Yes, explicit | Not clearly public | Not public | Planned |
| Automatic hold rules | Yes, explicit | Not clearly public | Not public | Planned |
| Hold reason taxonomy | Public categories visible on dashboard | Not public | Not public | Planned |
| Billing dashboard / tiles | Yes, explicit | Public analytics posture, less hospice-specific tile detail | Reporting/progress public | Planned / partial stub |
| Claim-ready / not-ready queues | Yes | Yes | Progress tracking public | Planned |
| Denial / rejection status reporting | Yes | Yes, strong public signal | Not clearly public | Planned |
| Root-cause drilldown to underlying issue | Yes, explicit on some holds | Not public | Not public | Planned |
| Bulk operations around holds / submit | Yes | Yes, action breadth public | Not public | Planned |

---

## 4. What Hospici Should Copy

### Must copy for market parity

1. **Rules validation before submission**
   - All three competitors signal this one way or another.
   - `T3-12` must remain a mandatory pre-submit gate, not an optional report.

2. **Claim-ready and blocked visibility**
   - Axxess and WellSky both surface ready/not-ready or status-based work queues.
   - Hospici should show exactly why a claim is blocked and who owns remediation.

3. **Bill-hold operations**
   - Axxess clearly treats holds as first-class operational objects.
   - Hospici should keep both auto-holds and manual holds.

4. **Billing dashboard with status counts**
   - Axxess's public dashboard pattern is directly applicable:
     - ready to bill
     - bill holds
     - claim count summary
     - rejection / denial visibility

5. **Drilldown from alert to source issue**
   - Axxess's continuous-care hold links back to the underlying note/date issue.
   - Hospici should make every audit failure navigable back to the root source object.

### Should copy if we want stronger operational depth

1. **Bulk remediation operations**
   - release holds
   - submit selected
   - assign unresolved issues

2. **Outstanding-claims collections view**
   - Useful once remittance and denial workflows mature.

3. **Payer- and claim-type-specific rule configuration**
   - FireNote's public payer-logic framing supports this direction.

---

## 5. What Hospici Should Differentiate On

### 1. Explicit `BLOCK` / `WARN` model

Competitors publicly show validations, but not a clean architecture around severity handling. Hospici can make this first-class:

- `BLOCK` = claim cannot move forward
- `WARN` = supervisor override allowed with reason

That is more operationally transparent than generic error lists.

### 2. Audit snapshots as a durable trail

Public competitor material does not clearly expose per-revision audit snapshots. Hospici should keep this as a core differentiator:

- one snapshot per claim revision
- exact failures at that point in time
- source object and source field
- remediation CTA
- override history

This is stronger for disputes, denials, and internal QA.

### 3. Hold-policy engine separated from rule results

This local design is good and should stay:

- rule failures determine `BLOCK` / `WARN`
- hold policy determines operational claim-hold state

That separation is cleaner than conflating validation output with billing status.

### 4. Better explainability than competitor public UX

Hospici can out-execute here by attaching every failure to:

- rule group
- patient / period / filing / signature / note source
- exact field or dependency
- owner lane
- remediation CTA
- downstream claim risk

### 5. Unified alerting across compliance and billing

Because the compliance alert framework already exists, Hospici can integrate billing failures and holds into one consistent alert system instead of creating a disconnected billing-only notification model.

---

## 6. Recommended Scope Expansion for `T3-12`

The current local task is already much stronger than the original placeholder. The main recommendation is to sharpen the dashboard and explainability aspects.

### T3-12 should explicitly own

- configurable rule catalog grouped into 12 rule families
- `BLOCK` / `WARN` failure semantics
- per-revision `claim_audit_snapshots`
- supervisor override workflow for warnings
- bill-hold policy engine and hold taxonomy
- billing alert generation
- aging dashboard by rule group, branch, owner lane, and hold reason

### Recommended 12 rule groups

1. `ELECTION_AND_NOE`
2. `BENEFIT_PERIOD_AND_RECERT`
3. `F2F_AND_CERTIFICATION`
4. `SIGNED_ORDERS_AND_PLAN_OF_CARE`
5. `VISIT_COMPLETENESS`
6. `DISCHARGE_AND_NOTR`
7. `CLAIM_LINE_AND_REVENUE_CODE`
8. `LEVEL_OF_CARE_AND_CONTINUOUS_CARE`
9. `PAYER_AND_TIMELY_FILING`
10. `DUPLICATE_AND_SEQUENTIAL_BILLING`
11. `CAP_AND_COMPLIANCE_RISK`
12. `REMITTANCE_OR_DENIAL_FOLLOW_UP`

### Recommended audit failure shape

- `ruleGroup`
- `ruleCode`
- `severity`
- `message`
- `sourceObject`
- `sourceObjectId`
- `sourceField`
- `remediationCTA`
- `ownerRole`
- `claimBlocking`

### Recommended dashboard sections

1. **Claims Ready / Audit Failed / Ready for Override / On Hold**
2. **Aging by Rule Group**
3. **Aging by Hold Reason**
4. **Aging by Branch**
5. **Owner Lane**
   - billing
   - supervisor
   - clinician
   - physician
   - admin
6. **Top Rejection / Denial Drivers**
7. **Warn Override Volume and Reasons**

---

## 7. Boundary With `T3-7a`

`T3-7a` should own:

- claim lifecycle state machine
- claim generation
- claim revisions
- submission queue
- clearinghouse responses

`T3-12` should own:

- audit-rule execution
- audit snapshots
- hold policy engine
- warn overrides
- billing alerts and dashboard aggregates

This is the right separation and competitor research supports keeping it.

---

## 8. Bottom Line

Public competitor evidence supports the need for all of the following:

1. **Pre-submit validation**
2. **Bill holds**
3. **Billing dashboards**
4. **Rejection / denial visibility**
5. **Actionable drilldowns**

Axxess is the best public benchmark for real-time bill holds and hospice billing dashboards. WellSky is the best public benchmark for scrubber scale and denial analytics. FireNote is the clearest public proof that a named internal claim-audit layer matters.

Hospici should keep the current `T3-12` direction and lean into the parts competitors do not publicly expose well:

- explicit `BLOCK` / `WARN`
- per-revision audit snapshots
- explainable root-cause failures
- alert-driven owner lanes
- unified hold policy engine

That would give Hospici a more defensible and operationally useful billing control plane than competitor public material describes.

---

## Sources

### Local files

- `MASTER_PROMPT.md`
- `docs/tasks/tier-3.md`
- `docs/design/DESIGN_PROMPT.md`
- `docs/qa/EDI_837I_COMPETITIVE_ANALYSIS.md`

### Internet sources

- Axxess RCM Rules Engine Validations: https://www.axxess.com/help/axxesshospice/axxess-intelligence/rcm-rules-engine-validations/
- Axxess RCM Rules Engine Validations update: https://www.axxess.com/help/axxesshospice/software-updates/axxess-rcm-rules-engine-validations/
- Axxess Billing Hospice overview: https://www.axxess.com/help/billing-hospice/
- Axxess Billing Dashboard update: https://www.axxess.com/help/axxesshospice/software-updates/billing-dashboard/
- Axxess Admin Dashboard: https://www.axxess.com/help/axxesshospice/admin/administrator-dashboard/
- Axxess Manual Claim Holds: https://www.axxess.com/help/axxesshospice/software-updates/manually-hold-claims-from-billing/
- Axxess Continuous Care Billing Hold: https://www.axxess.com/help/axxesshospice/software-updates/continuous-care-billing-hold/
- Axxess Claim Automation Updates: https://www.axxess.com/help/axxesshospice/software-updates/claim-automation-updates/
- Axxess Collections Screen: https://www.axxess.com/help/axxesshospice/software-updates/collections-screen-under-billing-tab/
- WellSky Payer Connection: https://wellsky.com/dde-payer-connection/
- WellSky workflow variances PDF: https://info.wellsky.com/rs/596-FKF-634/images/Moving_to_WellSky_Hospice_Palliative_Principal_Workflow_Variances.pdf
- FireNote Billing Solutions: https://firenote.health/billing-solutions
- FireNote competitive-analysis baseline in repo: `docs/qa/FIRENOTE_COMPETITIVE_ANALYSIS.md`
