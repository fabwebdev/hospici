# Regulatory Digest

Tracks active regulatory requirements from CMS, OIG, OHA, and other authorities
affecting Hospici's codebase. Updated manually or via `/review --digest-update`.

---

## Digest Structure

Each entry follows this format:

```yaml
- id: "<authority>-<year>-<sequence>"    # e.g. cms-2025-001
  authority: CMS | OIG | OHA | NHPCO | ACHC | TJC | MAC-CGS | MAC-NGS | MAC-WPS
  document_type: final-rule | proposed-rule | mln-matters | transmittal | alert | guidance
  reference: "42 CFR Part 418" | "MLN MM13456" | "OAR 410-xxx" | etc.
  title: "Short title of the regulatory change"
  effective_date: "2025-01-01"
  digest_added: "2025-01-10"
  status: active | action-required | monitoring | superseded
  summary: |
    Plain-English summary of what changed and why it matters for Hospici.
  code_impact: |
    Specific areas of the codebase that may need changes.
    List affected modules, routes, or data fields.
  compliance_checklist:
    - "Verify HCPCS code validation in claims submission"
    - "Update benefit period calculation to reflect new election rules"
  links:
    - "https://www.cms.gov/..."
    - "https://www.federalregister.gov/..."
  resolved_date: null       # Set when codebase is confirmed compliant
  resolved_notes: null
```

---

## Active Digest Entries

### CMS — 42 CFR Part 418 (Hospice CoPs)

```yaml
- id: cms-2024-001
  authority: CMS
  document_type: final-rule
  reference: "42 CFR Part 418 — Hospice Conditions of Participation"
  title: "Core hospice CoP requirements"
  effective_date: "1983-12-16"
  digest_added: "2025-01-01"
  status: active
  summary: |
    Foundational federal requirements for Medicare-certified hospice providers.
    Sets standards for clinical records, IDG composition, plan of care,
    nursing services, physician services, and patient rights.
  code_impact: |
    - Clinical records module: all required fields per §418.104
    - IDG meeting documentation: §418.56
    - Plan of care: must include all required elements §418.56(c)
    - Nursing assessment: §418.110
    - Volunteer services tracking: §418.78
  compliance_checklist:
    - "Clinical record fields match §418.104 required elements"
    - "IDG composition tracked (RN, MD, social worker, chaplain)"
    - "Care plan includes patient/family goals"
    - "Volunteer hours tracked as % of total patient care hours"
  links:
    - "https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-G/part-418"
  resolved_date: null
  resolved_notes: null

- id: cms-2024-002
  authority: CMS
  document_type: final-rule
  reference: "CMS HOPE (Hospice Outcomes and Patient Evaluation)"
  title: "HOPE data collection tool replacing HIS"
  effective_date: "2025-10-01"
  digest_added: "2025-01-01"
  status: action-required
  summary: |
    CMS is replacing the Hospice Item Set (HIS) with the new HOPE assessment tool
    effective October 1, 2025. HOPE expands data collection across the care continuum
    with new admission, update, and discharge assessments. Failure to comply affects
    the Hospice Quality Reporting Program (HQRP) and payment.
  code_impact: |
    - Replace HIS data model with HOPE assessment schema
    - New assessment types: HOPE-A (admission), HOPE-U (update), HOPE-D (discharge)
    - New data elements: functional status, symptom burden, medication management
    - XML/HL7 submission format changes
    - Quality measure calculation updates
  compliance_checklist:
    - "HOPE assessment schema implemented in DB"
    - "HOPE-A admission assessment form complete"
    - "HOPE-U update assessment triggered at appropriate intervals"
    - "HOPE-D discharge assessment form complete"
    - "iQIES submission format updated for HOPE"
    - "Quality measure calculations updated"
  links:
    - "https://www.cms.gov/medicare/quality/hospice/hope"
    - "https://www.cms.gov/files/document/hope-assessment-instrument.pdf"
  resolved_date: null
  resolved_notes: null

- id: cms-2024-003
  authority: CMS
  document_type: transmittal
  reference: "Medicare Claims Processing Manual Ch. 11 — Hospice"
  title: "Hospice billing and claims processing requirements"
  effective_date: "2024-01-01"
  digest_added: "2025-01-01"
  status: active
  summary: |
    Medicare claims processing rules for hospice: revenue codes, HCPCS codes,
    condition codes, occurrence codes, value codes, and NOE/NOR timing requirements.
    GIP (General Inpatient) and Respite claims have specific billing rules.
  code_impact: |
    - Claims module: validate all required revenue codes per level of care
    - NOE (Notice of Election): must be filed within 5 calendar days
    - NOR (Notice of Revocation): same-day filing requirement
    - HCPCS code validation per level of care
    - Occurrence code 27 (date of election) required
    - Value code 61 (NPI of attending physician) required
  compliance_checklist:
    - "Revenue code validation per level of care (0651/0652/0655/0656)"
    - "NOE filing deadline tracking (5-day rule)"
    - "NOR same-day processing"
    - "Attending physician NPI on all claims"
    - "Occurrence code 27 populated"
    - "GIP authorization tracking"
  links:
    - "https://www.cms.gov/regulations-guidance/guidance/manuals/downloads/clm104c11.pdf"
  resolved_date: null
  resolved_notes: null
```

### CMS — HQRP / Quality Reporting

```yaml
- id: cms-2025-001
  authority: CMS
  document_type: final-rule
  reference: "FY2025 Hospice Payment Rule — CMS-1810-F"
  title: "FY2025 hospice payment rate update and HQRP changes"
  effective_date: "2024-10-01"
  digest_added: "2025-01-01"
  status: active
  summary: |
    FY2025 final rule updates hospice payment rates, cap amounts, and HQRP
    quality measure requirements. Introduces new measures around pain assessment
    and advance care planning documentation.
  code_impact: |
    - Update aggregate cap calculation for FY2025
    - New HQRP measures may require new data collection fields
    - Advance care planning documentation field required
    - Pain reassessment timing requirements updated
  compliance_checklist:
    - "FY2025 aggregate cap amount updated"
    - "Advance care planning documentation field present"
    - "Pain reassessment within 24 hours of initial assessment tracked"
  links:
    - "https://www.federalregister.gov/documents/2024/08/01/2024-16399"
  resolved_date: null
  resolved_notes: null
```

### OIG — Fraud & Abuse

```yaml
- id: oig-2024-001
  authority: OIG
  document_type: alert
  reference: "OIG Work Plan — Hospice"
  title: "OIG active hospice audit focus areas"
  effective_date: "2024-01-01"
  digest_added: "2025-01-01"
  status: monitoring
  summary: |
    OIG actively auditing: (1) hospice patients in assisted living facilities,
    (2) long length-of-stay patients, (3) live discharges, (4) GIP appropriateness,
    (5) CHHA duplicate billing. These are high-risk areas for documentation gaps.
  code_impact: |
    - Flag patients in ALF/SNF settings for enhanced documentation prompts
    - Track and alert on patients approaching 6-month recertification with no decline
    - GIP authorization and clinical justification documentation
    - Prevent duplicate billing with CHHA claims
  compliance_checklist:
    - "ALF/SNF patient setting tracked"
    - "Recertification decline documentation prompted"
    - "GIP clinical justification required field"
    - "Duplicate CHHA claim detection logic"
  links:
    - "https://oig.hhs.gov/reports-and-publications/workplan/summary/wp-summary-0000679.asp"
  resolved_date: null
  resolved_notes: null
```

### Oregon Health Authority

```yaml
- id: oha-2024-001
  authority: OHA
  document_type: guidance
  reference: "OAR 410-120 — Oregon Medicaid Hospice"
  title: "Oregon Medicaid hospice billing requirements"
  effective_date: "2024-01-01"
  digest_added: "2025-01-01"
  status: active
  summary: |
    Oregon Medicaid (OHP) hospice billing follows Medicare rules with state-specific
    additions: prior authorization for GIP beyond 5 days, Oregon DMAP provider enrollment
    required, and Oregon-specific EOB codes.
  code_impact: |
    - Dual Medicare/Medicaid billing logic
    - Oregon prior auth tracking for extended GIP
    - DMAP provider enrollment status check
  compliance_checklist:
    - "OHP dual-eligible billing logic implemented"
    - "GIP prior auth tracking beyond day 5"
    - "DMAP enrollment status validation"
  links:
    - "https://www.oregon.gov/oha/HSD/OHP/Pages/Hospice.aspx"
  resolved_date: null
  resolved_notes: null
```

---

## How to Update the Digest

When a new regulatory change is identified:

1. Add a new entry following the schema above
2. Set `status: action-required` if code changes are needed
3. Set `status: monitoring` for proposed rules or items being watched
4. Set `status: active` for enacted rules with no immediate code impact
5. When codebase is confirmed compliant, set `resolved_date` and `resolved_notes`

### Authorities to Monitor

| Authority | What to Watch | URL |
|---|---|---|
| CMS | Final rules, transmittals, MLN Matters | cms.gov/medicare/quality/hospice |
| OIG | Work plan updates, fraud alerts | oig.hhs.gov/workplan |
| Federal Register | Proposed + final rules (42 CFR Part 418) | federalregister.gov |
| OHA | Oregon Medicaid policy updates | oregon.gov/oha/HSD/OHP |
| NHPCO | Clinical practice guidelines | nhpco.org |
| CGS (MAC) | Jurisdiction 15 hospice LCDs | cgsmedicare.com |
| Noridian (MAC) | Jurisdiction F/E hospice LCDs | noridianmedicare.com |
| WPS (MAC) | Jurisdiction 5/8 hospice LCDs | wpsgha.com |

### `/review --digest-update` workflow

When user runs this command:
1. Display current digest entries with their `digest_added` date
2. Ask: "Would you like to add a new regulatory entry? Paste the reference details."
3. Guide user through filling in the schema fields
4. Append to this file
5. If `status: action-required`, immediately run a targeted scan for the affected code areas
