---
name: hospici-review
description: >
  Self-improving daily code review skill for Hospici, a HIPAA-compliant hospice EHR built on
  TypeScript/Fastify/TanStack/PostgreSQL/Drizzle. Use this skill whenever the user asks to:
  review code, run a daily scan, catch bugs, audit for HIPAA/PHI compliance, enforce coding
  standards, check security, run a pre-commit review, improve code quality, check linting or
  formatting errors, audit API documentation, check regulatory compliance, or review database
  patterns. Also trigger automatically when the user says "run review", "scan the repo",
  "check for issues", "what did I break", "audit my code", "check my Drizzle queries",
  "are my docs up to date", "any new CMS updates", or "lint my code".
  This skill learns from every correction it makes — do not skip it in favor of ad-hoc review.
---

# Hospici Code Review Skill v2.0

A self-improving, domain-aware code review system for the Hospici hospice EHR codebase.
Every finding gets logged. Every correction teaches the system a new rule.
Every regulatory change gets tracked. Every API gap gets flagged.

---

## 1. Trigger Contexts

| Trigger | Scope | Blocking? |
|---|---|---|
| Pre-commit hook | Changed files + dependents | Critical only |
| Daily cron / CI pipeline | Full repo | No (report only) |
| GitHub Actions PR | Changed files + dependents | Critical blocks merge |
| Manual `/review` | Full repo or path arg | No |
| Session start | Full repo | No |

---

## 2. Review Pipeline (Execute in Order)

### Step 1 — Load Knowledge Base
Read `references/learned-rules.yaml`. Extract all active rules with severity, category, pattern,
confidence score, and weight. Higher-weight categories (based on severity history) get priority.

### Step 2 — Determine Scope
- **Pre-commit / GHA PR**: `git diff --cached --name-only` → changed files + their imports
- **Daily / manual**: All `.ts`, `.tsx`, `.sql` under `src/`, `db/`, `workers/`, `shared/`
- **Ignore**: `node_modules/`, `dist/`, `*.test.ts`, `*.spec.ts`
- **Always include**: `migrations/` for destructive change detection only

### Step 3 — Biome Lint & Format Gate
Read `references/biome-integration.md`. Run:
```bash
npx biome check --reporter=json .
```
Parse output. Surface in unified report:
- Biome errors → 🔴 Critical (blocks commit)
- Biome warnings → 🟡 Warning
- Biome info → 🔵 Info
Do NOT duplicate findings already caught by base checklist.

### Step 4 — Run Base Checks
Run all checks in `references/base-checklist.md`:
- 🔴 **Critical** — blocks commit, creates GitHub issue, logs to REVIEW_LOG.md
- 🟡 **Warning** — alerts terminal, logs REVIEW_LOG.md, creates GitHub issue
- 🔵 **Info** — terminal only

### Step 5 — PHI Leak Detection
Full scan per `references/phi-detection.md`:
- Regex pass (SSN, DOB, MRN, NPI, address patterns)
- Log statement scan
- API response payload inspection
- Semantic reasoning pass

### Step 6 — Drizzle Deep Analysis
Full scan per `references/drizzle-analysis.md`:
- N+1 query detection
- Missing index analysis
- Destructive migration detection
- RLS policy coverage gaps

### Step 7 — API Documentation Audit
Full audit per `references/api-docs-audit.md`:
- Missing OpenAPI spec on new routes
- Fastify schema vs OpenAPI spec drift
- Outdated response schemas
- Undocumented error codes

### Step 8 — Regulatory Compliance Check
Read `references/regulatory-digest.md`:
- Flag code patterns conflicting with active regulatory requirements
- Surface digest entries marked `status: action-required`
- Warn if digest is >7 days stale

### Step 9 — Apply Learned Rules
For each active rule in `learned-rules.yaml` (sorted by category_weight descending):
- Scan all in-scope files
- Report matches with rule ID, file, line, severity, confidence

### Step 10 — Write Findings
1. **Terminal** — unified formatted summary (see Section 3)
2. **`REVIEW_LOG.md`** — append timestamped entry
3. **GitHub Issues** — one issue per Critical or Warning (use `gh issue create`)
4. **GHA PR Comment** — post summary as PR comment when running in CI

### Step 11 — Self-Improvement Loop
Run the enhanced learning protocol (Section 4).

---

## 3. Output Formats

### Terminal Summary
```
╔══════════════════════════════════════════════════════════╗
║  HOSPICI CODE REVIEW v2.0 — 2025-01-15 09:00            ║
╠══════════════════════════════════════════════════════════╣
║  🔴 Critical : 2   🟡 Warning : 5    🔵 Info   : 8     ║
║  🧹 Biome    : 3   📋 API Docs : 2   📜 Regs   : 1     ║
║  🗄️  Drizzle  : 4   📚 Rules   : 18 active              ║
╚══════════════════════════════════════════════════════════╝

🔴 [PHI-001] PHI EXPOSURE — src/api/patients/route.ts:47
   SSN in unauthenticated response payload
   → Fix: strip ssn from public serializer | Confidence: 98%

🗄️  [DRIZZLE-N1] N+1 QUERY — src/services/episodes.ts:88
   Loop calling db.select().from(visits) inside patient iterator
   → Fix: use db.query.visits.findMany({ where: inArray(...) })

🧹 [BIOME] FORMAT ERROR — src/api/billing/route.ts:14
   noExplicitAny violation | biome(lint/suspicious/noExplicitAny)

📋 [API-DRIFT] SCHEMA DRIFT — src/api/medications/route.ts
   Fastify response schema has dosage field missing from OpenAPI spec
   → Fix: sync openapi/paths/medications.yaml

📜 [REG-CMS] REGULATORY FLAG — src/services/claims.ts:203
   Missing HCPCS validation per CMS MLN MM13456 (eff. 2025-01-01)
   → See regulatory-digest.md: cms-2025-001
```

### REVIEW_LOG.md Entry
```markdown
## Review — 2025-01-15T09:00:00Z

**Trigger**: daily-cron | **Scope**: full-repo | **Files scanned**: 247
**Biome**: 3 errors, 2 warnings | **Active Rules**: 18 | **Digest Age**: 2 days

### Critical (2)
- `src/api/patients/route.ts:47` — PHI: SSN in response [phi-001] conf:98%
- `src/workers/fax.ts:88` — Unencrypted PHI in temp file [phi-007] conf:95%

### Drizzle (4)
- `src/services/episodes.ts:88` — N+1 inside patient loop [drizzle-n1-001]
- `db/schema/visits.ts:34` — FK missing index [drizzle-idx-002]
- `migrations/0042_drop_column.sql` — Destructive migration [drizzle-mig-001]
- `src/services/patients.ts:211` — Table missing RLS policy [drizzle-rls-003]

### Rules Learned This Run
- Added `drizzle-012` (conf: 0.82): Never iterate patients and query visits in loop
- Merged `std-008` into `std-003`: similar pattern, consolidated
```

---

## 4. Enhanced Self-Improvement Loop

### 4a. Confidence Scoring

Before saving any new rule, compute confidence (0.0–1.0):

```
base_score:
  Pattern matched regex exactly:      +0.40
  Semantic match (Claude reasoning):  +0.25
  Seen in 2+ files same run:          +0.20
  Matches existing rule category:     +0.10
  Has clear fix available:            +0.05

modifiers:
  PHI or auth category:               +0.10  (domain criticality bonus)
  Biome also flagged same issue:       +0.10  (corroboration)
  Only seen in test/mock file:         -0.30
  Ambiguous pattern:                   -0.15
```

**Threshold**: Auto-save if `confidence >= 0.75`. Below → `status: candidate` for manual review.

### 4b. Deduplication & Conflict Detection

Before saving, check `learned-rules.yaml` for:

1. **Exact duplicate**: Same pattern → skip, increment `trigger_count` on existing rule
2. **Near-duplicate** (>80% similarity): Save as `status: candidate`, log both IDs
3. **Conflict** (rules contradict each other): Save as `status: conflict`, alert user, do NOT auto-activate
4. **Subsumption** (new rule is subset of existing): Merge into existing rule's pattern only

### 4c. Category Weighting

Recalculate after every run:
```
weight = (critical_hits × 3 + warning_hits × 1) / total_runs
```
Higher-weight categories scanned first and reported at top of output.

### 4d. Rule Merge Suggestions

If 2+ rules share same category + severity + >70% pattern token overlap, suggest merge:
```
💡 MERGE SUGGESTION: drizzle-003 + drizzle-007
   drizzle-003: "Select without where on patients table"
   drizzle-007: "Select without where on episodes table"
   → Consolidate: "Select without where on any clinical table"
   Run: /review --merge drizzle-003 drizzle-007
```

### 4e. Rule Lifecycle
```
candidate (conf < 0.75)  →  active (conf >= 0.75, auto-saved)
active  →  archived (not triggered 180 days + trigger_count < 3)
archived  →  active (manually restored)
conflict  →  active | archived (user resolves)
```

### 4f. Full Rule Schema
```yaml
- id: "<category>-<next-number>"
  status: active | candidate | conflict | archived
  severity: critical | warning | info
  category: phi | auth | drizzle | fastify | audit | biome | api-docs | regulatory | perf | security | standards
  title: "Short human-readable title"
  confidence: 0.87
  category_weight: 2.4
  pattern: |
    Plain English + optional regex/code snippet
  why: |
    Why dangerous in hospice EHR context
  fix: |
    Correct pattern or approach
  example_bad: |
    // bad code
  example_good: |
    // corrected code
  first_seen:
    file: "src/path/to/file.ts"
    line: 47
    date: "2025-01-15"
    commit: "abc1234"
  last_triggered: "2025-01-15"
  trigger_count: 1
  merge_candidates: []
  conflicts_with: []
  regulatory_ref: null
  archived_date: null
```

---

## 5. Pre-Seeded Rule Categories

Read `references/bootstrap-rules.md` on first run. Covers:
- **PHI** (phi-001 → phi-010): Safe Harbor identifiers, log leakage, response stripping
- **Auth** (auth-001 → auth-005): Better Auth patterns, session checks, route guards
- **Drizzle** (drizzle-001 → drizzle-010): Transactions, N+1, indexes, RLS, migrations
- **Fastify** (fastify-001 → fastify-006): Security headers, schema validation, CORS
- **Audit** (audit-001 → audit-004): 42 CFR Part 418 audit trail
- **Biome** (biome-001 → biome-005): Common Biome violations for TypeScript/Fastify
- **API Docs** (api-001 → api-004): OpenAPI drift, missing schemas, undocumented errors
- **Regulatory** (reg-001 → reg-005): CMS/OIG active requirement patterns
- **Standards** (std-001 → std-008): Hospici naming, error handling, typing

---

## 6. Reference Files

| File | When to Read |
|---|---|
| `references/base-checklist.md` | Every run — core checks |
| `references/phi-detection.md` | Every run — PHI scan |
| `references/drizzle-analysis.md` | Every run — DB deep analysis |
| `references/api-docs-audit.md` | Every run — API doc gaps |
| `references/biome-integration.md` | Every run — lint/format gate |
| `references/regulatory-digest.md` | Every run — CMS/OIG/OHA updates |
| `references/learned-rules.yaml` | Every run — evolved ruleset |
| `references/bootstrap-rules.md` | First run or reset |
| `references/ci-integration.md` | GHA setup reference |

---

## 7. Slash Command Interface

```
/review [path]              Full repo or path scan
/review --fix               Attempt auto-fix, learn rule
/review --rules             List all active rules with weights
/review --candidates        Show rules awaiting confidence threshold
/review --conflicts         Show conflicting rules needing resolution
/review --archive           Show archived rules
/review --merge <id> <id>   Merge two rules into one
/review --reset-rules       Prompt before clearing knowledge base
/review --digest            Show regulatory digest only
/review --digest-update     Manually trigger digest refresh prompt
/review --stats             Show category weights, rule counts, trend
```

---

## 8. GitHub Issue Template

```
Title: [HOSPICI-REVIEW] <severity> — <short description>

## Finding
**File**: `path/to/file.ts:line`
**Rule**: `<rule-id>` | **Confidence**: <score>%
**Severity**: Critical / Warning | **Category**: <category>

## Description
<what was found>

## Why It Matters
<hospice EHR / HIPAA / regulatory context>

## Suggested Fix
<code or approach>

## Regulatory Reference
<if applicable — e.g. 42 CFR §418.xxx, CMS MLN MMXXXXX>

---
*Auto-generated by hospici-review v2.0*
```
