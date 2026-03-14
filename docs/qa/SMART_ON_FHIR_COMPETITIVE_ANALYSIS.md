# SMART on FHIR 2.0 (Backend Services) Competitive Analysis

**Date:** 2026-03-13  
**Scope:** Hospici `T4-1` SMART on FHIR 2.0 (Backend Services), with adjacent impacts on `T3-6` FHIR R4 resources, `T4-2` bulk `$export`, and admin-side SMART app registry  
**Reviewed local context:** `MASTER_PROMPT.md`, `docs/tasks/tier-4.md`, `docs/architecture/security-model.md`, `docs/architecture/backend-specification.md`, `docs/design/DESIGN_PROMPT.md`

---

## 1. Current Hospici Baseline

### What the codebase and prompt currently say

- `MASTER_PROMPT.md` lists `T4-1` as `SMART on FHIR 2.0 (Backend Services)`.
- `docs/tasks/tier-4.md` currently scopes `T4-1` to:
  - all SMART scopes from the security registry
  - Backend Services profile (M2M)
  - JWKS endpoint implementation
- `MASTER_PROMPT.md` shows `T3-6` is already done and includes:
  - FHIR R4 Patient and Observation endpoints
  - CapabilityStatement with SMART security extensions
  - SMART scope enforcement at the route layer
- `docs/design/DESIGN_PROMPT.md` already assumes:
  - FHIR / API settings page
  - SMART App Registry
  - SMART authorization UI
- `docs/architecture/security-model.md` and `docs/architecture/backend-specification.md` already define SMART scope and JWKS/key-rotation expectations.

### Immediate conclusion

Hospici is already ahead of where most hospice-vendor public material appears to be. The remaining work is not "add some FHIR endpoints"; it is a proper SMART authorization-server and app-registration surface for backend-system clients.

Competitor public material suggests:

- integrations matter
- APIs matter
- interoperability is marketable

But I found little credible public evidence that Axxess, WellSky, or FireNote are publicly positioning **SMART on FHIR 2.0 Backend Services** as a first-class hospice capability. That is significant: this is more likely a differentiation area than a parity area.

---

## 2. Competitor Research

## Axxess

### Confirmed public capabilities

1. **Public API / integration posture exists**
   - Axxess publicly markets developer and integration capabilities.
   - The public positioning is around ecosystem connectivity and integrations rather than SMART on FHIR-specific language.

2. **Healthcare workflow interoperability matters in the platform story**
   - Axxess public materials emphasize connectivity across operational and clinical workflows.

### What I did not find publicly

- No strong public evidence of SMART on FHIR 2.0 Backend Services support.
- No public evidence of a SMART app registry, system-level SMART scopes, or published backend-services JWT/JWKS workflow for hospice.
- No public evidence of a SMART discovery endpoint or backend-services authorization-server story.

### Product read

Axxess appears to market **integration capability**, but reviewed public materials do not substantiate a SMART on FHIR Backend Services implementation. If they support it privately or selectively, it is not a prominent public product message.

## WellSky

### Confirmed public capabilities

1. **Strong public interoperability and enterprise integration posture**
   - WellSky publicly markets payer connectivity, platform integrations, and enterprise operations.
   - Public materials signal broader interoperability maturity than smaller hospice-only vendors.

2. **Enterprise-scale trust and platform operations**
   - WellSky's public trust and enterprise posture make advanced interoperability support more plausible organizationally.

### What I did not find publicly

- No strong public evidence of SMART on FHIR 2.0 Backend Services in hospice materials reviewed.
- No clear public app-registration, JWKS, or system-scope story for FHIR backend clients.
- No explicit public statement of SMART on FHIR discovery, authorization, or backend service client flow in the reviewed sources.

### Product read

WellSky likely has the strongest *organizational ability* to support advanced interoperability, but the reviewed public hospice-facing material does not clearly document SMART on FHIR Backend Services.

## FireNote

### Confirmed public capabilities

1. **Strong workflow and compliance positioning**
   - FireNote publicly emphasizes clinician workflow, documentation quality, and hospice-specific operations.

2. **Public product story is workflow-first, not interoperability-first**
   - FireNote's public differentiation focuses on charting speed, compliance, and operational simplicity.

### What I did not find publicly

- No strong public evidence of SMART on FHIR 2.0 support.
- No public FHIR developer posture comparable to enterprise interoperability vendors.
- No public SMART app registry, JWKS, token, or backend-services story.

### Product read

FireNote does not appear to publicly compete on SMART on FHIR Backend Services. This looks like a non-differentiated or non-public product area for them.

---

## 3. Competitive Comparison

| Capability | Axxess | WellSky | FireNote | Hospici today |
| --- | --- | --- | --- | --- |
| Public FHIR posture | Limited / unclear in reviewed hospice sources | Limited / unclear in reviewed hospice sources | Not clearly public | Yes, local architecture already planned and partly implemented |
| Public SMART on FHIR Backend Services story | Not found | Not found | Not found | Planned |
| Public SMART app registry / client management | Not found | Not found | Not found | Planned |
| Public system-level SMART scopes | Not found | Not found | Not found | Planned in security registry |
| Public JWKS / auth-server posture for SMART backend clients | Not found | Not found | Not found | Planned |
| Public hospice-specific interoperability differentiation | Weak public signal | Moderate enterprise signal | Weak | Strong future opportunity |

### Core takeaway

For the reviewed competitors, **absence is the finding**: I did not find strong public evidence that SMART on FHIR 2.0 Backend Services is a visible hospice-market capability for Axxess, WellSky, or FireNote.

That means Hospici should treat `T4-1` as a **differentiation investment**, not as a copy-a-competitor feature.

---

## 4. What Hospici Should Copy

### Must copy for market credibility

1. **General interoperability posture**
   - Even if competitors do not market SMART in detail, healthcare buyers increasingly expect API maturity.
   - Hospici should present a coherent interoperability story, not only internal architecture notes.

2. **App/client governance**
   - Enterprise interoperability requires client registration, scope assignment, and revocation controls.
   - Your design prompt already points in the right direction.

3. **Operational admin visibility**
   - If Hospici offers SMART backend access, admins need:
     - registered clients
     - scopes
     - status
     - key rotation visibility
     - access logs

### Should copy if we want stronger operational depth

1. **Customer-facing interop documentation**
   - public discovery docs
   - client onboarding steps
   - scope catalog
   - security model summary

2. **External trust posture around API security**
   - tie SMART support to JWKS rotation, key custody, audit logging, and app governance.

---

## 5. What Hospici Should Differentiate On

### 1. Real SMART on FHIR Backend Services support

This is the main opportunity. Because `T3-6` already established:

- FHIR R4 Patient / Observation routes
- CapabilityStatement
- SMART scope enforcement

Hospici can differentiate by completing the full backend-services picture:

- client registration
- system scopes
- JWT client assertion flow
- JWKS discovery
- token issuance
- audit logging

### 2. Hospice-specific SMART scope model

Generic EHR interoperability often stops at broad resource scopes. Hospici can make its SMART posture genuinely hospice-aware by aligning scopes and downstream resource access with:

- claims / filings
- hospice assessments
- benefit periods
- compliance exports
- chart packet generation

### 3. Admin-visible SMART governance

Your design prompt already assumes:

- SMART app registry
- active scopes
- JWKS / key rotation visibility
- API access log

That is stronger than what competitor public material exposes and should stay first-class.

### 4. Better auditability and least privilege

Hospici can make every SMART client action traceable:

- client ID
- granted scopes
- resource type accessed
- location / org scope
- response status
- token issuance and expiry

This is especially important for backend-system clients, where end-user UI consent is not the whole story.

### 5. Tie `T4-1` directly to `T4-2`

Backend Services becomes strategically useful when it powers:

- bulk `$export`
- payer / registry integrations
- analytics pipelines
- partner-system sync

Without that linkage, SMART support becomes mostly technical check-boxing.

---

## 6. Recommended Scope Expansion for `T4-1`

The current `T4-1` wording is directionally right but thin. Recommended replacement:

### T4-1 · SMART on FHIR 2.0 Backend Services + Client Registry `HIGH`

- Build authorization-server support for SMART Backend Services profile
- Support:
  - client registration
  - client ID / secret or asymmetric key registration
  - JWT client assertions
  - token endpoint
  - `.well-known/smart-configuration`
  - JWKS endpoint
  - scope registry enforcement
- Admin features:
  - register SMART app
  - rotate / revoke credentials
  - enable / disable scopes
  - view API access logs
- Required audit:
  - client registration changes
  - token issuance
  - token failures
  - resource access by client
  - scope mismatch denials
- Output:
  - SMART discovery document
  - JWKS
  - access tokens for backend clients
  - machine-readable capability docs for client onboarding

**Done when:** Backend client can register, obtain token using SMART-compliant assertion flow, call authorized FHIR endpoints under system scope, and be fully visible in app registry and audit logs; discovery and JWKS endpoints validate against SMART expectations.

---

## 7. Boundary With `T3-6` and `T4-2`

`T3-6` should own:

- FHIR resources and route-level SMART scope checks

`T4-1` should own:

- SMART authorization-server behavior
- client registration
- token and key infrastructure
- backend-services profile support

`T4-2` should own:

- async bulk `$export`
- NDJSON packaging
- export job lifecycle

This keeps authentication/authorization separate from FHIR resource implementation and bulk-data mechanics.

---

## 8. Bottom Line

Public competitor evidence did **not** show SMART on FHIR 2.0 Backend Services as a clearly marketed hospice capability for Axxess, WellSky, or FireNote.

That means:

1. **This is not just a parity feature.**
2. **Hospici can use it as a differentiation lever.**
3. **The admin-side registry, JWKS, scopes, and audit logs matter as much as the token endpoint itself.**

If Hospici executes `T4-1` well, it will likely be ahead of visible competitor public posture in hospice interoperability.

---

## Sources

### Local files

- `MASTER_PROMPT.md`
- `docs/tasks/tier-4.md`
- `docs/architecture/security-model.md`
- `docs/architecture/backend-specification.md`
- `docs/design/DESIGN_PROMPT.md`

### Internet sources

- SMART App Launch / SMART on FHIR overview: https://docs.smarthealthit.org/
- HL7 SMART App Launch Implementation Guide: https://hl7.org/fhir/smart-app-launch/
- Axxess API / integrations posture: https://www.axxess.com/integrations/
- Axxess developer posture: https://www.axxess.com/api/
- WellSky platform / interoperability posture: https://wellsky.com/
- WellSky hospice software: https://wellsky.com/hospice-software/
- FireNote product posture: https://firenote.health/
- FireNote clinical solutions: https://firenote.health/clinical-solutions

