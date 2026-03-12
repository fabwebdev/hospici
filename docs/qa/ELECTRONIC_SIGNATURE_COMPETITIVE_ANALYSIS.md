# Electronic Signature Competitive Analysis

**Date:** 2026-03-12  
**Scope:** Hospici `T3-5` electronic signatures, adjacent impacts on `T3-9` physician order inbox and `T5-8` on-device signature capture  
**Reviewed local context:** `MASTER_PROMPT.md`, `docs/tasks/tier-3.md`, `docs/design/DESIGN_PROMPT.md`, `docs/qa/FIRENOTE_COMPETITIVE_ANALYSIS.md`

---

## 1. Current Hospici Baseline

### What the codebase and prompt currently say

- `MASTER_PROMPT.md` still defines `T3-5` as a single medium task: "Electronic signatures."
- `docs/tasks/tier-3.md` currently scopes `T3-5` to:
  - TypeBox schema for signatures
  - Tamper-evident hash of signed content + timestamp + signer ID in `audit_logs`
  - Re-signing an already-signed document returns `409`
- `docs/design/DESIGN_PROMPT.md` already assumes a UI for `/patients/:id/sign/:documentType/:documentId` with:
  - read-only document preview
  - typed-name attestation
  - immutable document after sign
  - audit log hash
  - document types: `encounter`, `order`, `recertification`, `f2f`, `idg_record`, `consent`

### Immediate conclusion

Hospici has the right **core compliance primitives**, but the scope is still too thin compared with competitors. Competitors are not treating e-signature as a single sign endpoint; they treat it as a **workflow system** that includes routing, delivery preferences, outstanding signature tracking, exceptions, timing rules, audit state, and patient/family signatures.

---

## 2. Competitor Research

## Axxess

### Confirmed public capabilities

1. **Physician portal for remote order signatures**
   - Axxess states physicians can electronically sign orders through the Axxess Physician Portal.
   - The portal can be used without the physician signing into the main hospice app.
   - Physicians get a pending-review queue and can preview, approve, download, or print orders.

2. **Delivery-method-aware routing**
   - Axxess supports physician delivery preferences including portal, fax, mail, and courier.
   - This means signature workflow is tied to routing policy, not just document state.

3. **Patient/caregiver electronic consents**
   - Axxess supports electronic consent forms and hospice election statements.
   - Public help documentation shows capture of:
     - patient signature
     - patient representative signature
     - agency representative signature
     - reason when patient cannot sign
     - attending physician election fields

4. **Signature date/time controls**
   - Axxess exposes admin settings for editable signature date/time.
   - It can require signature time on documentation.
   - The documented signature date cannot be in the future.
   - Printed/downloaded output shows the documented date/time while the system retains actual completion time for audit.

5. **Exception handling**
   - Axxess allows orders to be marked "No Signature Required."
   - It also supports "Do Not Send" in some workflows.
   - This avoids false outstanding-signature queues for documents that are operationally complete but do not require return signature tracking.

6. **Co-signatures and document signing breadth**
   - Axxess help navigation exposes document co-signatures and medication-profile signing alongside physician-order signing, which implies a broader signing model than a single document type.

### Product read

Axxess is strongest on **operational signature management**:

- provider-facing signing portal
- delivery preference abstraction
- patient/family consent capture
- required date/time controls
- no-signature-required exceptions
- visible pending-signature work queues

This is the most complete public benchmark for Hospici `T3-5`.

## WellSky

### Confirmed public capabilities

1. **Integrated order workflow with external document partners**
   - WellSky publicly highlights its Forcura integration for home health and hospice.
   - In the official flyer, orders generated in WellSky move to Forcura, enter pending-signature status, and when signed documents return they are reconciled and routed back for approval/billing.

2. **Signature/date verification before downstream completion**
   - The same WellSky + Forcura workflow explicitly states orders are placed in QA status to verify accurate signature and date before they are attached back to the chart.

3. **Order batching**
   - A WellSky workflow PDF states multiple applicable orders can flow to a singular order-entry screen, requiring one signature.

4. **Verbal-order compliance support**
   - The same document states verbal orders support a "read back" workflow for compliance.

5. **Visit verification with time-stamped signatures**
   - WellSky hospice marketing publicly describes visit verification with location and time-stamped signatures.

### Product read

Public evidence suggests WellSky's differentiator is less about a native typed-name signing screen and more about **document operations at scale**:

- document transmission
- pending-signature tracking
- reconciliation of returned signatures
- QA validation of signature/date
- grouped orders
- integration with fax/document workflow vendors

**Inference:** Based on public materials, WellSky appears optimized for agencies that still have mixed delivery methods and heavy back-office order management. Public pages do not clearly expose a native physician self-service signing UX comparable to Axxess's physician portal, so that point should not be overstated.

## FireNote

### Confirmed public capabilities

1. **Orders route to physician inbox for signature**
   - FireNote states verbal orders are created from the care plan and automatically routed to the physician inbox for signature.

2. **Signature is embedded in care-plan and prescribing workflow**
   - FireNote states prescribing happens in the care plan and routes to the pharmacy after signature.
   - This implies signature is not treated as a detached back-office function; it is part of the clinical workflow.

3. **Strong authorship and audit-defensibility posture**
   - FireNote's public RapidChart materials emphasize:
     - positive clinician action for every narrative statement
     - direct traceability to clinician action
     - multiple review checkpoints before finalization
     - no silent carry-forward
     - bounded output instead of probabilistic AI

4. **Compliance readiness around documentation completeness**
   - FireNote publicly emphasizes note review, audit readiness, and missing-document tracking.
   - That matters because signature workflow is only defensible if the signed artifact is complete and reviewable before finalization.

### Product read

FireNote's signature story appears to be **workflow-native and authorship-centric**:

- clinicians finalize inside one encounter/care-plan workflow
- orders route automatically from that workflow
- compliance posture is built around traceable authorship before signature

**Inference:** FireNote's public site does not expose as many explicit signature-administration controls as Axxess. Its differentiation appears to be that the signature step is embedded in a cleaner, lower-friction clinical workflow rather than a large configurable order-ops layer.

---

## 3. Competitive Comparison

| Capability | Axxess | WellSky | FireNote | Hospici today |
| --- | --- | --- | --- | --- |
| Tamper-evident signed artifact | Publicly implied, not detailed | Publicly implied via QA and reconciliation | Publicly implied via traceability posture | Planned |
| Physician remote signing | Yes, explicit physician portal | Public evidence favors document-workflow partner model | Physician inbox routing public; portal not public | Not implemented |
| Patient/family consent signature | Yes, explicit | Not clearly public from reviewed sources | Not clearly public from reviewed sources | Planned via design prompt only |
| Agency representative countersign | Yes, explicit | Not clearly public | Not clearly public | Planned via design prompt only |
| Outstanding signature queue | Yes | Yes | Implied | Not implemented |
| Signature exceptions (`no signature required`) | Yes | Not clearly public | Not clearly public | Not implemented |
| Signature date/time requirement | Yes, explicit admin control | Signature/date QA explicit | Not public | Not implemented |
| Group multiple orders into one signature | Not confirmed from reviewed sources | Yes | Not public | Not implemented |
| Verbal-order read-back compliance | Not confirmed from reviewed sources | Yes | Verbal-order routing public | Not implemented |
| Mobile point-of-care patient signature | Yes, explicit Android consent flow | Visit verification signatures public | Not public | Deferred to `T5-8` |
| Finalization lock / immutability | Implied | Implied | Strongly implied | Planned |

---

## 4. What Hospici Should Copy

### Must copy for market parity

1. **Remote physician signing**
   - Axxess sets the bar here.
   - Hospici should support a physician-facing signing experience that does not require full clinical-app onboarding.

2. **Outstanding signature workbench**
   - WellSky and Axxess both make signature tracking operationally visible.
   - Hospici needs queues by `pending`, `sent`, `overdue`, `signed`, `exception`, `rejected/voided`.

3. **Patient/representative/agency signature capture**
   - Axxess clearly supports all three.
   - Hospici's design prompt already assumes `consent`; this should be formalized in backend scope, not left as a UI-only assumption.

4. **Signature metadata policy**
   - Axxess exposes signature date/time requirements.
   - Hospici should store:
     - documented signing timestamp
     - actual submission timestamp
     - signer role
     - signer display name
     - signer legal name
     - reason patient unable to sign, where applicable

5. **Operational exceptions**
   - Axxess's `No Signature Required` is not optional polish.
   - Hospice workflows need explicit exception states to avoid polluting aging dashboards and billing holds.

### Should copy if we want stronger operational depth

1. **Grouped order signing**
   - WellSky's grouped-order signature flow reduces physician friction.

2. **Read-back support for verbal orders**
   - Especially important for `T3-9`.

3. **QA gate before bill-safe completion**
   - WellSky's signature/date verification before chart/billing completion is a strong pattern.

---

## 5. What Hospici Should Differentiate On

### 1. Native tamper-evident verification

Hospici already points in the right direction with:

- content hash
- signer ID
- timestamp
- audit log entry
- `409` on re-sign

Differentiate by making verification first-class:

- store canonicalized content hash, not just rendered PDF hash
- provide a `verifySignature(documentId)` service
- surface verification status in UI and export packets
- persist previous unsigned revision hash when a document transitions to signed

### 2. Unified signature engine across clinical object types

Competitors present signature as fragmented workflows. Hospici can unify:

- encounters
- orders
- recertifications
- F2F
- IDG records
- consents
- care-plan acknowledgements

Use one signature domain model with document-specific adapters.

### 3. Stronger state machine than "signed / unsigned"

Recommended state model:

- `DRAFT`
- `READY_FOR_SIGNATURE`
- `SENT_FOR_SIGNATURE`
- `VIEWED`
- `PARTIALLY_SIGNED`
- `SIGNED`
- `REJECTED`
- `VOIDED`
- `NO_SIGNATURE_REQUIRED`
- `EXPIRED`

This is closer to real agency operations and would align with existing Hospici workbench patterns.

### 4. Better linkage with note review and billing holds

Tie signature workflow directly to:

- `T2-9` note review (`APPROVED` -> `READY_FOR_SIGNATURE` -> `LOCKED`)
- `T3-9` physician order inbox
- `T3-12` claim audit
- chart audit packet completeness in `T3-13`

This would give Hospici a cleaner end-to-end compliance story than current competitor public messaging.

---

## 6. Recommended Scope Expansion for `T3-5`

The current `T3-5` placeholder is too small. Recommended replacement:

### T3-5 · Electronic Signatures `HIGH`

- New bounded context or shared service for signature workflows
- TypeBox schemas:
  - `ElectronicSignature`
  - `SignatureRequest`
  - `SignatureEvent`
  - `SignatureAttestation`
  - `PatientRepresentativeSignature`
  - `AgencyRepresentativeSignature`
  - `SignatureException`
- Canonical document hashing + signature verification service
- Per-document signature policies:
  - who may sign
  - whether countersign required
  - whether patient/representative signature required
  - whether signature time required
  - whether grouping is allowed
- Signature state machine:
  - `DRAFT`, `READY_FOR_SIGNATURE`, `SENT_FOR_SIGNATURE`, `VIEWED`, `PARTIALLY_SIGNED`, `SIGNED`, `REJECTED`, `VOIDED`, `NO_SIGNATURE_REQUIRED`, `EXPIRED`
- Routes:
  - create request
  - sign
  - countersign
  - reject
  - void
  - mark no-signature-required
  - verify signature
  - list outstanding signatures
- Audit requirements:
  - signer user/physician ID
  - signer role
  - rendered name
  - attestation accepted timestamp
  - documented signature timestamp
  - actual system completion timestamp
  - source IP / user agent where applicable
  - content hash
  - prior revision hash
- UI:
  - document preview + attestation
  - pending-signature workbench
  - overdue badge/aging
  - exception actions
  - verification panel

**Done when:** Signed content is cryptographically verifiable; already-signed documents reject re-sign with `409`; outstanding signatures can be tracked by status and age; consents support patient/representative/agency signatures; orders can be routed to physician signature queue; note-review-approved artifacts lock only after successful signature.

---

## 7. Adjacent Changes Recommended

### `T3-9` Physician Order Inbox

Expand `T3-9` to include:

- grouped-signature bundles
- verbal-order read-back metadata
- physician delivery preference
- resend / overdue / escalation mechanics
- signature exception handling

### `T5-8` On-device Signature Capture

This should not be a vague mobile enhancement. It should explicitly support:

- patient or representative finger/stylus capture
- agency representative countersign
- offline-safe temporary capture with encryption
- sync with signed consent artifact
- witness / unable-to-sign reason capture

### `docs/design/DESIGN_PROMPT.md`

The current design prompt is directionally correct but underspecified. It should eventually show:

- multi-signer panels
- outstanding-signature queues
- signature aging/overdue states
- exception states
- signature verification view
- physician lightweight portal/invite flow

---

## 8. Bottom Line

If Hospici only implements the current `T3-5` wording, it will land **below Axxess**, **below WellSky operationally**, and only partially match FireNote's workflow quality.

To be market-credible, Hospici electronic signatures must cover:

1. **Legal/compliance evidence**  
   Hashes, immutability, timestamps, auditability, verification.

2. **Routing and work management**  
   Send, track, age, resend, escalate, exception.

3. **Multi-party signing**  
   Clinician, physician, patient/representative, agency countersign.

4. **Clinical workflow integration**  
   Encounters, care plans, orders, recerts, F2F, IDG, consents.

5. **Downstream controls**  
   Note lock, billing hold release, chart completeness, survey packet export.

That fuller scope would make `T3-5` a true platform capability rather than a single signing endpoint.

---

## Sources

### Local files

- `MASTER_PROMPT.md`
- `docs/tasks/tier-3.md`
- `docs/design/DESIGN_PROMPT.md`
- `docs/qa/FIRENOTE_COMPETITIVE_ANALYSIS.md`

### Internet sources

- Axxess Physician Portal: https://www.axxess.com/help/axxesshospice/clinical/physician-portal/
- Axxess Electronic Consents: https://www.axxess.com/help/axxesshospice/software-updates/electronic-consents/
- Axxess Signature Date and Time Settings: https://www.axxess.com/help/axxesshospice/admin/signature-date-and-time-settings/
- Axxess Physician Electronic Signatures: https://www.axxess.com/help/axxesshospice/software-updates/physician-electronic-signatures/
- Axxess No Signature Required: https://www.axxess.com/help/axxesshospice/software-updates/mark-orders-as-no-signature-required/
- Axxess Physician Signature Not Required: https://www.axxess.com/help/axxesshospice/software-updates/physician-signature-not-required/
- WellSky + Forcura flyer: https://info.wellsky.com/rs/596-FKF-634/images/WellSkyForcura_Flyer_Web.pdf
- WellSky workflow variances PDF: https://info.wellsky.com/rs/596-FKF-634/images/Moving_to_WellSky_Hospice_Palliative_Principal_Workflow_Variances.pdf
- WellSky hospice software page: https://wellsky.com/hospice-software/
- WellSky partnership announcement: https://wellsky.com/wellsky-selects-forcura-as-partner-for-home-health-and-hospice-documentation-workflow-optimization-and-mobile-care-team-coordination/
- FireNote clinical solutions: https://firenote.health/clinical-solutions
- FireNote RapidChart: https://firenote.health/rapidchart-technology
- FireNote compliance solutions: https://firenote.health/compliance-solutions

