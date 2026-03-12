# Firenote Competitive Analysis & Feature Implementation Plan
## Hospici vs Firenote: Copy, Enhance & Differentiate Strategy

**Date:** March 11, 2026  
**Classification:** Internal — Strategic Product Planning  
**Analyst:** AI Research Division  
**Competitor:** Firenote EMR (firenote.health)

---

## Executive Summary

Firenote is a **hospice-first EMR** founded by clinicians (Lenny & Mari Jensen) who also run Keystone Health and Keystone Hospice. This "built by clinicians, for clinicians" approach has yielded impressive traction with **87% time savings** on charting vs competitors. Firenote represents a **direct competitive threat** to Hospici's target market (small-to-medium hospice agencies).

### Key Firenote Metrics
| Metric | Firenote Performance |
|--------|---------------------|
| Routine RN Visit Charting | **9 minutes** (vs 45 min industry avg) |
| Admission Charting | **50 minutes** |
| Recertification Charting | **40 minutes** |
| Time Savings Claimed | **80-87%** vs previous EMR |
| Pricing | **$75/month/user** (significantly below market) |
| User Rating | **5/5** (SoftwareAdvice) |

### Hospici's Position vs Firenote
| Dimension | Firenote | Hospici Current | Gap |
|-----------|----------|-----------------|-----|
| Charting Speed | 9 min routine visits | ❌ Not implemented | **Critical** |
| Documentation AI | RapidChart® (patent-pending) | ❌ Not implemented | **Critical** |
| Care Plan Integration | Unified in encounter | Schema only | **Major** |
| e-Prescribing | Built-in | ❌ Not implemented | **Critical** |
| 31-Point Billing Audit | Automated | ❌ Not implemented | **Major** |
| Pricing | $75/user/mo | N/A | Firenote advantage |
| Multi-Service (CareLines) | ✅ Live | ❌ Not implemented | **Major** |

**Strategic Imperative:** Firenote has achieved product-market fit with a focused, clinician-centric approach. Hospici must match Firenote's core capabilities while differentiating through technical architecture (TypeBox/FHIR), interoperability, and AI enhancement.

---

## 1. Firenote Feature Deep-Dive

### 1.1 RapidChart® Technology (Patent-Pending)

**What It Is:**  
RapidChart® is Firenote's signature feature — a structured narrative generation system that transforms minimal clinician input into complete, compliant clinical narratives without using generative AI or LLMs.

**How It Works (Reverse-Engineered):**

```
Clinician Input (structured selections)
    ↓
Informed Intelligence™ (rules engine applies context)
    ↓
RapidChart® (assembles narrative from templates + selections)
    ↓
Complete Clinical Note (editable, traceable, compliant)
```

**Key Capabilities:**
- **Template-Based Narrative Assembly:** Pre-built narrative fragments that combine based on clinician selections
- **Context-Aware:** Prior visit data auto-populates relevant sections
- **Hospice-Specific Logic:** Built-in understanding of hospice workflows (symptom management, decline trajectory, family dynamics)
- **Compliance-First:** Every output is traceable to explicit clinician input
- **No LLM Hallucination Risk:** Deterministic output, not probabilistic generation

**User Impact:**
- Routine RN visit: **9 minutes** (vs 45 min industry standard)
- Admission: **50 minutes** (vs 2+ hours typical)
- Recertification: **40 minutes**

**Firenote Testimonial:**  
> *"We save our clinicians 87% of the time on charting compared to Consolo... it's the best EMR I've worked with in 25 years."*

---

### 1.2 Informed Intelligence™

**What It Is:**  
Firenote's "clinician-directed documentation process" — a structured workflow engine that guides charting without AI generation.

**Key Principles:**
| Principle | Implementation |
|-----------|----------------|
| **No Generative AI** | Zero LLM usage; deterministic rule-based output |
| **Clinician-Directed** | Every output traced to explicit input |
| **Structured Input** | Forms, selections, checkboxes → not free text |
| **Context Application** | Rules engine applies hospice-specific context |
| **Reviewable Output** | Full edit capability before finalization |

**Workflow Steps:**
1. **Step 1:** Clinician makes structured selections (no passive generation)
2. **Step 2:** Informed Intelligence applies rules and context
3. **Step 3:** RapidChart® produces narrative from templates
4. **Step 4:** Clinician reviews, edits, finalizes

**Why This Matters:**  
Firenote explicitly differentiates from "AI scribe" competitors by avoiding:
- Hallucination risks
- Compliance ambiguity  
- "Black box" documentation
- Training data bias

---

### 1.3 Unified Care Plan

**What It Is:**  
Care plans exist *inside* the encounter documentation — not a separate module.

**Key Features:**
- **No Duplicate Charting:** Care plan updates happen during visit documentation
- **SMART Goal Builder:** Guided creation of Specific, Measurable, Achievable, Relevant, Time-bound goals
- **Frequency Management:** Simplified order frequency specification
- **e-Prescribing Integration:** Medications prescribed directly from care plan
- **IDG Alignment:** Goals structured to drive IDG meeting efficiency
- **Order Routing:** Verbal orders automatically route to physician inbox

**User Workflow:**
```
Visit Documentation
    ↓
Care Plan visible inline
    ↓
Update frequencies, goals, interventions
    ↓
e-Prescribe if needed
    ↓
Orders auto-route for signature
    ↓
Complete visit note with care plan context
```

---

### 1.4 CareLines™ Multi-Service Architecture

**What It Is:**  
A single patient record that spans multiple service lines (Hospice → Palliative Care → CCM) without duplicating data or breaking continuity.

**Core Concept:**  
> *"One patient. One chart. One care team."*

**Supported CareLines:**
| CareLine | Status | Key Workflows |
|----------|--------|---------------|
| **Hospice** | ✅ Live | Episodic, high-acuity, regulatory-heavy |
| **Palliative Care** | ✅ Live | Longitudinal, consultative, goals-of-care |
| **CCM (Chronic Care Management)** | 🔜 Coming Soon | Recurring, ongoing interactions |

**Technical Implementation:**
- Patient exists **once** in system (not duplicated per service)
- CareLine defines the charting experience (forms, workflows, billing)
- Transition between CareLines preserves full history
- Same documentation engine (Informed Intelligence + RapidChart®) across all lines

**Competitive Advantage:**  
Organizations can expand services without:
- New EMR implementations
- Data migrations
- Staff retraining
- Parallel charts

---

### 1.5 HOPE-Ready Workflows

**What It Is:**  
CMS HOPE assessment requirements fully integrated into clinical workflows.

**Features:**
- **Scheduling Integration:** Automatic HOPE visit scheduling (Admissions, HUVs, SFVs, Discharges)
- **Timeline Management:** Visual tracking of assessment windows
- **Deadline Alerts:** Proactive notifications before 7-day windows expire
- **Visit Type Guidance:** System prompts correct assessment type based on visit context
- **CMS Submission Ready:** Data structured for iQIES submission

---

### 1.6 No-Prep IDG Notes

**What It Is:**  
Interdisciplinary Group meeting documentation without pre-writing or preparation.

**Key Capabilities:**
- Real-time collaborative documentation during IDG meeting
- Pre-populated patient data from recent visits
- Structured attendance tracking (RN, MD, SW required)
- Care plan review integration
- Automated compliance checking (15-day rule)

---

### 1.7 Operations & Billing Suite

#### 31-Point Internal Billing Audit
**What It Is:**  
Automatic pre-submission audit of every claim.

**Process:**
```
Claim Generated
    ↓
31-Point Audit (automated)
    ↓
Issues Flagged → Back to Clinician
    ↓
Clean Claim → Clearinghouse
```

**Result:** "Maximize accounts receivable while maintaining compliance"

#### Centralized Intake
- Single location for patient info, documentation, workflow steps
- Reduces handoffs
- Prevents missing admission steps

#### Referral Management (Lightweight CRM)
- Track referrals from marketing
- Monitor referral activity
- Interaction history

#### Scheduling with Accountability
- Frequency-based visit scheduling
- Compliance alerts (visits not scheduled per orders)
- Completion tracking

#### Alert Dashboards
- Catch claim-blocking issues early
- Real-time compliance visibility
- Month-end billing crunch prevention

---

### 1.8 Technical Specifications

| Specification | Firenote |
|--------------|----------|
| **Platform** | Cloud-based |
| **Mobile App** | ❌ No (not yet) |
| **API** | ❌ No public API |
| **e-Prescribing** | ✅ Integrated |
| **Secure Fax** | ✅ HIPAA-compliant e-fax |
| **Document Management** | ✅ Integrated |
| **Pricing** | $75/user/month |

---

## 2. Hospici vs Firenote: Detailed Gap Analysis

### 2.1 Documentation & Charting

| Feature | Firenote | Hospici Status | Gap Severity |
|---------|----------|----------------|--------------|
| **RapidChart® equivalent** | ✅ Patent-pending | ❌ Not started | 🔴 **CRITICAL** |
| **9-minute routine visits** | ✅ Delivered | ❌ Not possible | 🔴 **CRITICAL** |
| **Structured narrative generation** | ✅ Informed Intelligence | ❌ Not started | 🔴 **CRITICAL** |
| **Template-based documentation** | ✅ Comprehensive | 🟡 Schemas only | 🟡 **HIGH** |
| **Context-aware pre-population** | ✅ Live | ❌ Not started | 🟡 **HIGH** |
| **Care plan in encounter** | ✅ Unified | ❌ Separate module | 🟡 **HIGH** |

### 2.2 Clinical Decision Support

| Feature | Firenote | Hospici Status | Gap Severity |
|---------|----------|----------------|--------------|
| **SMART Goal Builder** | ✅ Integrated | ❌ Not started | 🟡 **HIGH** |
| **Hospice-specific logic** | ✅ Built-in | 🟡 Partial (schemas) | 🟡 **HIGH** |
| **Frequency management** | ✅ Simplified | ❌ Not started | 🟡 **HIGH** |
| **Decline trajectory tracking** | ✅ Implicit | ❌ Not started | 🟢 **MEDIUM** |

### 2.3 Medication Management

| Feature | Firenote | Hospici Status | Gap Severity |
|---------|----------|----------------|--------------|
| **e-Prescribing** | ✅ Built-in | ❌ Not started | 🔴 **CRITICAL** |
| **EPCS (Controlled Substances)** | ✅ Supported | ❌ Not started | 🔴 **CRITICAL** |
| **Care plan integrated** | ✅ Seamless | ❌ Not started | 🟡 **HIGH** |
| **Order routing** | ✅ Auto to physician | ❌ Not started | 🟡 **HIGH** |
| **Pharmacy integration** | ✅ Live | ❌ Not started | 🟡 **HIGH** |

### 2.4 IDG & Care Planning

| Feature | Firenote | Hospici Status | Gap Severity |
|---------|----------|----------------|--------------|
| **No-Prep IDG Notes** | ✅ Real-time collab | ❌ Not started | 🟡 **HIGH** |
| **15-day compliance hard block** | 🟡 Alerts (soft) | 🟡 Schema only | 🟡 **HIGH** |
| **IDG attendance tracking** | ✅ Built-in | ❌ Not started | 🟡 **HIGH** |
| **Care plan → IDG linkage** | ✅ Direct | ❌ Not started | 🟡 **HIGH** |

### 2.5 HOPE / Quality Reporting

| Feature | Firenote | Hospici Status | Gap Severity |
|---------|----------|----------------|--------------|
| **HOPE scheduling** | ✅ Integrated | ❌ Not started | 🔴 **CRITICAL** |
| **HOPE workflows** | ✅ Nursing-friendly | ✅ Schemas exist | 🟡 **HIGH** |
| **7-day window alerts** | ✅ Proactive | ❌ Not started | 🟡 **HIGH** |
| **iQIES submission** | ✅ Ready | ❌ Not started | 🔴 **CRITICAL** |
| **Quality measure calc** | 🟡 Basic | ❌ Not started | 🟡 **HIGH** |

### 2.6 Multi-Service (CareLines)

| Feature | Firenote | Hospici Status | Gap Severity |
|---------|----------|----------------|--------------|
| **Hospice CareLine** | ✅ Live | 🟡 Partial | 🟡 **HIGH** |
| **Palliative CareLine** | ✅ Live | ❌ Not started | 🔴 **CRITICAL** |
| **CCM CareLine** | 🔜 Coming | ❌ Not started | 🟢 **MEDIUM** |
| **Service transitions** | ✅ Seamless | ❌ Not started | 🟡 **HIGH** |
| **Single patient record** | ✅ Core architecture | ✅ Design compatible | ✅ **ALIGNMENT** |

### 2.7 Billing & Revenue Cycle

| Feature | Firenote | Hospici Status | Gap Severity |
|---------|----------|----------------|--------------|
| **31-point billing audit** | ✅ Automated | ❌ Not started | 🔴 **CRITICAL** |
| **Pre-submission scrubbing** | ✅ 31-point | ❌ Not started | 🔴 **CRITICAL** |
| **Clean claim rate focus** | ✅ Core value | ❌ Not started | 🟡 **HIGH** |
| **Claim blocking alerts** | ✅ Real-time | ❌ Not started | 🟡 **HIGH** |

### 2.8 Operations & Workflow

| Feature | Firenote | Hospici Status | Gap Severity |
|---------|----------|----------------|--------------|
| **Centralized intake** | ✅ Single location | ❌ Not started | 🟡 **HIGH** |
| **Referral CRM** | ✅ Lightweight | ❌ Not started | 🟢 **MEDIUM** |
| **Compliance dashboards** | ✅ Live | ❌ Not started | 🟡 **HIGH** |
| **Frequency-based scheduling** | ✅ With alerts | ❌ Not started | 🟡 **HIGH** |

### 2.9 Technical Differentiation

| Capability | Firenote | Hospici | Advantage |
|------------|----------|---------|-----------|
| **Architecture** | Monolithic (presumed) | Microservices-ready | Hospici |
| **FHIR Support** | ❌ Unknown | ✅ R4/R6 planned | Hospici |
| **API Availability** | ❌ None | ✅ Can build | Hospici |
| **Schema-First Design** | 🟡 Unknown | ✅ TypeBox | Hospici |
| **Mobile Strategy** | ❌ None | 🟡 Can build | Hospici |
| **TypeScript Coverage** | Unknown | ✅ Strict | Hospici |
| **AI/LLM Ready** | ❌ Explicitly avoids | ✅ Can integrate | Hospici |

---

## 3. Strategic Recommendations: Copy, Enhance, Differentiate

### 3.1 COPY: Must-Have Features to Match Firenote

These are table stakes for hospice EMR competitiveness.

#### Priority 1: RapidChart® Equivalent ("Hospici QuickChart")

**What to Copy:**
- Structured selection → narrative generation workflow
- Template-based assembly (no LLM for core feature)
- Context-aware pre-population from prior visits
- Hospice-specific narrative templates

**How to Enhance:**
1. **Hybrid Approach:** Rule-based foundation + LLM refinement option
   - Core narrative: Template-based (deterministic, compliant)
   - Enhancement layer: LLM for phrasing variety, reading level
   - Clinician toggle: "Use AI enhancement" (default off)

2. **FHIR-Integrated Context:**
   - Pull relevant observations from FHIR resources
   - Trend analysis (vitals, symptoms over time)
   - Auto-populate from wearable/device data

3. **Voice-to-Structured Input:**
   - Speech recognition → structured selections (not free text)
   - "Pain level 5" → selects "Moderate pain (5/10)"
   - Maintains traceability while enabling voice input

**Implementation Estimate:** 6-8 weeks

**Schema Requirements:**
```typescript
// QuickChart template schema
const QuickChartTemplateSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  visitType: Type.Enum({ routine: "routine", admission: "admission", recert: "recert" }),
  narrativeFragments: Type.Array(Type.Object({
    trigger: Type.String(), // e.g., "pain_level > 0"
    template: Type.String(), // e.g., "Patient reports {pain_description}."
    variables: Type.Array(Type.String()),
  })),
  hospiceSpecific: Type.Boolean(),
  version: Type.Number(),
});
```

---

#### Priority 2: Unified Care Plan Encounter

**What to Copy:**
- Care plan visible inline during visit documentation
- Update frequencies/goals/interventions in context
- e-Prescribe directly from care plan
- Order routing to physician inbox

**How to Enhance:**
1. **Real-Time IDG Sync:**
   - Care plan changes immediately visible to IDG team
   - Conflict detection (two clinicians editing simultaneously)
   - IDG preview mode before meetings

2. **Smart Frequency Suggestions:**
   - ML-based recommended visit frequencies based on diagnosis
   - Risk-adjusted (high-symptom patients → more frequent)
   - Compliance check: "Medicare allows up to X visits for this level"

3. **Goal Attainment Tracking:**
   - Visual goal progress over time
   - Automatic goal revision suggestions
   - Family/stakeholder goal alignment scoring

**Implementation Estimate:** 4-6 weeks

---

#### Priority 3: 31-Point Billing Audit Engine

**What to Copy:**
- Pre-submission claim validation
- Issue flagging with clinician routing
- Clean claim focus

**How to Enhance:**
1. **Expand to 50-Point Audit:**
   - Firenote: 31 points
   - Hospici: 50+ points (more comprehensive)
   - Include predictive denial risk scoring

2. **Real-Time Audit (Not Just Pre-Submission):**
   - Audit during documentation (catch issues immediately)
   - "This note is missing required elements for billing"
   - Severity levels: Blocking vs Warning vs Info

3. **Audit Categories:**

| Category | Points | Firenote | Hospici Target |
|----------|--------|----------|----------------|
| Clinical Completeness | 15 | ✅ | ✅ Expand |
| Signature/Auth | 8 | ✅ | ✅ Match |
| Coding Accuracy | 5 | ✅ | ✅ + AI suggest |
| Documentation Quality | 3 | ✅ | ✅ + NLP score |
| Compliance Timing | 5 | ? | ✅ Add |
| **Total** | **36** | **31** | **50** |

**Implementation Estimate:** 3-4 weeks

---

#### Priority 4: HOPE Workflow Integration

**What to Copy:**
- HOPE visit scheduling automation
- 7-day window tracking
- Assessment type guidance

**How to Enhance:**
1. **Predictive HOPE Scheduling:**
   - Auto-schedule HOPE-UV based on visit patterns
   - Smart rescheduling when visits are missed
   - Load balancing: distribute HOPE assessments among team

2. **HOPE Documentation Assistant:**
   - Section-by-section guided completion
   - Real-time completeness score
   - iQIES preview before submission

3. **Quality Measure Dashboard:**
   - Real-time NQF #3235 tracking
   - Benchmark vs national averages
   - Targeted improvement suggestions

**Implementation Estimate:** 4-5 weeks

---

### 3.2 ENHANCE: Differentiated Features Beyond Firenote

#### Enhancement 1: AI-Powered Layer (Optional Enhancement to QuickChart)

**Differentiation:** Firenote explicitly avoids AI. Hospici can offer optional AI enhancement.

**Implementation:**
```
Base Layer: QuickChart (deterministic, Firenote-like)
    ↓
Enhancement Toggle: "AI Polish" (clinician-controlled)
    ↓
LLM rephrases for:
- Reading level optimization
- Professional tone adjustment
- Consistency with prior notes
- Overt clinical concern flagging
```

**Safety Guardrails:**
- Original note preserved
- Changes highlighted
- One-click revert
- Audit trail of AI modifications

---

#### Enhancement 2: FHIR-Native Interoperability

**Differentiation:** Firenote has no API. Hospici can be integration-first.

**Features:**
- SMART on FHIR app support
- Bulk FHIR export for analytics
- Real-time sync with hospital EMRs
- Patient access API (21st Century Cures compliant)

---

#### Enhancement 3: Mobile-First Field Experience

**Differentiation:** Firenote has no mobile app. Hospici can lead here.

**Features:**
- Native iOS/Android apps
- Offline-first architecture
- Voice-dominant interface for field
- GPS visit verification
- Photo documentation

---

#### Enhancement 4: Advanced Analytics & Predictive

**Differentiation:** Firenote focuses on documentation efficiency. Hospici can add intelligence.

**Features:**
- Length of stay prediction
- Readmission risk scoring
- Survivor trajectory modeling
- Resource utilization optimization

---

### 3.3 DIFFERENTIATE: Unique Hospici Capabilities

#### Differentiator 1: Schema-First Architecture

**Marketing Message:**  
> "Built on TypeBox — Every data element validated, every integration reliable"

**Technical Advantage:**
- TypeBox schemas ensure data integrity
- Automatic OpenAPI generation
- Frontend/backend type safety
- Future-proof FHIR compatibility

---

#### Differentiator 2: CareLine Expansion (Beyond Firenote)

Firenote: Hospice, Palliative, CCM (coming)

Hospici Expansion Roadmap:
1. Hospice (match Firenote)
2. Palliative Care (match Firenote)
3. **Home Health** (beyond Firenote)
4. **PediHospice** (beyond Firenote)
5. **Geriatric Care Management** (beyond Firenote)

---

#### Differentiator 3: Open Ecosystem

Firenote: Closed system, no API

Hospici: Open API + App Marketplace
- Third-party integrations
- Custom workflow builder
- Data warehouse connectors

---

## 4. Implementation Roadmap: Firenote Competitive Response

### Phase 1: Firenote Parity (Months 1-3)

**Goal:** Match core Firenote capabilities

| Week | Feature | Deliverable |
|------|---------|-------------|
| 1-2 | QuickChart MVP | Basic template-based narrative for routine visits |
| 3-4 | Unified Care Plan | Care plan inline in encounter |
| 5-6 | e-Prescribing Integration | DoseSpot or NewCrop integration |
| 7-8 | Billing Audit Engine | 31-point audit (match Firenote) |
| 9-10 | HOPE Workflows | Scheduling + deadline tracking |
| 11-12 | Polish & Integration | End-to-end testing, optimization |

**Success Metrics:**
- Routine visit charting: **< 15 minutes** (Firenote: 9 min)
- Billing audit catch rate: **> 95%** of issues
- User satisfaction: **> 4.5/5**

---

### Phase 2: CareLines & Multi-Service (Months 3-5)

**Goal:** Match Firenote CareLines + add Home Health

| Week | Feature | Deliverable |
|------|---------|-------------|
| 13-14 | CareLine Architecture | Service line abstraction |
| 15-16 | Palliative CareLine | Full palliative workflows |
| 17-18 | Home Health CareLine | Beyond Firenote capability |
| 19-20 | Service Transitions | Seamless patient transfers |

---

### Phase 3: Differentiation (Months 5-8)

**Goal:** Exceed Firenote capabilities

| Week | Feature | Differentiator |
|------|---------|----------------|
| 21-24 | Mobile Native Apps | Firenote has no mobile |
| 25-28 | AI Enhancement Layer | Optional LLM polish |
| 29-32 | Predictive Analytics | LOS, risk scoring |
| 33-36 | Open API & Marketplace | Firenote has no API |

---

## 5. Pricing Strategy vs Firenote

### Firenote Pricing
- **$75/user/month** (base)
- Custom plans for larger agencies

### Hospici Recommended Pricing

| Tier | Price | vs Firenote | Includes |
|------|-------|-------------|----------|
| **Essential** | $85/user/mo | +$10 | QuickChart, Unified Care Plan, eRx |
| **Professional** | $125/user/mo | +$50 | + Mobile Apps, Advanced Reporting |
| **Enterprise** | $175/user/mo | +$100 | + API Access, Custom Integrations, AI Layer |

**Justification for Premium:**
- Mobile apps (Firenote: none)
- API access (Firenote: none)
- AI enhancement option (Firenote: explicitly avoids)
- FHIR interoperability (Firenote: unknown/limited)

---

## 6. Marketing Messaging: Hospici vs Firenote

### Head-to-Head Comparison Table

| Capability | Firenote | Hospici |
|------------|----------|---------|
| Charting Speed | ✅ 9 min | ✅ < 15 min |
| e-Prescribing | ✅ Yes | ✅ Yes |
| HOPE Workflows | ✅ Yes | ✅ Yes |
| **Mobile Apps** | ❌ No | ✅ Yes |
| **API Access** | ❌ No | ✅ Yes |
| **FHIR Support** | ❌ No | ✅ R4/R6 |
| **AI Enhancement** | ❌ Avoids | ✅ Optional |

### Key Messages

**Against Firenote:**
1. **"Chart anywhere with native mobile apps — Firenote keeps you tied to a desktop"**
2. **"Connect to any system with our open API — Firenote locks you in"**
3. **"Optional AI enhancement when you want it — Firenote forces one-size-fits-all"**

**Value Proposition:**
> *"Hospici delivers everything you love about Firenote's speed and simplicity, plus the modern architecture to connect, extend, and grow."*

---

## 7. Risk Assessment

### Risks of Firenote Competition

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Firenote adds mobile | Medium | High | Accelerate mobile development |
| Firenote opens API | Low | Medium | Maintain FHIR differentiation |
| Firenote adds AI | Medium | High | Emphasize hybrid approach advantage |
| Firenote lowers price | Low | Medium | Focus on value, not price |
| Firenote gets acquired | Medium | High | Target dissatisfied users during transition |

---

## 8. Conclusion & Next Steps

### Summary

Firenote represents the **new standard** in hospice EMR user experience with:
- Unmatched documentation speed (9-min routine visits)
- Clinician-first design philosophy
- Aggressive pricing ($75/user)
- Strong customer satisfaction (5/5 ratings)

**Hospici must match Firenote's core capabilities in 90 days** while differentiating through:
1. Mobile-first architecture
2. Open API/FHIR interoperability
3. Optional AI enhancement layer
4. Multi-service expansion (Home Health beyond Firenote)

### Immediate Actions (This Week)

1. **Prioritize QuickChart Development**
   - Assign 2 senior developers
   - Create TypeBox schemas for narrative templates
   - Build proof-of-concept in 1 week

2. **Evaluate e-Prescribing Partners**
   - DoseSpot vs NewCrop vs Surescripts direct
   - Decision by end of week

3. **Define 31-Point Audit Rules**
   - Work with billing expert
   - Document all validation rules

4. **Begin CareLine Architecture Design**
   - Extend existing patient schema
   - Design service line abstraction

### Success Metrics (90 Days)

| Metric | Target | Firenote Benchmark |
|--------|--------|-------------------|
| Routine visit charting time | < 15 min | 9 min |
| User satisfaction score | > 4.5/5 | 5/5 |
| Feature parity checklist | 80%+ | 100% |
| Demo win rate vs Firenote | > 50% | N/A |

---

**Report Prepared:** March 11, 2026  
**Next Review:** 30 days (post-QuickChart POC)
