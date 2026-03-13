# Incident Response Procedures — Hospici EHR

> **Classification:** Internal — Confidential
> **Owner:** Compliance Officer
> **Regulation:** HIPAA Breach Notification Rule (45 CFR §§ 164.400–414)
> **Last Updated:** 2026-03-13

---

## 1. Breach Classification

| Severity | Description | Examples |
|----------|-------------|---------|
| **P1 — Critical** | Confirmed PHI exposure to unauthorized party | Database dump, unauthorized API access, stolen credentials |
| **P2 — High** | Suspected PHI exposure, under investigation | Anomalous query patterns, failed penetration, lost device |
| **P3 — Medium** | Security control failure without confirmed PHI exposure | MFA bypass attempt, expired BAA, key not rotated |
| **P4 — Low** | Policy violation, no PHI risk | Misconfigured rate limit, outdated dependency |

---

## 2. Contact Chain

| Role | Responsibility | Contact |
|------|---------------|---------|
| Security Lead | Technical containment, key rotation, forensics | [Designated security lead] |
| Compliance Officer | HIPAA notification, CMS reporting, legal coordination | [Compliance officer] |
| Legal Counsel | Breach notification letters, attorney-client privilege | [Healthcare compliance attorney — to be engaged before Phase 2] |
| CEO / Executive | External communications, media, regulatory escalation | [Executive] |

---

## 3. Incident Response Timeline (HIPAA Breach Notification Rule)

```
Day 0 — Discovery
  Security Lead declares incident (P1 or P2)
  Incident log opened

Day 1–3 — Containment
  Isolate affected systems
  Rotate all potentially compromised credentials (see key-rotation.md)
  Preserve audit logs (audit_logs table is append-only; do not modify)
  Engage Legal Counsel

Day 10 — Internal notification
  Compliance Officer notifies CEO
  Preliminary breach scope determination

Day 30 — Individual notification (45 CFR §164.404)
  Written notice to each affected individual
  Content: nature of breach, PHI involved, steps to protect themselves, contact info

Day 60 — CMS / HHS Notification deadline (45 CFR §164.408)
  Submit breach report to HHS Office for Civil Rights (OCR)
  If >500 individuals: notify prominent media outlets in affected state(s)
  Submit to: https://ocrportal.hhs.gov/ocr/breach/

Day 60 — Documentation complete
  Full incident report with root cause, remediation, and preventive measures
  Retain documentation for 6 years (HIPAA §164.530(j))
```

---

## 4. Credential Compromise Procedure

Triggered when: stolen credentials, compromised API key, unauthorized access confirmed.

1. **Immediate (< 1 hour):**
   - Rotate `PHI_ENCRYPTION_KEY` if database may be accessible
   - Rotate `BETTER_AUTH_SECRET` (invalidates all sessions)
   - Revoke clearinghouse API credentials
   - Block IP ranges if known (firewall / WAF)

2. **Within 4 hours:**
   - Review `audit_logs` for access patterns (query `action = 'break_glass'` and any off-hours access)
   - Enumerate affected patient records
   - Engage Legal Counsel

3. **Within 24 hours:**
   - Generate preliminary breach scope report
   - Notify executive team

4. **Day 30:** Individual notification letters
5. **Day 60:** OCR report

---

## 5. CMS Notification — HOPE / iQIES Impact

If the breach affects HOPE assessment data or iQIES submissions:
- Notify CMS Quality Reporting Center in addition to OCR
- CMS contact: iQIES Help Desk (1-800-339-9313)
- Review pending HOPE submissions for data integrity; resubmit if tampered

---

## 6. Containment Checklist

- [ ] Incident log created with timestamp, reporter, and initial scope
- [ ] Affected systems isolated (network segmentation or shutdown)
- [ ] Audit logs preserved and exported to offline storage
- [ ] Credentials rotated (see `key-rotation.md`)
- [ ] Legal Counsel engaged
- [ ] CEO/Executive notified
- [ ] PHI scope enumerated (which patients, which fields)
- [ ] Preliminary breach classification (P1/P2/P3/P4)
- [ ] HHS/OCR report prepared (if P1)
- [ ] Individual notification letters drafted (if PHI exposed)
- [ ] Preventive remediation identified and scheduled

---

_Incident Response — Hospici EHR — HIPAA 45 CFR §§ 164.400–414_
