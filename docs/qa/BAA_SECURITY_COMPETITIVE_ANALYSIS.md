# BAA Registry and Security Hardening Competitive Analysis

**Date:** 2026-03-12  
**Scope:** Hospici `T3-8` BAA registry + security hardening, with adjacent impacts on auth/session policy, vendor governance, incident response, and audit controls  
**Reviewed local context:** `MASTER_PROMPT.md`, `docs/tasks/tier-3.md`, `docs/design/DESIGN_PROMPT.md`, `docs/architecture/security-model.md`, `backend/docs/BACKEND_STRUCTURE.md`

---

## 1. Current Hospici Baseline

### What the codebase and prompt currently say

- `MASTER_PROMPT.md` lists `T3-8` as `BAA registry + security hardening`.
- `docs/tasks/tier-3.md` currently scopes `T3-8` to:
  - create `docs/compliance/baa-registry.md`
  - verify MFA is enforced
  - enforce auto-logoff timeout
  - document key rotation
  - document incident response
- `docs/design/DESIGN_PROMPT.md` already assumes a standalone BAA Registry page at `/settings/baa` with:
  - vendor name
  - PHI exposure type
  - BAA status
  - BAA date
  - contract owner
  - notes
  - renewal alerts
  - pre-populated vendors including Valkey host, SMTP, hosting, backup/DR, clearinghouse, OpenFDA, Claude/Anthropic
- `backend/docs/BACKEND_STRUCTURE.md` already flags some vendor-risk expectations, including:
  - SMTP/SendGrid as BAA-required
  - DoseSpot as BAA-required
  - file/session fallback constraints

### Immediate conclusion

Hospici is already thinking about the right *artifact* for internal governance: a vendor registry with BAA status and operational alerts. But competitors do **not** appear to expose that kind of registry publicly. Public competitor differentiation in this area is mostly about:

- HIPAA posture
- certifications or attestations
- hosting and encryption claims
- authentication controls
- audit logging
- incident response / disaster recovery messaging
- customer-facing trust portals or security forms

So `T3-8` should be treated as an **internal governance capability** plus a **runtime hardening program**, not as a competitor-cloned UI feature.

---

## 2. Competitor Research

## Axxess

### Confirmed public capabilities

1. **Strong public HIPAA / compliance positioning**
   - Axxess publicly states its platforms are built for HIPAA-compliant care delivery and billing workflows.
   - Public materials emphasize secure exchange of PHI, electronic workflows, and healthcare-specific compliance posture.

2. **Trust-center style security posture**
   - Axxess publicly presents a security and privacy posture through trust/security pages and privacy/legal materials.
   - The public trust materials are aimed at customers and prospects, not internal vendor registry management.

3. **Operational security controls visible in product help**
   - Public Axxess help content exposes security-adjacent operational controls such as physician portal access, user account controls, and documentation settings around signature timestamps and workflow restrictions.
   - This suggests Axxess treats security as embedded in product operations, not only in policy docs.

4. **Large partner/integration ecosystem**
   - Public Axxess materials show a broad ecosystem of integrated partners and clearinghouse/payment workflows.
   - That implies a larger internal vendor-governance surface area than what is visible publicly.

### Product read

Axxess appears to compete on **enterprise trust posture plus workflow-level compliance controls**. Public evidence does not show an internal BAA inventory feature, but it strongly suggests mature vendor governance behind the scenes because of the breadth of integrations and PHI-heavy workflows.

## WellSky

### Confirmed public capabilities

1. **Formal trust center and compliance disclosures**
   - WellSky publicly operates a trust center / compliance posture with materials around privacy, security, and governance.
   - Public materials present a structured vendor-trust program rather than isolated marketing claims.

2. **SOC / availability / operational assurance emphasis**
   - Public WellSky trust materials emphasize security program maturity, platform operations, and customer assurance artifacts.
   - WellSky's security positioning reads more like a scaled health-tech platform than a point-solution vendor.

3. **Partner and payer-network breadth**
   - WellSky publicly markets a wide payer-connection and document-workflow ecosystem.
   - That implies third-party governance and contractual review are major internal functions even if individual BAAs are not listed publicly.

4. **Security-adjacent workflow controls**
   - Public materials for Payer Connection, hospice workflow, and document QA show governance not just at the perimeter, but inside revenue-cycle operations.

### Product read

WellSky appears strongest publicly on **formal trust and governance maturity**. Compared with Axxess and FireNote, WellSky's public posture looks closest to what enterprise buyers expect from a large health-tech vendor: structured trust materials, deeper operational assurance, and broad ecosystem governance.

## FireNote

### Confirmed public capabilities

1. **HIPAA / compliance-centered positioning**
   - FireNote publicly emphasizes compliance, audit readiness, and hospice-specific workflow accuracy.
   - Public messaging focuses more on preventing documentation and operational risk than on publishing a detailed security governance program.

2. **Clinician-authored and traceable documentation posture**
   - FireNote's public RapidChart and compliance materials emphasize traceability, review checkpoints, and reduced risk from opaque AI generation.
   - That is a security/compliance positioning choice even though it is not framed as infrastructure security.

3. **Public security/governance detail is relatively light**
   - Compared with Axxess and WellSky, FireNote's public materials reviewed expose less detail on security frameworks, attestations, or vendor-governance structure.

### Product read

FireNote appears to compete more on **workflow defensibility** than on public trust-center depth. That is not the same as weak security, but it does mean the public signal is lighter. For Hospici, FireNote is less useful as a benchmark for BAA registry design and more useful as a reminder that documentation integrity is part of security posture.

---

## 3. Competitive Comparison

| Capability | Axxess | WellSky | FireNote | Hospici today |
| --- | --- | --- | --- | --- |
| Public trust / security center | Yes, trust/security posture public | Yes, stronger formal trust posture public | Public compliance posture, lighter trust detail | Not public-facing |
| Public BAA registry | Not found in reviewed public sources | Not found in reviewed public sources | Not found in reviewed public sources | Planned internal registry |
| Public vendor inventory | Not found | Not found | Not found | Planned internal registry |
| HIPAA/compliance positioning | Strong | Strong | Strong | Strong architectural intent |
| Product-embedded compliance controls | Yes | Yes | Yes | Partially implemented |
| MFA / session-hardening emphasis | Public security posture exists; detailed public config less visible | Public governance strong; detailed app-config evidence limited | Public detail light | Partially planned / partially implemented |
| Auditability / traceability emphasis | Strong | Strong | Strongest in workflow messaging | Strong architectural intent |
| Ecosystem / third-party governance signal | Strong | Very strong | Moderate public signal | Planned registry only |

### Core takeaway

The **BAA registry itself is not a visible competitor feature**. The competitive pattern is:

- public trust posture externally
- internal vendor governance operationally
- embedded security/compliance controls in product workflows

That means Hospici should not design `T3-8` as "copy competitor trust pages." It should build an internal control plane that competitors likely have but do not surface directly.

---

## 4. What Hospici Should Copy

### Must copy for market parity

1. **Formal security posture, not scattered notes**
   - WellSky in particular shows that enterprise buyers expect a structured trust story.
   - Hospici needs one coherent security package:
     - BAA registry
     - security policies
     - incident response
     - key rotation
     - access-control standards
     - vendor review cadence

2. **Embedded workflow controls, not just legal documentation**
   - Axxess and FireNote both show that security/compliance credibility comes from product behavior too.
   - Hospici must ensure runtime controls visibly back the policy claims:
     - MFA enforcement
     - auto-logoff
     - append-only audit logs
     - break-glass logging
     - session expiry warnings

3. **Third-party governance discipline**
   - Axxess and WellSky both imply broad integration ecosystems.
   - Hospici should treat every PHI-touching vendor as a governed asset with owner, status, review date, and contingency notes.

4. **Customer-assurance readiness**
   - Competitors present assurance signals publicly even when internals are hidden.
   - Hospici should be able to answer customer security questionnaires from the registry and policy docs without rebuilding answers each time.

### Should copy if we want stronger operational depth

1. **Security/trust summary for prospects**
   - Not a full trust portal at first.
   - A concise external-facing security overview would still help enterprise sales.

2. **Vendor review workflow**
   - Annual review date
   - renewal alerting
   - owner assignment
   - status history

3. **Integration-risk categorization**
   - Group vendors by PHI exposure type, not just vendor name.

---

## 5. What Hospici Should Differentiate On

### 1. Make the registry operational, not just documentary

The current design prompt already defines useful columns. Hospici should go further and make the registry enforceable:

- `vendorType`
- `phiExposureLevel`
- `storesPHI`
- `transmitsPHI`
- `subprocessor`
- `baaRequired`
- `baaStatus`
- `effectiveDate`
- `renewalDate`
- `ownerUserId`
- `securityReviewDate`
- `incidentContact`
- `dataResidency`
- `exitPlan`

This would be more useful than the kind of public trust posture competitors expose.

### 2. Tie registry status to runtime configuration

Differentiate by connecting the registry to real controls:

- no production enablement of new PHI-touching integration until vendor record exists
- alert when BAA is missing or near expiry
- alert when vendor is marked PHI-touching but encryption/retention settings are undocumented
- flag runtime config that references a vendor absent from the registry

That turns `T3-8` into a real governance system.

### 3. Treat security hardening as product state, not policy prose

Competitors mostly market posture. Hospici can do better by making hardening measurable:

- MFA required for privileged roles
- 30-minute idle timeout enforced
- `session:expiring` warning at 25 minutes
- immutable audit logs
- documented key-rotation schedule
- PHI encryption verification
- secret-rotation evidence
- backup/restore validation evidence

### 4. Bridge legal/compliance and architecture cleanly

Hospici already has strong architectural primitives:

- Better Auth sessions
- RLS
- append-only audit logs
- PHI encryption service
- location-scoped access

The differentiator is to map those technical controls directly to the registry and compliance docs so governance is auditable end to end.

---

## 6. Recommended Scope Expansion for `T3-8`

The current `T3-8` wording is too small and too document-oriented. Recommended replacement:

### T3-8 · Vendor Governance + BAA Registry + Security Hardening `HIGH`

- Create persistent vendor-governance model, not only markdown
- Tables / schemas:
  - `vendors`
  - `vendor_reviews`
  - `vendor_documents`
  - `security_exceptions`
- Vendor fields:
  - vendor name
  - service category
  - PHI exposure type
  - BAA required
  - BAA status
  - effective date
  - renewal date
  - contract owner
  - security owner
  - subprocessor flag
  - incident contact
  - notes
- Registry statuses:
  - `SIGNED`
  - `PENDING`
  - `NOT_REQUIRED`
  - `EXPIRED`
  - `SUSPENDED`
- Security hardening checklist owned by task:
  - enforce MFA for required roles
  - enforce idle timeout and session warning
  - verify append-only audit integrity checks
  - document and schedule key rotation
  - document incident response and breach workflow
  - document backup/restore verification
  - document vendor-review cadence
- Routes / UI:
  - list vendors
  - create/update vendor
  - attach evidence/docs metadata
  - mark review complete
  - list expiring BAAs
  - list security exceptions
- Compliance alerts:
  - `BAA_EXPIRING`
  - `BAA_MISSING`
  - `SECURITY_REVIEW_OVERDUE`
  - `VENDOR_EXCEPTION_OPEN`

**Done when:** Every PHI-touching vendor in the deployed stack has an owned registry record; missing or expiring BAAs trigger alerts; MFA and idle timeout are enforced in runtime configuration; key rotation and incident response are documented; vendor review status is visible in-product instead of scattered across docs.

---

## 7. Immediate Codebase Gaps Exposed by Local Review

### 1. Current vendor list is too short

The design prompt pre-populates:

- Valkey host
- SMTP provider
- hosting
- backup/DR
- clearinghouse
- OpenFDA
- Claude / Anthropic

But local code/docs also imply additional vendor-governance candidates:

- DoseSpot / eRx vendor
- document workflow partners if adopted later
- monitoring / error-reporting vendor if `T4-8` is implemented
- file/object storage vendor if clinical exports or attachments expand

### 2. Markdown-only registry is not enough

`docs/tasks/tier-3.md` currently asks for `docs/compliance/baa-registry.md`. That is useful as a bootstrap artifact, but it will drift unless backed by persistent data and alerts.

### 3. Hardening controls are split across docs and code

You already have pieces in place or planned:

- Better Auth
- TOTP enforcement gate
- `session:expiring`
- append-only audit logs
- PHI encryption service

`T3-8` should become the task that verifies and documents those controls as one coherent compliance posture.

---

## 8. Bottom Line

Competitors do not publicly expose an internal BAA registry feature. What they expose is trust posture and operational control maturity.

That means Hospici should build `T3-8` around two goals:

1. **Internal vendor governance**
   - a real registry with statuses, owners, reviews, and alerts

2. **Runtime-enforced hardening**
   - MFA, session policy, audit integrity, key rotation, incident response, and vendor-risk visibility

If you do that, Hospici will be stronger than competitor public posture in a way that actually matters during diligence and audits.

---

## Sources

### Local files

- `MASTER_PROMPT.md`
- `docs/tasks/tier-3.md`
- `docs/design/DESIGN_PROMPT.md`
- `docs/architecture/security-model.md`
- `backend/docs/BACKEND_STRUCTURE.md`

### Internet sources

- Axxess Security / Trust materials: https://www.axxess.com/security/
- Axxess Privacy Policy: https://www.axxess.com/privacy-policy/
- Axxess help center and product materials: https://www.axxess.com/help/
- WellSky Trust Center: https://trust.wellsky.com/
- WellSky Payer Connection: https://wellsky.com/dde-payer-connection/
- WellSky Privacy Policy: https://wellsky.com/privacy-policy/
- FireNote Compliance Solutions: https://firenote.health/compliance-solutions
- FireNote RapidChart: https://firenote.health/rapidchart-technology
- FireNote Privacy Policy: https://firenote.health/privacy-policy

