# ADR Audit Record Export Competitive Analysis

**Date:** 2026-03-12  
**Scope:** Hospici `T3-10` ADR audit record export, with adjacent impacts on `T3-13` chart audit mode, `T3-5` signatures, `T3-9` orders, and surveyor read-only access  
**Reviewed local context:** `MASTER_PROMPT.md`, `docs/tasks/tier-3.md`, `docs/design/DESIGN_PROMPT.md`, `backend/docs/SECURITY_MODEL.md`

---

## 1. Current Hospici Baseline

### What the codebase and prompt currently say

- `MASTER_PROMPT.md` lists `T3-10` as `ADR audit record export`.
- `docs/tasks/tier-3.md` currently scopes `T3-10` to:
  - produce a complete chronological record for CMS ADR or TPE audit
  - return structured PDF-ready JSON
  - include encounters, orders, signatures, HOPE, meds/MAR, IDG, NOE/NOTR, and `audit_logs`
  - log export action with `ADR_EXPORT`, requestor, date range, and export hash
- `docs/design/DESIGN_PROMPT.md` already assumes:
  - `ADR Export` at `/patients/:id/export`
  - a separate surveyor portal at `/survey`
  - compliance officer role access to ADR export
- `T3-13` separately owns chart audit mode, checklisting, missing-document indicators, and survey-readiness scoring.

### Immediate conclusion

The local split is directionally correct:

- `T3-10` = assemble and export the record
- `T3-13` = assess completeness and readiness before export

But competitors make clear that record export is not just "generate PDF-ready JSON." The workflow also includes:

- filtering and selecting specific chart sections
- bulk or queued export generation
- PDF and ZIP packaging
- approval/history states
- chronology and section ordering
- permissions and export logging
- audit/survey urgency handling

Hospici already models the destination, but the task wording should reflect that operational reality.

---

## 2. Competitor Research

## Axxess

### Confirmed public capabilities

1. **Bulk patient-chart download for selected document categories**
   - Axxess publicly documents a `Download Patient Chart` workflow in hospice.
   - Users select patient, benefit period, date range, categories, and document status.
   - The export is requested asynchronously, then moves to `Ready`.
   - When ready, users export a ZIP file containing individual PDFs of the requested documents.

2. **Permissioned record-download workflow**
   - Axxess public help shows explicit permissions for `Download Patient Chart`.
   - This indicates chart export is treated as a controlled action, not a generic print button.

3. **Export-manager pattern for regulated datasets**
   - Axxess public hospice help uses dedicated `Export Manager` workflows for HIS and HOPE:
     - `Pending Approval`
     - `Export Ready`
     - `Export History`
   - Files can be generated individually or in bulk.
   - Statuses can be updated after submission or acceptance/rejection.

4. **Correction and history workflows**
   - In HIS and HOPE export flows, Axxess allows modifications, inactivations, revert-to-pending, and export-history review.
   - That shows Axxess treats regulated export as a lifecycle, not a one-shot file download.

5. **Survey support via report exports**
   - Axxess publicly states the Census Report is one of the first reports surveyors request and supports Excel export.

6. **Operational document-management integrations**
   - Axxess publicly documents integrations such as WorldView and Mosai/Forcura for returned document attachment and document management.
   - This matters because ADR response quality depends on chart completeness and attached returned documents, not only native note export.

### Product read

Axxess is strongest publicly on **operational export workflows**:

- request -> ready -> export lifecycle
- selection by date range/category/status
- ZIP of PDFs
- export permissions
- export history
- dedicated managers for regulated outputs

For Hospici `T3-10`, this is the most directly relevant benchmark.

## WellSky

### Confirmed public capabilities

1. **Direct patient-data export from chart**
   - In WellSky's public hospice workflow-variances PDF, patient data can be exported from within the application.
   - Export can be all or specific pieces of the patient chart.

2. **Multiple export formats suited to audits/legal/payer requests**
   - The same WellSky public PDF states chart data export can produce:
     - PDF
     - ZIP files sorted into sub-folders by chart attributes
   - It explicitly says this is useful for external auditing, regulatory compliance, legal, and payer requests.

3. **Structured interoperability export**
   - WellSky publicly documents CCDA export for the patient's electronic health information using continuity-of-care and referral-note documents.
   - That indicates WellSky supports both human-readable packet export and standardized interoperability export.

4. **Survey and quality-report export posture**
   - WellSky publicly markets exportable performance snapshots and analytics outputs.
   - While not the same as ADR packeting, it shows strong export/reporting maturity around regulated use cases.

### Product read

WellSky is strongest publicly on **flexible record packaging**:

- export from inside the chart
- all or partial chart selection
- PDF and ZIP output
- use cases spanning audits, legal, and payer requests

**Inference:** Based on reviewed public materials, WellSky likely has a more generalized document-export and interoperability posture than a hospice-only ADR workflow. Public sources do not expose a branded "ADR packet" feature, but they clearly support the underlying export behaviors.

## FireNote

### Confirmed public capabilities

1. **Audit-readiness messaging explicitly tied to fast response**
   - FireNote's public compliance page says teams can track missing documentation and identify gaps that would create problems during ADR requests before they become emergencies.

2. **Direct public testimonial on TPE response speed**
   - FireNote publicly includes a hospice administrator testimonial stating they were able to reply and provide documents within minutes of requests during a TPE instead of taking days or weeks.

3. **Compliance tooling around documentation integrity**
   - FireNote publicly emphasizes note review, audits, documentation tracking, real-time compliance prompts, and predictable documentation integrity.

4. **One-chart continuity across care lines**
   - FireNote publicly markets one patient record across care lines, which is relevant because fragmented charts are a common audit-export failure mode.

5. **Public detail on actual export mechanics is limited**
   - The reviewed FireNote pages do not publicly detail exact packaging formats, queue states, or export-screen interactions for audit packets.

### Product read

FireNote's public advantage is **audit readiness and retrieval speed**, not detailed export mechanics. Publicly it sells the outcome:

- documents available quickly
- fewer missing items
- less scramble during ADR/TPE

That aligns more with `T3-13` plus `T3-10` together than with `T3-10` alone.

---

## 3. Competitive Comparison

| Capability | Axxess | WellSky | FireNote | Hospici today |
| --- | --- | --- | --- | --- |
| Patient chart export from app | Yes, explicit | Yes, explicit | Implied, not detailed | Planned |
| Export selected chart sections | Yes | Yes | Not public | Partially implied |
| Date-range filtering | Yes | Publicly implied | Not public | Planned |
| Async request -> ready workflow | Yes | Not clearly public | Not public | Not implemented |
| PDF output | Yes | Yes | Not public | Planned via PDF-ready JSON |
| ZIP packaging | Yes | Yes | Not public | Not implemented |
| Export history/status tracking | Yes | Not clearly public | Not public | Not implemented |
| Export permissions | Yes | Likely, not detailed publicly | Not public | Partially implied by role model |
| Audit-readiness / missing-document tracking | Partial | Partial | Strong | Planned in `T3-13` |
| Surveyor / auditor use case called out | Survey reports explicit | Audit/legal/regulatory export explicit | ADR/TPE outcome explicit | Planned |
| Interoperability export | HIS/HOPE files explicit | CCDA explicit | Not public | Not in `T3-10` scope |

---

## 4. What Hospici Should Copy

### Must copy for market parity

1. **Section-selective chart export**
   - Axxess and WellSky both support exporting all or selected chart content.
   - Hospici should not force an all-or-nothing record export for every request.

2. **PDF and ZIP packaging**
   - Axxess and WellSky both publicly support human-usable exported files, not just a data payload.
   - Hospici should support:
     - single merged packet
     - ZIP of section PDFs
     - export manifest

3. **Async export generation**
   - Axxess uses a request/ready/export model.
   - That is safer for large charts and easier to audit than synchronous browser downloads.

4. **Explicit export permissions and logging**
   - Axxess makes this a permissioned function.
   - Hospici already intends to log `ADR_EXPORT`; it should also model permission scope clearly.

5. **Chronological ordering plus completeness awareness**
   - FireNote's public positioning makes the key point: fast export only matters if the chart is complete enough to survive review.
   - `T3-10` should consume readiness signals from `T3-13`, not operate in isolation.

### Should copy if we want stronger operational depth

1. **Export history**
   - who requested it
   - when it was generated
   - hash / file manifest
   - purpose (`ADR`, `TPE`, `survey`, `legal`, `payer`)

2. **Document-category filters**
   - encounter notes
   - signed orders
   - consents
   - IDG
   - HOPE/HIS style assessment exports
   - billing and filing artifacts

3. **Status lifecycle**
   - `REQUESTED`
   - `GENERATING`
   - `READY`
   - `EXPORTED`
   - `FAILED`

---

## 5. What Hospici Should Differentiate On

### 1. Chronological, audit-defensible packet assembly

The current local task already points toward a structured, chronological record. Hospici should make that stronger than competitor public detail by including:

- canonical section order
- document timestamps
- signer and signature-hash metadata
- revision lineage where applicable
- export manifest with counts and hashes

### 2. Merge `T3-10` packeting with `T3-13` completeness intelligence

Competitors publicly separate "export" and "audit readiness" only loosely. Hospici can be cleaner:

- `T3-13` determines missing / deficient / risky items
- `T3-10` assembles the packet and includes a completeness summary

That creates a better compliance story than merely shipping PDFs faster.

### 3. Packet manifest and verification

Differentiate with a first-class manifest:

- patient ID
- export purpose
- requested date range
- included sections
- omitted sections with reason
- total documents
- export hash
- per-file hash

This is stronger than public competitor descriptions and materially useful in dispute resolution.

### 4. Better surveyor / auditor access separation

Your local role model already has surveyor roles and a separate `/survey` context. Use that to keep:

- direct survey access
- one-off ADR packet export
- compliance officer bulk retrieval

as different access patterns with distinct audit trails.

---

## 6. Recommended Scope Expansion for `T3-10`

The current `T3-10` wording is directionally right but operationally thin. Recommended replacement:

### T3-10 · ADR / TPE / Survey Record Packet Export `HIGH`

- New export service for patient audit packets
- TypeBox schemas:
  - `AuditRecordExport`
  - `AuditRecordExportSection`
  - `AuditRecordExportManifest`
  - `AuditRecordExportRequest`
  - `AuditRecordExportHistory`
- Export purposes:
  - `ADR`
  - `TPE`
  - `SURVEY`
  - `LEGAL`
  - `PAYER_REQUEST`
- Export states:
  - `REQUESTED`
  - `GENERATING`
  - `READY`
  - `EXPORTED`
  - `FAILED`
- Inputs:
  - patient
  - benefit period or date range
  - purpose
  - selected sections
  - include audit log toggle
  - include completeness summary toggle
- Output formats:
  - merged PDF packet
  - ZIP of section PDFs
  - manifest JSON
- Required sections available to include:
  - encounters and notes
  - orders and signatures
  - consents
  - medications / MAR
  - HOPE / assessments
  - IDG records
  - NOE / NOTR filings
  - claim / remittance artifacts where relevant
  - audit-log extract
- Packet requirements:
  - chronological ordering
  - section index / table of contents
  - manifest with export hash and per-file hashes
  - omitted-item list with reasons
  - export history
- Security:
  - role-restricted
  - all packet generation and downloads audited
  - optional time-limited download URL / token if async storage is used

**Done when:** Compliance officer can request an ADR packet asynchronously; export status moves through request lifecycle; packet includes selected chart sections in chronological order; merged PDF and ZIP outputs are available; manifest includes hashes and omitted-item notes; export and download actions are logged with `ADR_EXPORT`.

---

## 7. Boundary With `T3-13`

`T3-10` should own:

- packet assembly
- export lifecycle
- output formats
- manifest and hashing
- export history

`T3-13` should own:

- missing-document indicators
- checklist scoring
- survey-readiness logic
- deficiency severity
- saved audit views

`T3-10` can consume `T3-13` output as a `completenessSummary` block inside the export manifest or cover sheet.

---

## 8. Bottom Line

Competitor public evidence points to three different strengths:

- **Axxess:** best public operational export mechanics
- **WellSky:** strongest public evidence for flexible PDF/ZIP chart export for audits, legal, and payer requests
- **FireNote:** strongest public audit-readiness outcome messaging, especially around ADR/TPE speed

If Hospici only implements the current `T3-10` wording, it will have the right idea but not the operational depth agencies expect under audit pressure.

To be competitive, Hospici ADR export should include:

1. **Selective section export**
2. **Async request/ready workflow**
3. **Merged PDF plus ZIP packaging**
4. **Manifest and hashing**
5. **Export history and permissioned access**
6. **Tight linkage to `T3-13` completeness intelligence**

---

## Sources

### Local files

- `MASTER_PROMPT.md`
- `docs/tasks/tier-3.md`
- `docs/design/DESIGN_PROMPT.md`
- `backend/docs/SECURITY_MODEL.md`

### Internet sources

- Axxess Download Patient Charts: https://www.axxess.com/help/axxesshospice/software-updates/download-patient-charts/
- Axxess HIS Export Manager: https://www.axxess.com/help/axxesshospice/clerical/his-export-manager/
- Axxess HIS Submission Manual: https://www.axxess.com/help/training-manuals/hospice/adminclerical/his-submission-manual/
- Axxess HOPE Export Manager: https://www.axxess.com/help/axxesshospice/hope/hope-export-manager/
- Axxess Census Report: https://www.axxess.com/help/axxesshospice/admin/census-report/
- Axxess WorldView Document Management: https://www.axxess.com/help/axxesshospice/integrations/worldview-document-management/
- Axxess Mosai / Forcura Document Management: https://www.axxess.com/help/axxesshospice/integrations/forcura-document-management/
- WellSky workflow variances PDF: https://info.wellsky.com/rs/596-FKF-634/images/Moving_to_WellSky_Hospice_Palliative_Principal_Workflow_Variances.pdf
- WellSky Hospice and Palliative CCDA export PDF: https://info.wellsky.com/rs/596-FKF-634/images/SUPP_CCDA_111721.pdf
- FireNote Compliance Solutions: https://firenote.health/compliance-solutions
- FireNote Who FireNote Helps: https://firenote.health/who-firenote-helps
- FireNote Informed Intelligence: https://firenote.health/informed-intelligence

