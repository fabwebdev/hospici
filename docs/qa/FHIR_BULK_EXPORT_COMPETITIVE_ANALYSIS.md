# FHIR R4 `$export` Bulk Operation Competitive Analysis

**Date:** 2026-03-13  
**Scope:** Hospici `T4-2` FHIR R4 `$export` bulk operation, with adjacent impacts on `T4-1` SMART on FHIR Backend Services and existing `T3-6` FHIR resources  
**Reviewed local context:** `MASTER_PROMPT.md`, `docs/tasks/tier-4.md`, `docs/architecture/backend-specification.md`, `docs/design/DESIGN_PROMPT.md`, `docs/qa/SMART_ON_FHIR_COMPETITIVE_ANALYSIS.md`

---

## 1. Current Hospici Baseline

### What the codebase and prompt currently say

- `MASTER_PROMPT.md` lists `T4-2` as `FHIR R4 $export bulk operation`.
- `docs/tasks/tier-4.md` currently scopes `T4-2` to:
  - NDJSON output
  - async job pattern `202 -> polling -> download`
  - CMS reporting and ONC certification relevance
- `MASTER_PROMPT.md` shows `T3-6` is already done and provides:
  - FHIR R4 Patient and Observation resources
  - CapabilityStatement
  - SMART-aware route protection
- `docs/design/DESIGN_PROMPT.md` already assumes admin-side FHIR / API settings and SMART app governance, which are adjacent to export governance.

### Immediate conclusion

Hospici already has the correct architectural direction for bulk export. The remaining work is the actual Flat FHIR / Bulk Data operation:

- export job lifecycle
- NDJSON packaging
- status polling
- signed download URLs or equivalent secure download flow
- SMART system-scope authorization linkage

Competitor public evidence suggests that:

- exportability matters
- audit/legal/regulatory packaging matters
- enterprise interoperability maturity matters

But only one of the reviewed competitors publicly gives strong evidence for a FHIR Bulk Data-style export capability. That means `T4-2` is partly a parity feature and partly a differentiation feature depending on which competitor you compare against.

---

## 2. Competitor Research

## Axxess

### Confirmed public capabilities

1. **Structured export-manager workflows for regulated hospice datasets**
   - Axxess publicly documents HIS Export Manager and HOPE Export Manager workflows.
   - These support:
     - pending approval
     - export ready
     - export history
     - bulk generation
     - status updates after submission or rejection

2. **Bulk generation of regulated export files**
   - Public Axxess hospice help states users can generate multiple HIS files at once and mark them exported.

3. **Warnings / holds tied to export compliance**
   - Axxess publicly documents HIS export settings that can warn or hold billing until HIS is exported.

4. **General report/export posture**
   - Axxess publicly supports broad export/report workflows across hospice operations.

### What I did not find publicly

- No strong public evidence of a FHIR R4 `$export` Bulk Data API.
- No strong public evidence of NDJSON-based Flat FHIR export.
- No public SMART Backend Services + `$export` story in reviewed hospice-facing materials.

### Product read

Axxess clearly supports **regulated export workflows**, but the public evidence is for productized hospice export managers rather than standards-based FHIR Bulk Data. That makes Axxess a good benchmark for lifecycle/workbench design, but not for a true FHIR `$export` implementation.

## WellSky

### Confirmed public capabilities

1. **Explicit public EHI export based on FHIR Bulk Data Access**
   - WellSky publicly states that its EHI export is based on **FHIR Bulk Data Access**.

2. **NDJSON output**
   - The same public documentation explicitly states output uses **Newline Delimited JSON** for Bulk Data Export.

3. **FHIR R4 plus custom resources**
   - WellSky publicly states exported data includes standard FHIR R4 resources and non-FHIR custom resources expressed as FHIR Base Resource-like structures.

4. **Patient and population export**
   - The public documentation covers electronic health information export suitable for broader certified export use cases, not only single-record download.

5. **CCDA export also exists**
   - WellSky publicly documents CCDA export and chart export workflows separately.
   - This suggests a multi-format interoperability posture rather than a single export mechanism.

### Product read

WellSky is the strongest public benchmark for **actual FHIR Bulk Data-style export** among the reviewed competitors. Publicly, it substantiates:

- Bulk Data Access
- NDJSON
- patient/population export
- multi-format interoperability posture

This is the competitor most directly relevant to Hospici `T4-2`.

## FireNote

### Confirmed public capabilities

1. **Audit/readiness and workflow-oriented export posture**
   - FireNote publicly emphasizes audit readiness, centralized review, and operational reporting.

2. **Public emphasis remains workflow-first**
   - FireNote's public product messaging focuses on charting speed, care-plan workflow, compliance, and billing support.

### What I did not find publicly

- No strong public evidence of FHIR R4 `$export`.
- No public NDJSON / Bulk Data / Flat FHIR posture in reviewed FireNote materials.
- No clear public interoperability story comparable to enterprise FHIR export documentation.

### Product read

FireNote does not appear to publicly compete on standards-based bulk interoperability export. This looks like a non-public or non-differentiated area for them.

---

## 3. Competitive Comparison

| Capability | Axxess | WellSky | FireNote | Hospici today |
| --- | --- | --- | --- | --- |
| Public FHIR Bulk Data / `$export` story | Not found | Yes, explicit | Not found | Planned |
| NDJSON export | Not found | Yes, explicit | Not found | Planned |
| Population-level EHI export | Export-manager style for regulated files, not public FHIR bulk | Yes, explicit | Not found | Planned |
| Export lifecycle / status workbench | Yes, explicit for HIS/HOPE managers | Public certification/export docs | Not public | Planned |
| CCDA / other export formats | Not the focus in reviewed sources | Yes, explicit | Not public | Not in `T4-2` scope |
| SMART + bulk export public linkage | Not found | Not clearly public in reviewed hospice docs | Not found | Planned across `T4-1`/`T4-2` |

### Core takeaway

Among the reviewed competitors:

- **WellSky** clearly substantiates FHIR Bulk Data-style export.
- **Axxess** substantiates export-manager lifecycle patterns, but not public FHIR `$export`.
- **FireNote** does not publicly signal standards-based bulk export.

So `T4-2` is the clearest case where WellSky is the direct standards benchmark and Axxess is only an adjacent workflow benchmark.

---

## 4. What Hospici Should Copy

### Must copy for market credibility

1. **True async bulk-export lifecycle**
   - `202 Accepted`
   - polling endpoint
   - downloadable result when ready

2. **NDJSON output**
   - WellSky publicly confirms this is a credible standards-aligned direction.
   - Hospici should stay aligned with FHIR Bulk Data conventions.

3. **Population-level export**
   - This cannot just be single-patient export in disguise.
   - The operation should support system- or group-scoped export as appropriate.

4. **Operational export status tracking**
   - Axxess export-manager patterns show that users need export status and history, not just a raw endpoint.

### Should copy if we want stronger operational depth

1. **Export history**
   - who requested
   - when generated
   - scope / resource types
   - file count
   - expiration time

2. **Multi-format interop roadmap**
   - Keep `T4-2` focused on FHIR Bulk Data, but acknowledge CCDA and packet exports as adjacent lanes, not replacements.

3. **Export governance in admin UI**
   - Integrate status and app/client visibility into the FHIR settings area.

---

## 5. What Hospici Should Differentiate On

### 1. Cleaner SMART Backend Services + `$export` integration

WellSky publicly shows Bulk Data export, but the reviewed public docs did not strongly connect that to a visible SMART Backend Services story. Hospici can make the linkage explicit:

- backend client registration
- system scopes
- token issuance
- export authorization
- export audit logs

### 2. Hospice-aware resource packaging

Generic bulk export is not enough if the resulting data is awkward for hospice integrations. Hospici can differentiate by ensuring exported datasets align cleanly with hospice-relevant domains:

- Patient
- Observation
- Encounter
- CarePlan
- Claim
- benefit-period-related resources/adapters
- hospice assessment resources/adapters

### 3. Better operational transparency

Differentiate by showing:

- export job status
- resource counts
- failures by resource type
- partial-success diagnostics
- download expiry

This is stronger than a black-box async job.

### 4. Auditability and data-governance controls

Hospici can make every export request traceable:

- client ID
- scope
- export type
- resources requested
- date range / group filter
- generated files and hashes
- download events

### 5. Clear boundary from ADR packet export

Keep this distinct from `T3-10`:

- `T3-10` = human-facing audit packet
- `T4-2` = machine-facing standards export

That separation will be cleaner than competitors’ mixed public export messaging.

---

## 6. Recommended Scope Expansion for `T4-2`

The current `T4-2` wording is directionally correct but thin. Recommended replacement:

### T4-2 · FHIR R4 Bulk Data `$export` + Export Job Lifecycle `HIGH`

- Implement FHIR Bulk Data / Flat FHIR export workflow
- Support:
  - async kickoff endpoint
  - job status polling
  - NDJSON output by resource type
  - secure file download
  - export completion manifest
- Authorization:
  - SMART Backend Services system scopes from `T4-1`
  - location / organization scoping
- Export metadata:
  - requested resources
  - requestor client
  - startedAt / completedAt
  - output file list
  - file hashes
  - expiry time
- Observability:
  - export audit log
  - failure state with reason
  - job metrics

**Done when:** Authorized backend client can initiate `$export`, receive `202`, poll status until complete, download NDJSON files per resource type, and all export activity is visible in audit logs and admin monitoring.

---

## 7. Boundary With `T4-1` and `T3-10`

`T4-1` should own:

- SMART auth
- client registry
- system scopes
- JWKS / token infrastructure

`T4-2` should own:

- bulk export job lifecycle
- NDJSON packaging
- download artifacts

`T3-10` should own:

- human-readable ADR / TPE / survey packet export

This boundary remains correct and should stay explicit.

---

## 8. Bottom Line

Public competitor evidence supports three conclusions:

1. **WellSky is the direct standards benchmark** for FHIR Bulk Data-style export.
2. **Axxess is an adjacent export-workflow benchmark**, not a publicly substantiated FHIR `$export` benchmark.
3. **FireNote does not appear to publicly compete on this capability.**

Hospici should implement `T4-2` as a real standards-grade bulk export, not just a generic async file generator. If done well, it will likely exceed visible public posture for Axxess and FireNote, and be competitive with WellSky on the standards side.

---

## Sources

### Local files

- `MASTER_PROMPT.md`
- `docs/tasks/tier-4.md`
- `docs/architecture/backend-specification.md`
- `docs/design/DESIGN_PROMPT.md`
- `docs/qa/SMART_ON_FHIR_COMPETITIVE_ANALYSIS.md`

### Internet sources

- HL7 Bulk Data / Flat FHIR `$export`: https://www.hl7.org/fhir/us/bulkdata/2019May/export/index.html
- WellSky 170.315(b)(10) EHI Export: https://mediwareinc.github.io/consolo.interop-api-docs/docs/cehrt/b10_ehi_export.html
- WellSky CCDA export/support PDF: https://info.wellsky.com/rs/596-FKF-634/images/SUPP_CCDA_111721.pdf
- Axxess HIS Submission Manual: https://www.axxess.com/help/training-manuals/hospice/adminclerical/his-submission-manual/
- Axxess Check Errors in HIS Export Manager: https://www.axxess.com/help/axxesshospice/software-updates/check-errors-in-his-export-manager/
- Axxess HOPE Export Manager: https://www.axxess.com/help/axxesshospice/hope/hope-export-manager/
- Axxess HIS Export: https://www.axxess.com/help/axxesshospice/software-updates/his-export/
- FireNote homepage: https://firenote.health/
- FireNote clinical solutions: https://firenote.health/clinical-solutions

