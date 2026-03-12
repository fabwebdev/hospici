# Hospici Database Architecture Reference

> **Schema-First Database Architecture with TypeBox Validation**
>
> **ORM:** Drizzle ORM · **Dialect:** PostgreSQL 18 · **Cache:** Valkey 8
> **Validation:** TypeBox (JSON Schema 2020-12)
> **Status:** Canonical Reference — Pre-Production
> **Total Schema Files:** 346 across 10 bounded contexts (verified via `npm run db:schema-report`)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Schema-First Architecture](#schema-first-architecture)
3. [Column Promotion Policy](#column-promotion-policy)
4. [Domain Architecture](#domain-architecture)
5. [RLS Policy Specifications](#rls-policy-specifications)
6. [Migration Workflow](#migration-workflow)
7. [Runtime Patches](#runtime-patches)
8. [Data Protection & Recovery](#data-protection--recovery)
9. [FHIR Resource Mapping](#fhir-resource-mapping)
10. [Valkey Integration](#valkey-integration)
11. [Naming Conventions](#naming-conventions)

---

## Executive Summary

### Architecture Principles

Hospici uses a **Schema-First** approach where TypeBox defines the single source of truth:

1. **TypeBox schemas** define validation rules, TypeScript types, and JSON Schema
2. **Drizzle ORM** synthesizes database tables from TypeBox definitions using `dialect: "postgresql"`
3. **PostgreSQL 18** stores data with JSONB for FHIR resources, native columns for queryable fields, and strict RLS policies
4. **Valkey 8** provides caching, sessions, and job queues with TypeBox-validated data

> **Package note:** All Valkey client code uses `import Valkey from "iovalkey"` — not `"iovalis"`.
> **Drizzle config note:** All `drizzle.config.ts` files use `dialect: "postgresql"` — not the deprecated `driver: "pg"`.

### Schema Distribution

| Domain | Files | Percentage | Key Features |
|--------|-------|------------|--------------|
| **Clinical** | **215** | **62%** | Comprehensive hospice assessments, symptoms, wound care, psychosocial |
| **Billing** | 20 | 6% | NOE/NOTR state machines, Cap calculations, claims, DLQ-backed jobs |
| **Identity** | 16 | 5% | ABAC policies, audit trails, break-glass |
| **Interop** | 14 | 4% | FHIR R4/R6 adapters, SMART scope registry, eRx |
| **Documents** | 12 | 3% | eSignatures, AI embeddings, advance directives |
| **Scheduling** | 8 | 2% | IDG compliance, aide supervision, staff assignments |
| **Communication** | 4 | 1% | Real-time chat, notifications |
| **Analytics** | 8 | 2% | QAPI metrics, CAHPS surveys, compliance |
| **Shared** | 8 | 2% | Value objects, RLS helpers |
| **System** | 45 | 13% | Config, utilities, middleware |

To verify actual file counts at any time:

```bash
npm run db:schema-report
# Outputs: verified file count per context, last-modified timestamps, validator compilation status
```

---

## Schema-First Architecture

### TypeBox → Drizzle → PostgreSQL Flow

```typescript
// 1. Define TypeBox schema (source of truth)
export const PatientSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  resourceType: Type.Literal('Patient'),
  identifier: Type.Array(IdentifierSchema),
  name: Type.Array(HumanNameSchema),
  gender: Type.Optional(Type.Enum({ male: 'male', female: 'female', other: 'other', unknown: 'unknown' })),
  birthDate: Type.String({ format: 'date' }),
  hospiceLocationId: Type.String({ format: 'uuid' }),
  admissionDate: Type.Optional(Type.String({ format: 'date' })),
  dischargeDate: Type.Optional(Type.String({ format: 'date' })),
  _gender: Type.Optional(FhirElementSchema)  // R6 extension point
}, { additionalProperties: false });

// 2. Drizzle table — promoted columns for RLS + indexing, JSONB for FHIR narrative
export const patients = pgTable('patients', {
  id: uuid('id').primaryKey().defaultRandom(),
  resourceType: varchar('resource_type', { length: 50 }).notNull().default('Patient'),
  locationId: uuid('location_id').references(() => locations.id).notNull(), // promoted: RLS
  admissionDate: date('admission_date'),                                     // promoted: cap queries
  dischargeDate: date('discharge_date'),                                     // promoted: billing
  fhirVersion: varchar('fhir_version', { length: 10 }).notNull().default('4.0'), // promoted: negotiation
  data: jsonb('data').notNull(),  // TypeBox-validated FHIR narrative payload
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
}, (table) => ({
  locationIdx: index('patients_location_idx').on(table.locationId),
  admissionIdx: index('patients_admission_idx').on(table.admissionDate),
}));

// 3. ✅ Compile validator ONCE at module level — never inside request handlers
export const PatientValidator = TypeCompiler.Compile(PatientSchema);

// 4. Type-safe insertion with runtime validation
if (PatientValidator.Check(data)) {
  await db.insert(patients).values({ data, locationId: data.hospiceLocationId, fhirVersion: '4.0' });
}
```

---

## Column Promotion Policy

This policy defines which fields are always promoted to native PostgreSQL columns versus stored exclusively in JSONB. Developers must follow this policy when adding new schemas to prevent inconsistency.

| Field Category | Storage Strategy | Rationale |
|---|---|---|
| `location_id` | **Native column** (NOT NULL) | All RLS policies filter on this column |
| `patient_id` | **Native column** (FK) | All clinical tables reference patients |
| `admission_date`, `discharge_date` | **Native column** | Hospice cap date range queries |
| `fhir_version` | **Native column** | Content negotiation and filtering |
| `status` on NOE, claim, benefit_period | **Native column** | State machine queries and partial indexes |
| `created_at`, `updated_at` | **Native column** | Audit, TTL, and ordering |
| `filing_deadline` on NOE | **Native column** | NOE deadline BullMQ job queries |
| `period_number` on benefit_period | **Native column** | Certification period logic |
| FHIR narrative content | **JSONB only** | Variable structure; queried via GIN index |
| Pain/symptom assessment scores | **JSONB only** | Highly variable schema across 32 scales |
| ABAC policy conditions | **JSONB only** | Policy engine flexibility |
| FHIR extension fields (`_gender` etc.) | **JSONB only** | R6 migration compatibility |

**Rule:** If a field is used in a WHERE clause, JOIN, or RLS policy — it gets a native column. Everything else goes in JSONB.

---

## Domain Architecture

### Clinical Domain (215 TypeBox schemas — 62%)

#### Patient Management (18 schemas)

| Schema | TypeBox Definition | Purpose |
|--------|-------------------|---------|
| `patient.schema.ts` | `PatientSchema` | Core demographics, FHIR mapping |
| `address.schema.ts` | `AddressSchema` | USPS validation, geocoding |
| `patientContact.schema.ts` | `ContactSchema` | Emergency contacts, relationships |
| `referral.schema.ts` | `ReferralSchema` | Intake workflows, autopopulation |
| `livingArrangements.schema.ts` | `LivingArrangementSchema` | Home, facility, safety assessment |
| `spiritualPreference.schema.ts` | `SpiritualSchema` | Faith tradition, chaplain referral |
| `advanceDirective.schema.ts` | `AdvanceDirectiveSchema` | POLST, living will, DPOA |
| `codeStatus.schema.ts` | `CodeStatusSchema` | DNR/DNI, physician orders |
| `emergencyPreparedness.schema.ts` | `EmergencyPrepSchema` | Disaster plan, 911 alternatives |
| `primaryDiagnosis.schema.ts` | `DiagnosisSchema` | Terminal diagnosis, ICD-10 |
| `secondaryConditions.schema.ts` | `ComorbiditySchema` | Related conditions |
| `allergy.schema.ts` | `AllergySchema` | Medication, food, environmental |
| `pharmacy.schema.ts` | `PharmacySchema` | Preferred pharmacy, deliveries |
| `insurance.schema.ts` | `InsuranceSchema` | Primary, secondary, verification |
| `pcp.schema.ts` | `PCPSchema` | Attending physician, NPI |
| `referralSource.schema.ts` | `ReferralSourceSchema` | Hospital, facility, physician |
| `admissionForm.schema.ts` | `AdmissionFormSchema` | Comprehensive intake |
| `transferForm.schema.ts` | `TransferFormSchema` | Inbound/outbound transfers |

#### Pain Management (32 schemas — multi-modal)

| Schema | Scale Type | Population | TypeBox Constraints |
|--------|-----------|------------|---------------------|
| **Pediatric** ||||
| `flaccScale.schema.ts` | Behavioral | 0–2 years | Face, legs, activity, cry, consolability (0–2 each) |
| `flaccRevised.schema.ts` | Behavioral | 2–7 years | Extended FLACC |
| `wongBaker.schema.ts` | Faces | 3+ years (cognitive) | 6 faces, 0–10 |
| `oucherScale.schema.ts` | Numeric | 3–12 years | 0–100 |
| **Adult Cognitive** ||||
| `numericRating.schema.ts` | Numeric | Adult | 0–10, whole numbers only |
| `verbalDescriptor.schema.ts` | Verbal | Adult | None, mild, moderate, severe |
| `visualAnalog.schema.ts` | Visual | Adult | 100mm line |
| **Dementia/Non-Verbal** ||||
| `painadScale.schema.ts` | Dementia | Late-stage | Breathing, vocalization, face, body, consolability |
| `doloplus2.schema.ts` | Elderly | Severe dementia | 10 items, 0–3 |
| `eopsScale.schema.ts` | Elderly | End-stage | 8 behavioral indicators |
| **Pain Characteristics** ||||
| `painLocation.schema.ts` | Body map | All | Anatomical locations |
| `painQuality.schema.ts` | Descriptors | All | Sharp, burning, aching, etc. |
| `painIntensity.schema.ts` | Severity | All | Current, worst, best, average |
| `painDuration.schema.ts` | Temporal | All | Constant, intermittent, breakthrough |
| `painRadiation.schema.ts` | Pattern | All | Referral patterns |
| `painAlleviating.schema.ts` | Interventions | All | What helps |
| `painAggravating.schema.ts` | Triggers | All | What worsens |
| `painImpact.schema.ts` | Functional | All | Sleep, mood, activity |
| `breakthroughPain.schema.ts` | Episode | All | BTcP onset, peak, duration |
| `painGoal.schema.ts` | Outcome | All | Acceptable level, functional goals |
| **Specialized** ||||
| `neuropathicPain.schema.ts` | DN4 | Neuropathy | 4 questions, 0–10 |
| `visceralPain.schema.ts` | Assessment | Cancer | Organ-specific indicators |
| `bonePain.schema.ts` | Assessment | Metastatic | Weight-bearing, movement |
| `incidentPain.schema.ts` | Activity-related | All | Movement-induced |
| `endOfDosePain.schema.ts` | Pharmacological | All | Before next dose |
| `painSatisfaction.schema.ts` | Outcome | All | Relief satisfaction |
| `painBarrier.schema.ts` | Assessment | All | Cultural, communication barriers |
| `pediatricPainPool.schema.ts` | Proxy | Non-verbal child | Parent/caregiver observation |
| `comfortAssessment.schema.ts` | Terminal | Actively dying | Comfort measures only |

#### Symptom Management (28 schemas — ESAS+)

| Schema | Symptom | Scale |
|--------|---------|-------|
| `symptomDistressScale.schema.ts` | Global | ESAS |
| `dyspneaAssessment.schema.ts` | Shortness of breath | 0–10 |
| `nauseaAssessment.schema.ts` | Nausea | 0–10 |
| `constipationAssessment.schema.ts` | Constipation | 0–10 |
| `anxietyAssessment.schema.ts` | Anxiety | GAD-7 |
| `depressionAssessment.schema.ts` | Depression | PHQ-2/9 |
| `confusionAssessment.schema.ts` | Delirium | CAM |
| `agitationAssessment.schema.ts` | Agitation | PAS |
| `bleedingAssessment.schema.ts` | Hemorrhage | Severity |
| `secretionsAssessment.schema.ts` | Terminal secretions | Presence |
| `cachexiaAssessment.schema.ts` | Wasting | Weight loss % |
| `dysphagiaAssessment.schema.ts` | Swallowing | Aspiration risk |
| _(+ 16 additional ESAS component schemas)_ | | |

#### Scheduling — HHA Aide Supervision (CMS §418.76)

```typescript
// contexts/scheduling/schemas/aideSupervision.schema.ts
export const AideSupervisionSchema = Type.Object({
  patientId: Type.String({ format: 'uuid' }),
  aideId: Type.String({ format: 'uuid' }),
  supervisorId: Type.String({ format: 'uuid' }),
  supervisionDate: Type.String({ format: 'date' }),
  nextSupervisionDue: Type.String({ format: 'date' }),  // +14 days
  method: Type.Enum({ inPerson: 'in_person', virtual: 'virtual', observation: 'observation' }),
  findings: Type.String({ minLength: 10 }),
  actionRequired: Type.Boolean(),
  actionTaken: Type.Optional(Type.String())
});
```

#### Care Planning & IDG (14 schemas)

| Schema | Purpose | CMS Rule |
|--------|---------|---------|
| `certification.schema.ts` | 90-day periods, F2F | 42 CFR §418.22 |
| `recertification.schema.ts` | Continued eligibility | F2F required period 3+ |
| `idgMeeting.schema.ts` | Interdisciplinary group | Every 15 days — hard block |
| `idgAttendance.schema.ts` | Required disciplines | RN + MD + SW minimum |
| `carePlan.schema.ts` | Goals, interventions | FHIR CarePlan mapping |
| `levelOfCare.schema.ts` | Routine, GIP, respite, continuous | LOC change tracking |
| `planOfCareReview.schema.ts` | 15-day review | Links to IDG meeting |
| `hospiceDischarge.schema.ts` | Discharge planning | NOTR trigger |

### Billing Domain (20 schemas)

```typescript
// noticeOfElection.schema.ts — 5-day rule with Friday edge case handling
export const NOESchema = Type.Object({
  patientId: Type.String({ format: 'uuid' }),
  electionDate: Type.String({ format: 'date' }),
  filedDate: Type.String({ format: 'date' }),
  status: Type.Enum({ draft: 'draft', submitted: 'submitted', acknowledged: 'acknowledged', rejected: 'rejected' }),
  lateFilingReason: Type.Optional(Type.String({ minLength: 20 }))
  // filedDate ≤ electionDate + 5 business days (validated in service layer)
});
```

---

## RLS Policy Specifications

All PHI tables must have RLS enabled. Below are the canonical policy definitions. Developers adding new tables must follow these patterns exactly.

### Tier 1: Identity & Foundation

```sql
-- users: self-access only for non-admins
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_self_read ON users
  FOR SELECT USING (
    id = current_setting('app.current_user_id')::uuid
    OR current_setting('app.current_role') IN ('admin', 'supervisor')
  );

-- audit_logs: append-only, no updates or deletes
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_insert ON audit_logs
  FOR INSERT WITH CHECK (true);

CREATE POLICY audit_logs_select ON audit_logs
  FOR SELECT USING (
    location_id = current_setting('app.current_location_id')::uuid
  );
-- Intentionally no UPDATE or DELETE policy — audit logs are immutable
```

### Tier 2: Clinical

```sql
-- patients: location isolation
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY patients_location_read ON patients
  FOR SELECT USING (
    location_id = current_setting('app.current_location_id')::uuid
  );

CREATE POLICY patients_location_insert ON patients
  FOR INSERT WITH CHECK (
    location_id = current_setting('app.current_location_id')::uuid
  );

CREATE POLICY patients_location_update ON patients
  FOR UPDATE USING (
    location_id = current_setting('app.current_location_id')::uuid
  );

-- encounters, assessments, pain records — same pattern as patients
-- (location_id column required on every clinical table)
```

### Tier 3: Billing

```sql
-- claims: location + role restriction
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY claims_read ON claims
  FOR SELECT USING (
    location_id = current_setting('app.current_location_id')::uuid
    AND current_setting('app.current_role') IN ('admin', 'billing', 'supervisor')
  );

CREATE POLICY claims_insert ON claims
  FOR INSERT WITH CHECK (
    location_id = current_setting('app.current_location_id')::uuid
    AND current_setting('app.current_role') IN ('admin', 'billing')
  );

-- notice_of_election, benefit_periods — same billing role restriction
```

### RLS Context Injection (Safe Pattern)

```typescript
// ✅ CORRECT — parameterized via set_config function
await db.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
await db.execute(sql`SELECT set_config('app.current_location_id', ${locationId}, true)`);
await db.execute(sql`SELECT set_config('app.current_role', ${role}, true)`);

// ❌ NEVER — string interpolation, even with validated uuid values
// await db.execute(`SET app.current_user_id = '${userId}'`);
```

---

## Migration Workflow

### Overview

```
TypeBox Schema Definition
         ↓
Drizzle Table Definition
         ↓
drizzle-kit generate  (dialect: "postgresql")
         ↓
SQL Migration File (XXXX_descriptive_name.sql)
         ↓
TypeBox Validator Generation (post-hook)
         ↓
RLS Policy Addition (mandatory)
         ↓
drizzle-kit migrate
         ↓
PostgreSQL 18
```

### Migration Numbering Convention

- Files are numbered sequentially: `0000`, `0001`, ..., `0125`, `0126`
- **Gaps** (e.g., `0119`, `0121`, `0122`) are reserved for future domain-specific migrations and must not be reused
- **Suffixes** (e.g., `0086a`, `0086b`) are used when two domains generate conflicting migrations in the same sprint — resolve by merging before main branch merge
- To safely generate the next migration number: `npm run db:next-migration-number`

### Step 1: Define TypeBox Schema

```typescript
// src/contexts/billing/schemas/newFeature.schema.ts
export const NewFeatureSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  locationId: Type.String({ format: 'uuid' }), // ← required for RLS
  name: Type.String({ minLength: 1, maxLength: 255 }),
  status: Type.Enum({ active: 'active', inactive: 'inactive' }),
}, { additionalProperties: false });

export type NewFeature = Static<typeof NewFeatureSchema>;

// ✅ Compile at module level
export const NewFeatureValidator = TypeCompiler.Compile(NewFeatureSchema);
```

### Step 2: Create Drizzle Table

```typescript
export const newFeatures = pgTable('new_features', {
  id: uuid('id').primaryKey().defaultRandom(),
  locationId: uuid('location_id').references(() => locations.id).notNull(), // promoted for RLS
  name: varchar('name', { length: 255 }).notNull(),
  status: varchar('status', { length: 50 }).notNull().default('active'),   // promoted for queries
  metadata: jsonb('metadata'),                                               // JSONB for flexible data
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
}, (table) => ({
  locationStatusIdx: index('new_features_location_status_idx').on(table.locationId, table.status),
}));
```

### Step 3: Generate + Apply Migration

```bash
# Generate SQL migration
npm run db:generate
# Creates: database/migrations/drizzle/0126_new_feature_support.sql

# Compile validators post-hook
npm run db:compile-validators

# Apply to dev
npm run db:migrate

# Apply to staging / production
npm run db:migrate:staging
npm run db:migrate:production  # requires backup verification
```

### Migration Best Practices

**Always add RLS to every new table:**

```sql
ALTER TABLE "new_features" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "new_features_location_read" ON "new_features"
  FOR SELECT USING (location_id = current_setting('app.current_location_id')::uuid);

CREATE POLICY "new_features_location_write" ON "new_features"
  FOR INSERT WITH CHECK (location_id = current_setting('app.current_location_id')::uuid);
```

**Breaking change protocol — never modify existing columns directly:**

1. Add new column
2. Backfill data
3. Deploy application code using new column
4. Mark old column deprecated
5. Drop old column in next release

### Rollback Procedures

```bash
# Rollback last migration
npm run db:rollback

# Rollback to specific timestamp
npm run db:rollback -- --to 20260311120000

# Production emergency — manual
pg_dump $DATABASE_URL > backup_pre_migration.sql
psql $DATABASE_URL < database/migrations/drizzle/0126_new_feature_support_down.sql
```

### CI/CD Integration

```yaml
name: Database Migration CI

on:
  pull_request:
    paths:
      - 'database/migrations/**'
      - 'src/contexts/**/schemas/**'

jobs:
  migrate:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:18
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
    steps:
      - uses: actions/checkout@v4
      - name: Install dependencies
        run: npm ci
      - name: Verify iovalkey (not iovalis) and correct dialect
        run: |
          grep -r "from \"iovalis\"" src/ && echo "ERROR: Use iovalkey" && exit 1 || true
          grep -r "driver: \"pg\"" . --include="*.ts" && echo "ERROR: Use dialect: postgresql" && exit 1 || true
      - name: Generate TypeBox validators
        run: npm run db:compile-validators
      - name: Run migrations
        run: npm run db:migrate
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test
      - name: Verify RLS policies
        run: npm run test:rls
      - name: Run schema tests
        run: npm run test:schemas
```

---

## Runtime Patches

Applied outside Drizzle journal for hotfixes:

| Patch | Domain | Purpose |
|-------|--------|---------|
| `noe_deadline_fix.sql` | Billing | Emergency NOE deadline calculation |
| `rls_policy_update.sql` | Identity | Security policy hotfix |
| `fhir_index_optimization.sql` | Interop | Performance index addition |
| `cap_recalculation_trigger.sql` | Billing | Monthly cap recalculation |

```bash
# Apply specific patch (logged in audit_patches table)
npm run db:patch -- --file 001_critical_fix.sql
```

---

## Data Protection & Recovery

### Recovery Objectives

| Metric | Target | Implementation |
|---|---|---|
| RPO (Recovery Point Objective) | ≤ 15 minutes | PostgreSQL WAL streaming + continuous archival to S3 |
| RTO (Recovery Time Objective) | ≤ 4 hours | Automated failover to standby replica |
| Backup Retention | 6 years (HIPAA) | pg_basebackup daily + WAL archival |
| Valkey Persistence | AOF + RDB | AOF every second; RDB snapshot every 15 minutes |

### PostgreSQL Backup Schedule

```bash
# Daily base backup (runs at 02:00 UTC)
pg_basebackup -h $DB_HOST -U $DB_USER -D /backup/$(date +%Y%m%d) -Ft -z -Xs -P

# WAL archival (continuous, via postgresql.conf)
# archive_command = 'aws s3 cp %p s3://hospici-wal-archive/%f'
# archive_mode = on
# wal_level = replica
```

### Valkey Persistence Configuration

```conf
# AOF (append-only file) — primary persistence
appendonly yes
appendfsync everysec
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb

# RDB snapshot — secondary persistence
save 900 1
save 300 10
save 60 10000
```

### Storage Directory Classification

The `storage/` directory contains runtime-generated files:

| Subdirectory | Contents | PHI Risk | Encryption | Backup |
|---|---|---|---|---|
| `storage/framework/cache/` | Application cache (non-PHI only) | Low | Not required | Excluded |
| `storage/framework/sessions/` | Session fallback only (Valkey is primary) | **Medium** | AES-256 if used | Excluded |
| `storage/framework/views/` | Compiled templates | None | Not required | Excluded |
| `storage/framework/testing/` | Test artifacts | None | Not required | Excluded |

> **Important:** `storage/framework/sessions/` is a Valkey fallback only and must never contain PHI in production. This directory is excluded from all backup jobs and is ephemeral in containerized deployments (tmpfs recommended).

---

## FHIR Resource Mapping

### PostgreSQL JSONB Structure

```sql
CREATE TABLE fhir_resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(100) NOT NULL,
    fhir_version VARCHAR(10) NOT NULL DEFAULT '4.0',  -- promoted column
    data JSONB NOT NULL,                               -- TypeBox-validated
    location_id UUID REFERENCES locations(id),         -- promoted column: RLS
    last_modified TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(resource_type, resource_id, fhir_version)
);

CREATE INDEX idx_fhir_data ON fhir_resources USING GIN (data);
CREATE INDEX idx_fhir_type_version ON fhir_resources(resource_type, fhir_version);
CREATE INDEX idx_fhir_location ON fhir_resources(location_id);
```

### TypeBox → FHIR Mapping

| Hospici Schema | FHIR R4 | R6 Changes |
|----------------|---------|------------|
| `PatientSchema` | Patient | `deceased` union type; `link` restructured |
| `EncounterSchema` | Encounter | Location restructuring |
| `ObservationSchema` | Observation | Category cardinality |
| `CarePlanSchema` | CarePlan | Intent binding |

---

## Valkey Integration

### TypeBox-Validated Cache Entries

```typescript
// ✅ Module-level compilation
const CacheEntryValidator = TypeCompiler.Compile(CacheEntrySchema);

export async function getSession(valkey: Valkey, sessionId: string) {
  const data = await valkey.get(`session:${sessionId}`);
  if (!data) return null;

  const parsed = JSON.parse(data);
  // Validator compiled at module level — no per-call compilation
  if (!CacheEntryValidator.Check(parsed)) {
    throw new Error('Invalid session format');
  }
  return parsed;
}
```

### RedisSearch Index

```sql
FT.CREATE patient-idx ON JSON PREFIX 1 fhir:Patient: SCHEMA
  $.name[0].family AS family TEXT
  $.birthDate AS birthDate TAG
  $.gender AS gender TAG
```

---

## Naming Conventions

### Files

- **Schemas:** `{domain}.schema.ts` (e.g., `flaccScale.schema.ts`)
- **Migrations:** `XXXX_descriptive_name.sql` (e.g., `0126_aide_supervision.sql`)
- **Validators:** `{domain}.validator.ts` (auto-generated by post-hook)

### Database

- **Tables:** snake_case, plural (e.g., `benefit_periods`, `aide_supervisions`)
- **Columns:** snake_case (e.g., `fhir_version`, `location_id`, `next_supervision_due`)
- **Indexes:** `{table}_{column(s)}_idx`
- **RLS Policies:** `{table}_{action}_policy`

### TypeBox

- **Schemas:** PascalCase + Schema suffix (e.g., `PatientSchema`, `NOESchema`)
- **Types:** PascalCase (e.g., `Patient`, `NOE`)
- **Validators:** PascalCase + Validator suffix, compiled at module level (e.g., `PatientValidator`)

---

_Hospici Database Architecture v2.0 — Schema-First, TypeBox-Validated, RLS-Enforced, CMS-Compliant_
