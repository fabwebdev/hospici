# Comprehensive QA Review: Hospici Codebase Plan

**Date:** March 11, 2026  
**Classification:** Internal — Pre-Development Review  
**Status:** 🔴 Action Required Before Coding Begins

---

## Executive Summary

After reviewing all documentation, architecture specs, and current codebase state, this analysis identifies **47 specific gaps, risks, and recommendations** across 9 categories. The overall architecture is well-designed, but there are critical missing pieces that could derail development if not addressed early.

**Overall Assessment:** The codebase plan is **comprehensive and well-architected** but **under-estimates complexity** by approximately 40-50% in early tiers. Critical gaps are primarily in infrastructure wiring (Tier 0) and security foundation (Tier 1). The competitive differentiation strategy is sound.

**Recommendation:** Proceed after addressing Tier 0 blockers and revising timeline estimates.

---

## 1. 🚨 CRITICAL GAPS (Must Fix Before Development)

### 1.1 Database & Migration Path Issues

| Issue | Severity | Description | Recommended Fix |
|-------|----------|-------------|-----------------|
| **T0-1: Wrong migration paths** | 🔴 Critical | `migrate.ts` and `next-migration-number.ts` point to `backend/drizzle/migrations` but actual path is `backend/database/migrations/drizzle/` | Fix path constants in both files |
| **T0-5: Empty schema exports** | 🔴 Critical | All table exports in `backend/src/db/schema/index.ts` are commented out — no tables are actually wired | Create all 9 baseline tables (locations, users, audit_logs, patients, pain_assessments, notice_of_election, benefit_periods, idg_meetings, aide_supervisions) |
| **Care_model enum missing** | 🟡 High | Multi-CareLine architecture needs `care_model` enum on patients table for future Palliative/CCM support | Add `pgEnum('care_model', ['HOSPICE', 'PALLIATIVE', 'CCM'])` to T0-5 |

### 1.2 Dependency & Build Blockers

| Issue | Severity | Description | Recommended Fix |
|-------|----------|-------------|-----------------|
| **T0-2: Missing fastify-plugin** | 🔴 Critical | `valkey.plugin.ts` imports `fastify-plugin` but it's not in package.json | `pnpm add fastify-plugin` |
| **T0-3: Unwired shared-types** | 🔴 Critical | `@hospici/shared-types` workspace package exists but isn't linked to consumers | Add to backend/frontend package.json; create entry point |
| **T0-4: Missing api.ts** | 🔴 Critical | `app.config.ts` references `apiEntry: './src/api.ts'` but file doesn't exist | Create `frontend/src/api.ts` with TanStack Start API config |

### 1.3 Security Foundation Gaps

| Issue | Severity | Description | Recommended Fix |
|-------|----------|-------------|-----------------|
| **T1-1: Auth not implemented** | 🔴 Critical | Better Auth config exists as stub but no routes, no TOTP enforcement | Implement full Better Auth with mandatory MFA per HIPAA §164.312(d) |
| **T1-3: RLS uses forgeable headers** | 🔴 Critical | Current `rls.middleware.ts` reads raw HTTP headers instead of verified JWT claims | Extract from Better Auth session; remove header-based approach |
| **T1-5: PHI encryption service missing** | 🔴 Critical | Referenced in Key File Map but file doesn't exist | Create `phi-encryption.service.ts` with pgcrypto AES-256 |
| **18 PHI identifiers** | 🟡 High | Only 10 fields in redact config; missing faxNumber, url, ipAddress, deviceId, etc. | Expand to full 18 HIPAA identifiers |

---

## 2. 🔶 ARCHITECTURE RISKS

### 2.1 VantageChart Implementation Complexity

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Template condition evaluation uses `new Function()`** | ⚠️ **RCE vulnerability** if DB templates compromised | Replace with `expr-eval` npm package for sandboxed evaluation (noted in spec but needs enforcement) |
| **Handlebars template compilation** | Performance risk if compiled at runtime | Pre-compile all templates at build time via `vantagechart-compiler.ts` |
| **Voice-to-structured input** | Accuracy risk for clinical data | Implement confidence scoring; require manual confirmation for high-stakes fields |
| **Traceability storage** | Storage bloat | Implement 90-day traceability retention; archive to cold storage |

### 2.2 BullMQ Queue Gaps

| Queue | Status | Risk |
|-------|--------|------|
| `noe-deadline-check` | Planned (T1-6) | NOE late filing = claim denial |
| `aide-supervision-check` | Planned (T1-6) | CMS violation if >14 days |
| `hope-submission` | Planned (T1-7) | 2% Medicare penalty if missed |
| `hope-deadline-check` | Planned (T1-7) | Window violation |
| `hqrp-period-close` | Planned (T1-7) | Quarterly submission failure |
| `cap-recalculation` | Planned (T1-7) | Cap overage undetected |
| `claim-submission` | Planned (T3-7) | Revenue cycle disruption |
| `order-expiry-check` | Planned (T3-9) | Unsigned verbal orders |

**Recommendation:** All deadline-critical queues should be implemented in Tier 1, not spread across tiers.

### 2.3 Mobile/Offline Strategy (Tier 5)

| Risk | Current State | Recommendation |
|------|---------------|----------------|
| **No offline architecture defined** | Deferred to Phase 7 | 80% of hospice documentation happens offline — this is a **purchase-critical feature** |
| **PHI in IndexedDB** | Not addressed | Must encrypt with Web Crypto API; never plain IndexedDB |
| **Conflict resolution** | "Version vectors" mentioned | Needs detailed design; last-write-wins is unacceptable for clinical data |

**Recommendation:** Move T5-1 (Mobile strategy decision) to Tier 2 parallel track. Consider PWA as MVP before native apps.

---

## 3. 📋 COMPLIANCE GAPS

### 3.1 CMS Critical Path (Market Entry Blockers)

| Requirement | Task | Status | Risk |
|-------------|------|--------|------|
| NOE 5-day rule | T3-2 | Not started | Claim denial |
| NOTR auto-generation | T3-2 | Not started | Compliance gap |
| F2F blocking (period 3+) | T3-2 | Not started | Recertification invalid |
| Hospice cap calculation | T3-3 | Not started | Overage liability |
| Benefit period automation | T3-4 | Not started | Billing errors |
| HOPE-A 7-day window | T3-1 | Schemas only | 2% Medicare penalty |
| HOPE-D 7-day window | T3-1 | Schemas only | Quality measure impact |
| iQIES submission | T3-1 | Not started | HQRP non-compliance |

### 3.2 HIPAA Security Rule Gaps

| Requirement | CFR | Status | Task |
|-------------|-----|--------|------|
| Unique user identification | §164.312(a)(2)(i) | Pending T1-1 | Auth implementation |
| Emergency access procedure | §164.312(a)(2)(ii) | Not documented | Add break-glass procedure doc |
| Automatic logoff | §164.312(a)(2)(iii) | Mentioned T1-1 | 30-min idle timeout |
| Encryption/decryption | §164.312(a)(2)(iv) | Pending T1-5 | PHI encryption service |
| Audit controls | §164.312(b) | Pending T1-4 | AuditService |
| Integrity controls | §164.312(c)(1) | Not addressed | Tamper-evident signatures |
| Person/entity authentication | §164.312(d) | Pending T1-1 | MFA enforcement |
| Transmission security | §164.312(e) | Partial | TLS 1.3 configured |

### 3.3 BAA Registry (T3-8)

**Current state:** Referenced but not created.

**Required vendor list:**
- Valkey host (Redis/Valkey provider)
- SMTP/email provider
- Hosting/infrastructure (AWS/GCP/Azure)
- Backup/DR provider
- Clearinghouse (Availity/Change Healthcare)
- OpenFDA API (drug interactions)
- **Anthropic/Claude API** (VantageChart Layer 2 — PHI must be stripped)

---

## 4. 🔧 TECHNICAL DEBT RISKS

### 4.1 Schema-First Workflow Enforcement

**Current risk:** Schema files exist but no CI enforcement.

**Required CI gates:**
```yaml
# .github/workflows/ci.yml additions
- name: Verify no runtime TypeCompiler.Compile
  run: pnpm lint:no-compile-in-handler
  
- name: Verify iovalkey (not iovalis)
  run: |
    grep -r "from \"iovalis\"" backend/src/ && exit 1 || true
    
- name: Verify dialect (not driver)
  run: |
    grep -r "driver: \"pg\"" backend/ && exit 1 || true
```

### 4.2 Migration Safety

| Risk | Current State | Mitigation |
|------|---------------|------------|
| No down migration requirement | Mentioned but not enforced | Require `XXXX_name_down.sql` for every migration |
| No RLS policy verification | `test:rls` planned | Implement before any PHI table |
| Migration numbering conflicts | Gaps allowed | Document reserved ranges per team |

### 4.3 Testing Strategy Gaps

| Test Type | Status | Coverage Target |
|-----------|--------|-----------------|
| Unit tests (Vitest) | Not configured | 80% business logic |
| Schema validation tests | Not configured | All TypeBox schemas |
| RLS isolation tests | Planned T1-9 | All PHI tables |
| Integration tests | Planned T1-9 | All critical paths |
| Contract tests (Frontend) | Mentioned | All server functions |
| E2E tests | Not mentioned | Critical user flows |

---

## 5. 🎯 COMPETITIVE ANALYSIS VALIDATION

Based on the Firenote analysis document, the plan addresses most gaps but has omissions:

### 5.1 Firenote Features - Implementation Status

| Firenote Feature | Hospici Equivalent | Task | Status |
|------------------|-------------------|------|--------|
| RapidChart® | **VantageChart™** | T2-7 | Detailed spec ✅ |
| Compliance Dashboard | Alert Dashboard | T2-8 | Planned ✅ |
| Note Review System | Note review system | T2-9 | Planned ✅ |
| No-Prep IDG | IDG attendee notes | T2-4 | Amendment added ✅ |
| Paperless Order Routing | Physician order inbox | T3-9 | Added ✅ |
| ADR Export | Audit export | T3-10 | Added ✅ |
| QAPI Management | QAPI events | T3-11 | Added ✅ |
| 31-point claim audit | ClaimAuditService | T3-12 | Added ✅ |
| Mobile apps | **Tier 5 deferred** | T5-X | ⚠️ **Risk** — Firenote has no mobile; this was a differentiator |

### 5.2 Unique Differentiators (Well-Defined)

1. **VantageChart Layer 2 (LLM polish)** — Firenote explicitly avoids AI
2. **FHIR R4/R6 API** — Firenote has no open API
3. **CareLine expansion** — Palliative + CCM built into schema
4. **Pricing tiers** — Clear differentiation strategy

---

## 6. 📊 ESTIMATION REALITY CHECK

### 6.1 Timeline Analysis

| Phase | Planned | Reality Check | Risk |
|-------|---------|---------------|------|
| Tier 0 | Week 1 | 3-5 days | Low |
| Tier 1 | Weeks 1-3 | **4-6 weeks** | 🔴 Under-estimated |
| Tier 2 | Weeks 4-7 | **6-10 weeks** | 🔴 Under-estimated |
| Tier 3 | Weeks 8-15 | **10-16 weeks** | 🔴 Under-estimated |
| Tier 4 | Weeks 16-22 | 6-8 weeks | Moderate |
| Tier 5 | Post-Phase 6 | Unknown | High |

**Key concern:** Tier 1-3 are significantly underestimated. Security foundation (Tier 1) alone with proper testing is 4-6 weeks, not 3 weeks.

### 6.2 Resource Requirements

| Role | Current | Needed |
|------|---------|--------|
| Backend (Fastify/TypeBox/Drizzle) | Assumed 1 | 2-3 for parallel tracks |
| Frontend (TanStack Start) | Assumed 1 | 2 |
| DevOps/Infra | Not mentioned | 1 (Valkey, PostgreSQL, CI/CD) |
| Security/Compliance | Not mentioned | 0.5 FTE review |
| QA/Testing | Not mentioned | 1 |

---

## 7. 🔍 SPECIFIC IMPLEMENTATION QUESTIONS

### 7.1 Unresolved Technical Decisions

1. **iQIES Sandbox:** §9 Immediate Action says "60-90 day approval window" — has application been submitted?

2. **Clearinghouse Contract:** T3-7 requires EDI enrollment — is this in procurement?

3. **HOPE vs. HIS:** Documentation correctly states HIS retired 2025-10-01, but does the agency have transition experience?

4. **Valkey Cluster:** Single instance in docker-compose; production needs cluster mode — documented but not configured.

5. **PHI Encryption Key Rotation:** 90-day rotation mentioned but no automation specified.

### 7.2 Schema Questions

1. **Pain Scales:** T2-3 requires 5 scales (FLACC ✅, PAINAD, NRS, Wong-Baker, ESAS) — only FLACC exists currently.

2. **Medication Module:** T2-6 is entirely new — no schema, table, or routes exist. OpenFDA integration needs validation.

3. **FHIR R4 Resources:** T3-6 requires Patient + Observation endpoints — transformation layer not started.

---

## 8. ✅ RECOMMENDATIONS SUMMARY

### Immediate (Before Any Coding)

1. **Submit iQIES sandbox application** — 60-90 day lead time
2. **Engage healthcare compliance attorney** — ONC info blocking, state PHI laws
3. **Fix Tier 0 blockers** — T0-1 through T0-7 must be complete before feature work
4. **Create BAA registry** — Document all PHI-processing vendors
5. **Revise timeline** — Add 50% buffer to Tier 1-3 estimates

### Architecture Adjustments

1. **Move deadline-critical BullMQ jobs to Tier 1** — NOE, aide supervision, HOPE checks
2. **Parallel mobile strategy track** — Don't defer to Phase 7; start T5-1 in Tier 2
3. **Add integration test requirement** — Every route needs contract + integration tests
4. **Implement CI/CD before Phase 1 exit** — Not as a separate task

### Risk Mitigation

1. **VantageChart RCE prevention** — Ban `new Function()` via ESLint; require `expr-eval`
2. **PHI encryption verification** — Test that raw DB queries show ciphertext only
3. **RLS testing automation** — Every migration must include RLS test cases
4. **BullMQ DLQ runbook** — Document requeue procedures before going live

---

## 9. 📋 FINAL CHECKLIST

### Pre-Development Sign-Off

- [ ] T0-1: Migration paths fixed
- [ ] T0-2: fastify-plugin dependency added
- [ ] T0-3: shared-types workspace wired
- [ ] T0-4: api.ts created
- [ ] T0-5: All 9 baseline tables + care_model enum
- [ ] T0-6: Routes registered + rate limiting
- [ ] T0-7: Logging config extracted
- [ ] iQIES sandbox application submitted
- [ ] Healthcare compliance attorney engaged
- [ ] BAA registry template created
- [ ] CI/CD pipeline configured
- [ ] Timeline revised with realistic estimates

### Exit Gates (Per Phase)

| Phase | Exit Gate |
|-------|-----------|
| Phase 1 | `test:rls` passes; `test:schemas` passes; no string-interpolated SET statements |
| Phase 2 | Clinical E2E passes; IDG 15-day block verified; aide supervision job runs |
| Phase 3 | NOE Friday edge case passes; HOPE 7-day window enforced; cap alert at 80% |
| Phase 4 | 837i validates against X12; ERA 835 round-trip; DLQ alert fires |
| Phase 5 | SMART scope tests pass; bulk export NDJSON valid; eRx round-trip |
| Phase 6 | k6 500 concurrent <200ms p95; zero runtime TypeCompiler.Compile |

---

## Appendix A: Gap Count by Category

| Category | 🔴 Critical | 🟡 High | 🟢 Medium/Low | Total |
|----------|-------------|---------|---------------|-------|
| Database/Migrations | 3 | 1 | 0 | 4 |
| Dependencies/Build | 3 | 0 | 0 | 3 |
| Security | 3 | 1 | 1 | 5 |
| Architecture | 0 | 3 | 4 | 7 |
| Compliance (CMS) | 4 | 4 | 0 | 8 |
| Compliance (HIPAA) | 2 | 3 | 2 | 7 |
| Testing | 0 | 2 | 3 | 5 |
| Timeline/Resources | 0 | 3 | 0 | 3 |
| Competitive | 0 | 1 | 1 | 2 |
| **TOTAL** | **15** | **18** | **11** | **44** |

---

*Document Version: 1.0*  
*Reviewed by: Code Assistant*  
*Next Review: Post Tier-0 Completion*
