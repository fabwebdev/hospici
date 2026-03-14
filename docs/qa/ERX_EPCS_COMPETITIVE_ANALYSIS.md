# eRx Integration (EPCS) Competitive Analysis

**Date:** 2026-03-13  
**Scope:** Hospici `T4-3` eRx integration (EPCS), with adjacent impacts on `T2-6` medication management, pharmacy coordination, and physician tasking  
**Reviewed local context:** `MASTER_PROMPT.md`, `docs/tasks/tier-4.md`, `docs/tasks/tier-2.md`, `docs/design/DESIGN_PROMPT.md`, `backend/docs/BACKEND_STRUCTURE.md`

---

## 1. Current Hospici Baseline

### What the codebase and prompt currently say

- `MASTER_PROMPT.md` lists `T4-3` as `eRx integration (EPCS)`.
- `docs/tasks/tier-4.md` currently scopes `T4-3` to:
  - DoseSpot or NewCrop staging round-trip
  - DEA registration + 2FA device audit before controlled-substance e-prescribing
- `docs/tasks/tier-2.md` already delivered a substantial local medication-management base:
  - active medication list
  - MAR
  - allergy tracking
  - OpenFDA interaction checks
  - pharmacy coordination fields
  - physician order linkage placeholder
  - controlled-substance schedule tracking
- `backend/docs/BACKEND_STRUCTURE.md` already points to `dosespot.schema.ts` and marks eRx as a BAA-required integration.

### Immediate conclusion

Hospici already has the right prerequisite foundation. Competitor public evidence suggests that hospice eRx matters most when it is:

- clinically embedded
- pharmacy-connected
- tied to medication workflow
- compliant for controlled substances where supported

Public detail on full EPCS mechanics is much thinner than public detail on basic e-prescribing. So `T4-3` should be treated as a high-complexity interoperability and compliance task, not as a surface feature to imitate from marketing pages.

---

## 2. Competitor Research

## Axxess

### Confirmed public capabilities

1. **Public hospice e-prescribing support**
   - Axxess publicly markets e-prescribing for hospice.
   - Public product messaging positions it as part of clinical workflow, not a disconnected utility.

2. **Integrated medication / physician workflow posture**
   - Axxess public materials connect e-prescribing to broader clinical and physician workflows.

3. **Operational medication-management emphasis**
   - Public product/help materials show medication and physician-order workflows as part of the core hospice system rather than an external-only handoff.

### What I did not find publicly

- No strong public detail on Axxess hospice EPCS workflow mechanics in the reviewed sources.
- No clear public detail on DEA identity proofing, token/device flow, or controlled-substance signing path.
- No clear public statement of vendor partner or technical architecture for EPCS in the reviewed hospice-facing materials.

### Product read

Axxess clearly competes on **hospice e-prescribing presence**, but the reviewed public material is stronger on product existence than on EPCS implementation detail.

## WellSky

### Confirmed public capabilities

1. **Enterprise medication / pharmacy / interoperability posture**
   - WellSky publicly markets broad clinical, pharmacy, and interoperability capabilities across care settings.
   - This suggests organizational readiness for eRx workflows.

2. **Strong platform and partner operations signal**
   - WellSky publicly presents a mature enterprise platform posture, making advanced medication integrations plausible.

### What I did not find publicly

- No strong public hospice-specific eRx or EPCS detail in the reviewed sources.
- No clear public EPCS workflow or controlled-substance prescribing process in hospice-facing materials reviewed.
- No clear public partner-specific hospice eRx story in the reviewed public materials.

### Product read

WellSky likely has stronger enterprise integration capability than smaller hospice vendors, but the reviewed hospice-facing public material does not clearly document eRx/EPCS in a way that can be treated as a direct product benchmark.

## FireNote

### Confirmed public capabilities

1. **Public hospice e-prescribing support**
   - FireNote publicly states e-prescribing is built into the care plan workflow.

2. **Care-plan-native prescribing**
   - FireNote publicly positions medication prescribing as part of the same place clinicians are already managing goals, frequencies, and interventions.

3. **Pharmacy routing after signature**
   - FireNote publicly states prescribing routes to the pharmacy after signature.

4. **Workflow-first medication posture**
   - FireNote's public story emphasizes reducing duplicate charting and keeping medication actions inside the main clinical workflow.

### What I did not find publicly

- No strong public detail on FireNote EPCS specifics.
- No clear public controlled-substance identity proofing / token flow detail.
- No public vendor-specific prescribing architecture in the reviewed sources.

### Product read

FireNote is the strongest public benchmark for **workflow-native eRx**:

- prescribing inside care plan
- route to pharmacy after signature
- minimal workflow friction

But public evidence for **EPCS-specific mechanics** is limited.

---

## 3. Competitive Comparison

| Capability | Axxess | WellSky | FireNote | Hospici today |
| --- | --- | --- | --- | --- |
| Public hospice eRx support | Yes | Not clearly public in reviewed hospice sources | Yes | Planned |
| Workflow-native prescribing | Publicly implied | Not clearly public | Yes, explicit | Not implemented |
| Pharmacy routing after order/signature | Publicly implied | Not clearly public | Yes, explicit | Partially scaffolded via pharmacy fields |
| Medication-management integration | Yes | Broad enterprise signal | Yes | Strong local foundation |
| Public EPCS specifics | Not found | Not found | Not found | Planned |
| Public DEA / 2FA controlled-substance flow | Not found | Not found | Not found | Planned |
| Public vendor/partner technical detail | Limited | Limited | Limited | DoseSpot/NewCrop planned |

### Core takeaway

The reviewed competitors publicly substantiate **eRx presence**, especially Axxess and FireNote, but they do **not** publicly expose much detailed EPCS implementation. That means Hospici should benchmark the workflow layer from competitors, while treating the compliance and technical EPCS layer as something it must design rigorously itself.

---

## 4. What Hospici Should Copy

### Must copy for market parity

1. **Clinically embedded prescribing**
   - FireNote is the clearest benchmark here.
   - Hospici should not make eRx feel like an external bolt-on detached from medication review and care planning.

2. **Medication workflow integration**
   - eRx should connect cleanly to:
     - med list
     - allergies
     - pharmacy
     - prescriber
     - physician order context

3. **Signature / authorization gating before pharmacy transmission**
   - FireNote's public story suggests clear handoff after signature/approval.
   - Hospici should keep the prescribing workflow explicit and auditable.

4. **Pharmacy-aware workflow**
   - A useful hospice eRx flow must include pharmacy selection and communication context, not only prescription generation.

### Should copy if we want stronger operational depth

1. **Prescribing from care-plan context**
   - Especially strong for comfort kits, symptom management, and plan-of-care changes.

2. **Medication-order linkage**
   - Tie prescriptions to physician orders and care-plan changes where appropriate.

3. **Low-friction workflow**
   - Avoid duplicate entry between medication list, care plan, and physician order routing.

---

## 5. What Hospici Should Differentiate On

### 1. Real EPCS compliance, not just eRx marketing

Competitor public pages mostly stop at "we support e-prescribing." Hospici should make the controlled-substance path a first-class compliance feature:

- DEA registration check
- identity proofing status
- 2FA device audit
- controlled-substance signing restrictions
- full audit log of prescription actions

### 2. Build on the medication foundation already in place

Your local codebase already has:

- medication CRUD
- DEA schedule fields
- allergy tracking
- pharmacy fields
- OpenFDA interactions
- MAR

That is stronger raw groundwork than many marketing pages imply. `T4-3` should capitalize on it instead of bypassing it.

### 3. Better linkage to physician workflow

Hospici can connect eRx to:

- `T3-9` physician order/task routing
- signed medication orders
- comfort-kit workflows
- chart audit completeness
- billing/compliance signals where medication orders matter

### 4. Safer controlled-substance UX

Differentiate with explicit UX around:

- whether a medication is controlled
- whether current prescriber is EPCS-enabled
- which prerequisite is missing if prescribing is blocked
- what audit trail will be generated

### 5. Stronger admin/vendor governance

Because the codebase already tracks DoseSpot as BAA-required, Hospici can differentiate by making operational readiness visible:

- vendor enabled / disabled
- environment / staging status
- DEA / EPCS readiness checklist
- credential / integration health

---

## 6. Recommended Scope Expansion for `T4-3`

The current `T4-3` wording is too thin. Recommended replacement:

### T4-3 · eRx + EPCS Integration `HIGH`

- Integrate DoseSpot or NewCrop using staging first
- Support:
  - prescribe new medication
  - renew / discontinue where supported
  - pharmacy selection
  - prescription status sync where available
- Controlled-substance path:
  - DEA registration verification
  - EPCS-enabled prescriber flag
  - 2FA device audit
  - blocked prescribing if prerequisites not met
- Admin / ops:
  - vendor config status
  - sandbox / staging connectivity check
  - prescriber readiness list
  - audit logs for every prescription event
- Workflow integration:
  - medication list updates
  - care-plan-originated prescribing
  - physician order linkage
  - pharmacy coordination data reuse

**Done when:** Staging round-trip succeeds with DoseSpot or NewCrop; non-controlled prescriptions can be issued from medication workflow; controlled-substance path enforces DEA + 2FA readiness checks; prescription actions are auditable and linked back to patient medication records.

---

## 7. Boundary With `T2-6` and `T3-9`

`T2-6` should own:

- medication and MAR source of truth
- allergy and pharmacy coordination data
- interaction checks

`T3-9` should own:

- physician task/inbox routing
- order workflow

`T4-3` should own:

- external prescribing integration
- pharmacy transmission
- EPCS compliance controls

This keeps the external eRx vendor integration from leaking into basic medication CRUD or generic physician tasking.

---

## 8. Bottom Line

Public competitor evidence supports this much:

1. **Axxess and FireNote clearly compete on hospice eRx presence.**
2. **FireNote is the clearest public benchmark for care-plan-native prescribing.**
3. **Public EPCS-specific detail is sparse across all reviewed competitors.**

So Hospici should copy the workflow strengths:

- prescribing inside clinical workflow
- pharmacy-connected handoff
- low-friction medication updates

But it should treat the EPCS compliance and technical layer as an area where it must exceed competitor public detail, not imitate it.

---

## Sources

### Local files

- `MASTER_PROMPT.md`
- `docs/tasks/tier-4.md`
- `docs/tasks/tier-2.md`
- `docs/design/DESIGN_PROMPT.md`
- `backend/docs/BACKEND_STRUCTURE.md`

### Internet sources

- Axxess hospice / product posture: https://www.axxess.com/hospice-software/
- Axxess mobile healthcare software: https://www.axxess.com/mobile-healthcare-software/
- WellSky hospice software: https://wellsky.com/hospice-software/
- WellSky platform: https://wellsky.com/
- FireNote clinical solutions: https://firenote.health/clinical-solutions
- FireNote homepage: https://firenote.health/
- FireNote who FireNote helps: https://firenote.health/who-firenote-helps

