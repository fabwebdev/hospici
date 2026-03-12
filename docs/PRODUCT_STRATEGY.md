# Hospici — Product Strategy

> Competitive positioning, pricing, and CareLine expansion roadmap.
> Load this document only when making product/strategy decisions, not during implementation.

---

## Competitive Position vs Firenote

### Our Moats (Firenote has none of these)

| Differentiator | Hospici | Firenote | Notes |
|----------------|---------|----------|-------|
| Mobile / offline | T5 roadmap | ❌ None | Primary purchase driver for field clinicians |
| FHIR / open API | T3-6, T4-1/2 | ❌ None | Hospital EMR integration |
| Optional AI enhancement | T2-7 Layer 2 | ❌ Explicitly avoids | Firenote: "RapidChart is not AI" |
| EDI round-trip (837i + ERA 835) | T3-7 | ❓ Unclear | Full billing automation |

### What Firenote Does Well (copy + improve)

| Feature | Firenote | Hospici approach |
|---------|----------|-----------------|
| RapidChart® visit documentation | Template-based structured input | VantageChart™ Layer 1 (deterministic) + optional LLM Layer 2 |
| No-Prep IDG | Live attendee documentation | `attendee_notes` JSONB, assembled on meeting close (T2-4) |
| Compliance alert dashboard | Real-time alerts | 8-type alert system, Valkey-cached, Socket.IO push (T2-8) |
| Note review system | Supervisor review queue | Review queue + Socket.IO revision requests + full audit trail (T2-9) |
| Paperless order routing | Physician order inbox | 72h CMS-compliant verbal order workflow + e-sig (T3-9) |
| ADR audit export | Structured export | 7-category tamper-evident export, async job, 30s SLA (T3-10) |
| QAPI management | Quality program tracking | Full QAPI event + action item + overdue tracking (T3-11) |
| 31-point claim audit | Pre-submission validation | 10-category audit, BLOCK + WARN severities, supervisor override (T3-12) |

### Key Marketing Messages

1. **"Chart in the field"** — Native mobile apps with offline sync. Firenote keeps you at a desk.
2. **"Connect to any hospital EMR"** — Open FHIR API. Firenote locks you in.
3. **"VantageChart™: AI enhancement when you want it"** — Firenote forces one approach for every clinician.

---

## Pricing Strategy

| Tier | Price | vs Firenote ($75/user/mo) | Includes |
|------|-------|--------------------------|----------|
| **Essential** | $85/user/mo | +$10 | VantageChart Layer 1, Unified Care Plan, Alert Dashboard |
| **Professional** | $125/user/mo | +$50 | + Mobile Apps, VantageChart Layer 2 (AI), Advanced Reporting |
| **Enterprise** | $175/user/mo | +$100 | + API Access, FHIR R4, Custom Integrations, Predictive Analytics |

Premium justified by: mobile apps (Firenote: none), FHIR/open API (Firenote: none), optional AI enhancement (Firenote: explicitly avoids), EDI round-trip (Firenote: unclear).

---

## CareLine Expansion Roadmap

| CareLine | Status | Firenote | Notes |
|----------|--------|----------|-------|
| Hospice | 🔄 Active | ✅ Live | Core product |
| Palliative Care | 📋 Planned (T5+) | ✅ Live | `care_model = 'PALLIATIVE'` already in schema |
| CCM (Chronic Care Management) | 📋 Planned (T5+) | 🔜 Coming | `care_model = 'CCM'` already in schema |
| **Home Health** | 🔭 Future | ❌ Not planned | Beyond Firenote — significant differentiator |
| **PediHospice** | 🔭 Future | ❌ Not planned | Specialty market |
| **Geriatric Care Management** | 🔭 Future | ❌ Not planned | Adjacent market |

`care_model` enum on `patients` table enables one patient, one chart across service lines — zero schema migration cost to add Palliative or CCM.

---

## VantageChart™ — Product Positioning

**Analogous to:** Firenote's RapidChart®

**Key difference:** RapidChart is 100% template-based (Firenote explicitly avoids AI). VantageChart adds an optional LLM layer that clinicians can toggle on/off.

**CMS compliance:** Clinician is always the author. Layer 1 (deterministic) assembles from explicit structured input. Layer 2 (LLM) polishes prose only — original always preserved, changes highlighted, one-click revert. PHI is stripped before any LLM call.

**Goal:** 70%+ reduction in routine RN visit documentation time vs legacy EMRs.
