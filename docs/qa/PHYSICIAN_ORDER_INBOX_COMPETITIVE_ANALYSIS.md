# Physician Order Inbox Competitive Analysis

**Date:** 2026-03-13  
**Scope:** Hospici `T3-9` physician order inbox + paperless order routing, with adjacent impacts on `T3-5` signatures, `T3-2b` F2F routing, and `T3-13` chart completeness  
**Reviewed local context:** `MASTER_PROMPT.md`, `docs/tasks/tier-3.md`, `docs/design/DESIGN_PROMPT.md`, `docs/qa/ELECTRONIC_SIGNATURE_COMPETITIVE_ANALYSIS.md`

---

## 1. Current Hospici Baseline

### What the codebase and prompt currently say

- `MASTER_PROMPT.md` still lists `T3-9` as `Physician order inbox`.
- `docs/tasks/tier-3.md` currently scopes `T3-9` to:
  - verbal orders, DME requests, and frequency changes routed automatically to physician for e-signature
  - use the existing `orders` bootstrap schema from `T3-2b`
  - routes for create, inbox, sign, and reject
- `docs/design/DESIGN_PROMPT.md` already assumes:
  - physician inbox at `/orders/inbox`
  - patient orders tab at `/patients/:id/orders`
  - due-date urgency for unsigned verbal orders
  - DME tracking downstream of physician orders
- `MASTER_PROMPT.md` also shows `T3-2b` already bootstrapped:
  - `orders` table
  - `F2F_DOCUMENTATION` order type
  - physician-routing hooks via F2F task creation

### Immediate conclusion

Hospici already has the right skeleton, but competitor public material shows that "physician order inbox" is broader than a simple sign/reject queue. In practice it also includes:

- physician-facing review queue
- portal or lightweight remote signing
- order status tracking
- reminders / aging
- exception handling
- document return and attachment workflow
- grouped order signing in some systems
- verbal-order compliance support

That broader routing model should inform `T3-9`, not only `T3-5`.

---

## 2. Competitor Research

## Axxess

### Confirmed public capabilities

1. **Physician Portal for remote review and signing**
   - Axxess publicly documents an Axxess Physician Portal for hospice.
   - Physicians can log into a portal and see pending items for review.
   - The portal supports preview, approve, download, and print behavior around orders.

2. **Pending-review queue**
   - Axxess public help explicitly describes a pending-review list in the physician portal.
   - This is the clearest public analogue to Hospici's planned physician inbox.

3. **Delivery-method-aware routing**
   - Axxess publicly supports physician delivery preferences including portal, fax, mail, and courier.
   - Order routing is therefore operationally aware of how the order reaches the physician, not just whether it exists.

4. **Exception handling**
   - Axxess publicly allows orders to be marked `No Signature Required`.
   - This matters because not every routed order should remain in outstanding-signature aging queues forever.

5. **Order status reporting**
   - Axxess publicly documents physician order report and order-tracking workflows tied to signed/unsigned status.

6. **Paperless document-management integrations**
   - Axxess publicly documents integrations such as Forcura/Mosai and WorldView for returned-document attachment and document management.
   - This is relevant because inbox completeness depends on signed documents flowing back into the chart reliably.

7. **Mobile/operational order management posture**
   - Axxess publicly markets mobile and field workflows around orders and signatures, indicating routing is not only a desktop back-office function.

### Product read

Axxess is the strongest public benchmark for **a true physician-facing order inbox**:

- physician portal
- pending review queue
- delivery preference logic
- remote signing
- order status tracking
- signature exceptions

For Hospici `T3-9`, Axxess is the most directly relevant competitor.

## WellSky

### Confirmed public capabilities

1. **Order workflow integrated with document-routing partners**
   - WellSky publicly highlights its Forcura integration for home health and hospice document workflow optimization.
   - Orders generated in WellSky move into a pending-signature workflow and signed documents return for QA verification before chart attachment and approval/billing.

2. **Grouped order-entry / signing**
   - WellSky public hospice workflow documentation states multiple applicable orders can flow to a singular order-entry screen requiring one signature.

3. **Verbal-order read-back support**
   - The same workflow material states verbal orders support a read-back workflow for compliance.

4. **Back-office QA after document return**
   - Public materials state signed orders returning from the routing workflow are placed into QA status to verify accurate signature/date before downstream completion.

5. **Enterprise workflow operations**
   - WellSky's public materials emphasize document workflow optimization and mobile care-team coordination more than a branded physician portal experience.

### Product read

WellSky is strongest publicly on **order-routing operations and document-return management**, especially:

- send out for signature
- grouped order handling
- verbal-order compliance
- QA verification after return

**Inference:** Reviewed public sources do not clearly expose a native physician self-service inbox comparable to Axxess's physician portal. WellSky's public story reads more like a strong operational routing and document-processing system than a physician-centric inbox UX.

## FireNote

### Confirmed public capabilities

1. **Automatic routing from care plan to physician inbox**
   - FireNote publicly states verbal orders are created from the care plan and automatically routed to the physician inbox for signature.

2. **Unified clinical workflow**
   - FireNote publicly positions order routing as part of the same care-plan and documentation workflow, not a detached module.

3. **Prescribing tied to signature flow**
   - FireNote publicly states prescribing can happen from the care plan and route onward after signature.

4. **Clinician-first design**
   - FireNote's broader public materials emphasize lower-friction hospice workflow and fewer duplicated steps across documentation, care plan, and downstream actions.

### Product read

FireNote is the strongest public benchmark for **workflow-native routing**:

- orders are created where clinical work happens
- routing happens automatically
- physician signature is part of one cohesive workflow

**Inference:** Public material reviewed does not expose detailed inbox states, reminder mechanics, grouped order signing, or document-return processing at the level Axxess and WellSky do.

---

## 3. Competitive Comparison

| Capability | Axxess | WellSky | FireNote | Hospici today |
| --- | --- | --- | --- | --- |
| Physician-facing order inbox / portal | Yes, explicit | Not clearly public | Physician inbox routing public, portal not public | Planned |
| Pending review queue | Yes | Pending-signature workflow public | Implied | Planned |
| Remote order signing | Yes | Yes via routing/document workflow | Yes, implied by routing/signature flow | Planned |
| Delivery preference logic | Yes, explicit | Mixed routing workflow implied | Not public | Not implemented |
| Group multiple orders for one signature | Not clearly public in reviewed sources | Yes, explicit | Not public | Not implemented |
| Verbal-order read-back support | Not clearly public | Yes, explicit | Verbal-order routing public | Not implemented |
| Document return + QA verification | Yes via document integrations | Yes, explicit | Not public | Not implemented |
| No-signature-required exception | Yes, explicit | Not clearly public | Not public | Not implemented |
| Care-plan-native order creation | Not clearly public | Not clearly public | Yes, explicit | Partially planned via care-plan/order links |
| DME / downstream order tracking | Public document-management ecosystem | Strong ops posture | Not public | Planned via DME tab |

---

## 4. What Hospici Should Copy

### Must copy for market parity

1. **Physician-facing inbox**
   - Axxess makes this table stakes.
   - Hospici should keep a dedicated physician queue with status, due date, preview, and action buttons.

2. **Remote signing without full clinical-app complexity**
   - Physicians should not need the entire clinical UI to act on orders.
   - A lightweight physician-facing experience is important.

3. **Order aging and urgency**
   - Due dates, overdue states, and escalating urgency are operationally critical, especially for verbal orders.

4. **Exception handling**
   - `No Signature Required` or similar exception states are necessary to avoid stuck queues.

5. **Return-to-chart reliability**
   - WellSky's QA-after-return pattern matters.
   - Hospici should ensure a signed order reliably transitions into chart-complete state and downstream readiness logic.

### Should copy if we want stronger operational depth

1. **Grouped order bundles**
   - Helpful when multiple related orders are awaiting the same physician signature.

2. **Read-back metadata for verbal orders**
   - This is an important compliance detail that should not be left implicit.

3. **Delivery preferences**
   - portal
   - fax
   - courier / mail
   - routed document partner

---

## 5. What Hospici Should Differentiate On

### 1. Unified task routing across physician work

Hospici already has F2F routing bootstrapped into the `orders` table. That should become a real differentiator:

- verbal orders
- DME
- frequency change
- medication orders
- `F2F_DOCUMENTATION`
- future recert / certification tasks

One physician inbox should handle all physician work items, not only signatures.

### 2. Stronger state machine than `pending/signed/rejected`

Recommended states:

- `DRAFT`
- `PENDING_SIGNATURE`
- `VIEWED`
- `SIGNED`
- `REJECTED`
- `EXPIRED`
- `VOIDED`
- `NO_SIGNATURE_REQUIRED`
- `COMPLETED_RETURNED`

This is more realistic than a minimal tri-state inbox.

### 3. Better linkage to downstream workflows

Tight integration points already exist or are planned:

- `T3-5` signature engine
- `T3-2b` F2F routing
- `T3-7a`/`T3-12` claim readiness and signed-orders checks
- `T3-13` chart completeness and unsigned-order indicators
- DME tracking screen

Hospici can make this more coherent than competitor public workflows by using one shared order task model.

### 4. Explainable urgency and reminders

Differentiate by surfacing:

- due date reason
- SLA clock
- what downstream process is blocked
- escalation path

Example: "Unsigned verbal order, 11 hours until 72-hour window closes, claim readiness will be blocked."

### 5. Cleaner clinician -> physician handoff

FireNote's biggest lesson is that the handoff should originate naturally from the care workflow. Hospici should avoid requiring duplicate order entry in a separate admin module whenever possible.

---

## 6. Recommended Scope Expansion for `T3-9`

The current `T3-9` wording is too small. Recommended replacement:

### T3-9 · Physician Order Inbox + Paperless Order Routing `HIGH`

- Build full orders service on top of existing `orders` table bootstrap
- Support order/task types:
  - `VERBAL`
  - `DME`
  - `FREQUENCY_CHANGE`
  - `MEDICATION`
  - `F2F_DOCUMENTATION`
  - future certification tasks
- Order states:
  - `DRAFT`
  - `PENDING_SIGNATURE`
  - `VIEWED`
  - `SIGNED`
  - `REJECTED`
  - `EXPIRED`
  - `VOIDED`
  - `NO_SIGNATURE_REQUIRED`
  - `COMPLETED_RETURNED`
- Inbox/workbench views:
  - pending
  - overdue
  - rejected
  - exceptions
  - completed
- Required metadata:
  - ordering clinician
  - assigned physician
  - due date
  - urgency reason
  - verbal-order read-back flag / timestamp
  - delivery method / preference
  - linked patient / linked benefit period when relevant
  - linked signature request ID
- Routes:
  - create order
  - list inbox
  - get detail
  - sign
  - reject
  - mark viewed
  - mark no-signature-required
  - resend / reroute
  - list overdue
- Eventing:
  - `order:created`
  - `order:viewed`
  - `order:signed`
  - `order:rejected`
  - `order:expired`
  - `order:overdue`
  - `order:f2f:required`
- Dashboard / UI:
  - physician inbox
  - patient orders tab
  - overdue urgency pills
  - blocked-downstream messaging
  - grouped bundles if multiple related orders target same physician

**Done when:** Physician sees all pending routed work in one inbox; remote signing works without full clinical-app complexity; overdue/expired order states surface clearly; `No Signature Required` exceptions are supported; F2F tasks share the same routing framework; signed orders feed chart completeness and billing readiness checks.

---

## 7. Boundary With `T3-5`

`T3-5` should own:

- signature request / signature records
- attestation, countersign, verification
- signature state machine

`T3-9` should own:

- the physician work queue
- task routing
- order/task metadata
- reminders, due dates, rerouting
- work-item lifecycle

This keeps inbox orchestration separate from the legal signature engine.

---

## 8. Bottom Line

Public competitor evidence points to three distinct lessons:

- **Axxess:** physician portal and pending-review queue are table stakes
- **WellSky:** routing operations, grouped order flow, and document-return QA matter
- **FireNote:** order routing should originate naturally from the clinical workflow

Hospici should not implement `T3-9` as only four routes and a basic sign/reject table. To be competitive, it needs:

1. **A real physician-facing inbox**
2. **A richer order/task state model**
3. **Due-date urgency and exception handling**
4. **Routing that feeds chart completeness and billing readiness**
5. **One shared framework for order and F2F physician tasks**

That would make the inbox operationally stronger than what competitor public material exposes.

---

## Sources

### Local files

- `MASTER_PROMPT.md`
- `docs/tasks/tier-3.md`
- `docs/design/DESIGN_PROMPT.md`
- `docs/qa/ELECTRONIC_SIGNATURE_COMPETITIVE_ANALYSIS.md`

### Internet sources

- Axxess Physician Portal: https://www.axxess.com/help/axxesshospice/clinical/physician-portal/
- Axxess Physician Electronic Signatures: https://www.axxess.com/help/axxesshospice/software-updates/physician-electronic-signatures/
- Axxess Mark Orders as No Signature Required: https://www.axxess.com/help/axxesshospice/software-updates/mark-orders-as-no-signature-required/
- Axxess Physician Signature Not Required: https://www.axxess.com/help/axxesshospice/software-updates/physician-signature-not-required/
- Axxess WorldView Document Management: https://www.axxess.com/help/axxesshospice/integrations/worldview-document-management/
- Axxess Forcura / Mosai Document Management: https://www.axxess.com/help/axxesshospice/integrations/forcura-document-management/
- WellSky + Forcura flyer: https://info.wellsky.com/rs/596-FKF-634/images/WellSkyForcura_Flyer_Web.pdf
- WellSky workflow variances PDF: https://info.wellsky.com/rs/596-FKF-634/images/Moving_to_WellSky_Hospice_Palliative_Principal_Workflow_Variances.pdf
- FireNote Clinical Solutions: https://firenote.health/clinical-solutions
- FireNote RapidChart: https://firenote.health/rapidchart-technology
- FireNote CareLines: https://firenote.health/carelines

