# Hospici Database Architecture
## Drizzle ORM + TypeBox Schema Reference

**Version:** Hospici Specification v3.0
**Date:** 2026-03-11
**Status:** Canonical Reference — Pre-Production
**Stack:** Drizzle ORM · TypeBox · PostgreSQL 18 · Valkey 8.0 (iovalkey)

---

## 1. Executive Summary / Architecture Philosophy

### Schema-First Development

Hospici uses **TypeBox** as the single source of truth for:
- Runtime validation (AOT compilation — **module-level only**)
- TypeScript types (static inference)
- JSON Schema 2020-12 generation
- OpenAPI 3.1 specification
- Drizzle ORM type synthesis

### Resolved Decisions

| Decision | Implementation |
|----------|----------------|
| **Validation** | TypeBox (not Zod) for JSON Schema compliance |
| **Cache/Queue** | Valkey 8.0 via `iovalkey` package (not `iovalis`) |
| **HTTP Framework** | Fastify 5 with compiled validators |
| **FHIR** | R4 storage with R6 transformation adapters |
| **Migrations** | `drizzle-kit` with `dialect: "postgresql"` (not `driver: "pg"`) |
| **RLS Context** | Parameterized `set_config` via `sql` template tag (no string interpolation) |

### Path Standards

- **Migrations:** `Backend/database/migrations/drizzle/`
- **TypeBox Schemas:** `Backend/src/contexts/**/schemas/`
- **Shared Schemas:** `Backend/src/schemas/` (cross-domain)
- **Valkey Config:** `Backend/docker/valkey/`

---

## 2. File System Structure

```text
Backend/
├── drizzle.config.ts                    # dialect: "postgresql" — not driver: "pg"
├── database/
│   └── migrations/
│       └── drizzle/
│           ├── 0000_baseline.sql        # Auth tables with JSONB
│           ├── 0001_typebox_enums.sql   # TypeBox-generated enums
│           ├── ...
│           ├── 0125_fhir_r6_ready.sql  # R6 extension columns
│           └── meta/                    # Drizzle metadata
├── docker/
│   └── valkey/
│       ├── valkey.conf                  # Cluster configuration (AOF + RDB)
│       └── docker-compose.yml           # Valkey + RedisJSON
├── scripts/
│   └── database/
│       ├── migrate.ts                   # Migration runner
│       ├── check_tables.ts              # Schema inspection
│       ├── generate_typebox_schemas.ts  # Post-migration hook
│       ├── next_migration_number.ts     # Safe sequential numbering
│       └── test_valkey.ts               # Valkey connectivity
├── src/
│   ├── contexts/                        # 10 Bounded Contexts
│   │   ├── identity/schemas/
│   │   ├── clinical/schemas/
│   │   ├── billing/schemas/
│   │   └── ...
│   ├── schemas/
│   │   ├── fhir-core.ts
│   │   ├── hipaa-audit.ts
│   │   ├── cms-types.ts
│   │   └── value-objects.ts
│   ├── config/
│   │   ├── drizzle.ts
│   │   ├── typebox_compiler.ts          # ALL validators compiled here at startup
│   │   └── valkey.ts                    # iovalkey cluster client
│   └── shared-kernel/
└── setup-database.sql                   # PostgreSQL 18 bootstrap
```

---

## 3. TypeBox + Drizzle Integration

### Schema Synthesis Pattern

```typescript
// 1. Define TypeBox (source of truth)
import { Type, Static } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';

export const UserSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  email: Type.String({ format: 'email' }),
  abacAttributes: Type.Object({
    locationIds: Type.Array(Type.String({ format: 'uuid' })),
    role: Type.Enum({ admin: 'admin', clinician: 'clinician', billing: 'billing' })
  }),
  emailVerified: Type.Boolean({ default: false })
}, { additionalProperties: false });

// 2. Generate TypeScript type
export type User = Static<typeof UserSchema>;

// 3. ✅ Create AOT validator — compile ONCE at MODULE LEVEL, never inside functions
export const UserValidator = TypeCompiler.Compile(UserSchema);

// 4. Drizzle table
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  abacAttributes: jsonb('abac_attributes').notNull(),  // JSONB for flexible ABAC
  emailVerified: boolean('email_verified').default(false),
  createdAt: timestamp('created_at').defaultNow()
});

// 5. Type-safe insertion with runtime validation
const newUser = {
  email: 'user@hospici.com',
  abacAttributes: { locationIds: ['uuid-1'], role: 'clinician' }
};

if (UserValidator.Check(newUser)) {
  await db.insert(users).values(newUser);
}
```

> **AOT compilation rule:** `TypeCompiler.Compile()` must be called exactly once per schema, at module initialization time. A linting rule (`no-typebox-compile-in-function`) enforces this. Any `TypeCompiler.Compile()` call inside a function body will fail CI.

### JSONB Storage for FHIR

```typescript
export const fhirResources = pgTable('fhir_resources', {
  id: uuid('id').primaryKey().defaultRandom(),
  resourceType: varchar('resource_type', { length: 50 }).notNull(),  // promoted: type filtering
  resourceId: varchar('resource_id', { length: 100 }).notNull(),
  fhirVersion: varchar('fhir_version', { length: 10 }).notNull().default('4.0'), // promoted: negotiation
  data: jsonb('data').notNull(),  // TypeBox-validated FHIR resource
  locationId: uuid('location_id').references(() => locations.id),               // promoted: RLS
  lastModified: timestamp('last_modified').defaultNow()
}, (table) => ({
  uniqueResource: unique().on(table.resourceType, table.resourceId, table.fhirVersion),
  locationIdx: index('fhir_location_idx').on(table.locationId),
  dataGin: index('fhir_data_gin').on(table.data),  // GIN for JSONB queries
}));
```

### Transaction Patterns

All multi-step operations that must succeed or fail atomically use `db.transaction()`:

```typescript
// NOE filing + benefit period — must be atomic
async function fileNOEWithBenefitPeriod(input: NOEInput) {
  return await db.transaction(async (tx) => {
    const [benefitPeriod] = await tx
      .insert(benefitPeriods)
      .values({
        patientId: input.patientId,
        periodNumber: 1,
        startDate: input.electionDate,
        endDate: addDays(input.electionDate, 90),
        type: 'initial_90',
        locationId: input.locationId,
      })
      .returning();

    const [noe] = await tx
      .insert(noticeOfElection)
      .values({
        patientId: input.patientId,
        benefitPeriodId: benefitPeriod.id,
        electionDate: input.electionDate,
        filingDeadline: addBusinessDays(input.electionDate, 5),
        status: 'draft',
        locationId: input.locationId,
      })
      .returning();

    await tx.insert(auditLogs).values({
      userId: input.userId,
      action: 'noe_created',
      resourceType: 'NOE',
      resourceId: noe.id,
      locationId: input.locationId,
    });

    return { noe, benefitPeriod };
    // All three inserts roll back if any throws
  });
}

// Patient admission + election statement — atomic
async function admitPatient(input: AdmissionInput) {
  return await db.transaction(async (tx) => {
    const [patient] = await tx.insert(patients).values(input.patient).returning();
    const [election] = await tx.insert(electionStatements).values({
      patientId: patient.id,
      electionDate: input.electionDate,
      locationId: input.locationId,
      status: 'active',
    }).returning();
    await tx.insert(auditLogs).values({
      userId: input.userId,
      action: 'patient_admitted',
      resourceType: 'Patient',
      resourceId: patient.id,
      locationId: input.locationId,
    });
    return { patient, election };
  });
}
```

---

## 4. Bounded Context Schema Inventory

### 4.1 Identity Context (`contexts/identity/schemas/`)

| Schema File | TypeBox Definition | Purpose |
|-------------|-------------------|---------|
| `user.schema.ts` | `UserSchema` | ABAC-enabled user model |
| `session.schema.ts` | `SessionSchema` | Valkey session reference |
| `role.schema.ts` | `RoleSchema` | RBAC definitions |
| `permission.schema.ts` | `PermissionSchema` | Granular permissions |
| `abacPolicy.schema.ts` | `ABACPolicySchema` | Attribute-based rules |
| `auditLog.schema.ts` | `AuditLogSchema` | HIPAA audit events |
| `breakGlass.schema.ts` | `BreakGlassSchema` | Emergency access (4-hour TTL) |
| `signaturePin.schema.ts` | `SignaturePinSchema` | Clinical signing |

```typescript
export const ABACPolicySchema = Type.Object({
  resource: Type.String(),
  action: Type.Enum({ read: 'read', write: 'write', delete: 'delete' }),
  conditions: Type.Array(Type.Object({
    attribute: Type.String(),
    operator: Type.Enum({ eq: 'eq', in: 'in', contains: 'contains' }),
    value: Type.Unknown()
  })),
  effect: Type.Enum({ allow: 'allow', deny: 'deny' })
});
```

### 4.2 Clinical Context (`contexts/clinical/schemas/`)

```typescript
// patient.schema.ts
export const PatientSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  resourceType: Type.Literal('Patient'),
  identifier: Type.Array(Type.Object({ system: Type.String(), value: Type.String() })),
  name: Type.Array(HumanNameSchema),
  hospiceLocationId: Type.String({ format: 'uuid' }),
  admissionDate: Type.Optional(Type.String({ format: 'date' })),
  dischargeDate: Type.Optional(Type.String({ format: 'date' })),
  gender: Type.Optional(Type.Enum({ male: 'male', female: 'female', other: 'other', unknown: 'unknown' }))
});

// flaccScale.schema.ts
export const FlaccScaleSchema = Type.Object({
  patientId: Type.String({ format: 'uuid' }),
  assessedAt: Type.String({ format: 'date-time' }),
  face: Type.Number({ minimum: 0, maximum: 2 }),
  legs: Type.Number({ minimum: 0, maximum: 2 }),
  activity: Type.Number({ minimum: 0, maximum: 2 }),
  cry: Type.Number({ minimum: 0, maximum: 2 }),
  consolability: Type.Number({ minimum: 0, maximum: 2 }),
  totalScore: Type.Number({ minimum: 0, maximum: 10 }),
  assessedBy: Type.String({ format: 'uuid' })
});

// certification.schema.ts
export const CertificationStatus = Type.Enum({
  draft: 'draft',
  physicianReview: 'physician_review',
  f2fPending: 'f2f_pending',
  signed: 'signed',
  active: 'active',
  expired: 'expired'
});

export const CertificationSchema = Type.Object({
  patientId: Type.String({ format: 'uuid' }),
  benefitPeriodId: Type.String({ format: 'uuid' }),
  status: CertificationStatus,
  startDate: Type.String({ format: 'date' }),
  endDate: Type.String({ format: 'date' }),
  f2fDate: Type.Optional(Type.String({ format: 'date' })),
  physicianId: Type.String({ format: 'uuid' }),
  f2fRequired: Type.Boolean()  // true for period 3+
});
```

### 4.3 Billing Context (`contexts/billing/schemas/`)

```typescript
// noticeOfElection.schema.ts
export const NOESchema = Type.Object({
  patientId: Type.String({ format: 'uuid' }),
  electionDate: Type.String({ format: 'date' }),
  filedDate: Type.String({ format: 'date' }),
  status: Type.Enum({ draft: 'draft', submitted: 'submitted', acknowledged: 'acknowledged', rejected: 'rejected' }),
  lateFilingReason: Type.Optional(Type.String({ minLength: 20 }))
  // Business rule: filedDate ≤ electionDate + 5 business days
  // Enforced in NOEService.validateDeadline() — handles Friday edge case
});

// benefitPeriod.schema.ts
export const BenefitPeriodSchema = Type.Object({
  patientId: Type.String({ format: 'uuid' }),
  periodNumber: Type.Number({ minimum: 1 }),
  startDate: Type.String({ format: 'date' }),
  endDate: Type.String({ format: 'date' }),
  type: Type.Enum({
    initial90: 'initial_90',
    second90: 'second_90',
    subsequent60: 'subsequent_60',
    unlimited60: 'unlimited_60'
  }),
  isActive: Type.Boolean()
});

// hospiceCap.schema.ts
export const CapCalculationSchema = Type.Object({
  hospiceId: Type.String({ format: 'uuid' }),
  capYear: Type.Number(),
  methodology: Type.Enum({ aggregate: 'aggregate', proportional: 'proportional' }),
  aggregateCapAmount: Type.Number(),
  actualReimbursement: Type.Number(),
  beneficiaryYears: Type.Number(),
  liability: Type.Number(),
  alertThreshold: Type.Number({ default: 0.8 })
  // Cap year: Nov 1 (capYear-1) to Oct 31 (capYear)
});
```

### 4.4 Interop Context (`contexts/interoperability/schemas/`)

```typescript
// FHIR R4 patient
export const FhirPatientR4 = Type.Object({
  resourceType: Type.Literal('Patient'),
  id: Type.Optional(Type.String()),
  meta: Type.Optional(FhirMetaSchema),
  identifier: Type.Array(IdentifierSchema),
  active: Type.Optional(Type.Boolean()),
  name: Type.Array(HumanNameSchema),
  gender: Type.Optional(Type.Enum({ male: 'male', female: 'female', other: 'other', unknown: 'unknown' })),
  birthDate: Type.Optional(Type.String({ format: 'date' })),
  deceasedBoolean: Type.Optional(Type.Boolean()),
  deceasedDateTime: Type.Optional(Type.String({ format: 'date-time' }))
});

// FHIR R6 — deceased becomes a union type
export const FhirPatientR6 = Type.Object({
  ...FhirPatientR4.properties,
  deceased: Type.Optional(Type.Union([Type.Boolean(), Type.String({ format: 'date-time' })])),
  link: Type.Optional(Type.Array(Type.Object({
    other: Type.Object({ reference: Type.String() }),
    type: Type.Enum({ replacedBy: 'replaced_by', replaces: 'replaces', refer: 'refer', seeAlso: 'seealso' })
  })))
});

// Transformation adapter
export const PatientAdapter = {
  toR6: (r4: Static<typeof FhirPatientR4>): Static<typeof FhirPatientR6> => ({
    ...r4,
    deceased: r4.deceasedBoolean ?? r4.deceasedDateTime,
    deceasedBoolean: undefined,
    deceasedDateTime: undefined
  }),
  toR4: (r6: Static<typeof FhirPatientR6>): Static<typeof FhirPatientR4> => ({
    ...r6,
    deceasedBoolean: typeof r6.deceased === 'boolean' ? r6.deceased : undefined,
    deceasedDateTime: typeof r6.deceased === 'string' ? r6.deceased : undefined,
    deceased: undefined
  })
};

// SMART on FHIR 2.0
export const SMARTLaunchSchema = Type.Object({
  iss: Type.String({ format: 'uri' }),
  launch: Type.Optional(Type.String()),
  aud: Type.String(),
  scope: Type.String(),
  clientAssertionType: Type.Optional(
    Type.Literal('urn:ietf:params:oauth:client-assertion-type:jwt-bearer')
  ),
  clientAssertion: Type.Optional(Type.String())
});
```

---

## 5. Migration Chronology (TypeBox Era)

### Era 1: Foundation (0000–0019)

- **0000_baseline.sql:** TypeBox-ready tables (JSONB for ABAC)
- **0002_add_email_verified.sql:** Boolean with TypeBox default
- **0007_add_user_abac_fields.sql:** Location scoping foundation
- **0009_add_patient_fields.sql:** Patient core with FHIR mapping + promoted columns

### Era 2: Clinical Core (0020–0039)

- **0020_electronic_signatures.sql:** TypeBox signature schemas
- **0022_medicare_benefit_periods.sql:** Benefit period TypeBox validation
- **0030_detailed_pain_assessments.sql:** 28 TypeBox pain schemas

### Era 3: Advanced Features (0040–0059)

- **0041_abac_system.sql:** TypeBox policy engine
- **0044_asc606_revenue.sql:** Revenue recognition TypeBox rules
- **0048_team_chat.sql:** TypeBox message validation
- **0055_aide_supervision.sql:** HHA 14-day supervision schema (CMS §418.76)

### Era 4: RLS & Security (0100–0125)

- **0103_rls_roles.sql:** Row-level security — parameterized context
- **0104_patients_location_id.sql:** RLS column for TypeBox policies
- **0120_benefit_period_automation.sql:** Automated period triggers
- **0125_fhir_r6_ready.sql:** R6 extension columns

### Reserved Gaps

| Numbers | Status | Reason |
|---------|--------|--------|
| 0060–0099 | Available | General feature additions |
| 0119 | Reserved | Scheduled for HOPE v2 integration |
| 0121, 0122 | Reserved | Scheduled for CAHPS vendor integration |

---

## 6. Valkey Schema Integration

### TypeBox Cache Schemas

```typescript
// config/typebox_compiler.ts — ALL validators compiled here at startup
import { TypeCompiler } from '@sinclair/typebox/compiler';
import { PatientSchema, NOESchema, CapSchema, SessionSchema } from '../contexts';

// ✅ Compiled once at startup, shared across all requests
export const Validators = {
  Patient: TypeCompiler.Compile(PatientSchema),
  NOE: TypeCompiler.Compile(NOESchema),
  CapCalculation: TypeCompiler.Compile(CapSchema),
  Session: TypeCompiler.Compile(SessionSchema),
  // ... all schemas
};
```

```typescript
// schemas/cache.ts
export const SessionSchema = Type.Object({
  userId: Type.String({ format: 'uuid' }),
  locationId: Type.String({ format: 'uuid' }),
  abacAttributes: Type.Object({
    roles: Type.Array(Type.String()),
    permissions: Type.Array(Type.String())
  }),
  breakGlass: Type.Boolean({ default: false }),
  expiresAt: Type.Number() // Unix timestamp
});

// ✅ CORRECT — validator is already compiled at module level in typebox_compiler.ts
export async function getSession(valkey: Valkey, sessionId: string) {
  const data = await valkey.get(`session:${sessionId}`);
  if (!data) return null;

  const parsed = JSON.parse(data);
  // Validators.Session is pre-compiled at startup — O(1) validation
  if (!Validators.Session.Check(parsed)) {
    throw new Error('Invalid session format');
  }
  return parsed as Static<typeof SessionSchema>;
}

// ❌ WRONG — compiles schema on every call, defeats AOT purpose
// export async function getSession(valkey, sessionId) {
//   const validator = TypeCompiler.Compile(SessionSchema); // ← NEVER do this
//   ...
// }
```

### BullMQ Job Schemas

```typescript
// schemas/jobs.ts
export const JobSchemas = {
  'cap-recalculation': Type.Object({
    hospiceId: Type.String({ format: 'uuid' }),
    capYear: Type.Number(),
    methodology: Type.Enum({ aggregate: 'aggregate', proportional: 'proportional' })
  }),
  'noe-deadline-check': Type.Object({
    locationId: Type.String({ format: 'uuid' }),
    checkDate: Type.String({ format: 'date' })
  }),
  'fhir-subscription': Type.Object({
    subscriptionId: Type.String({ format: 'uuid' }),
    resourceType: Type.String(),
    criteria: Type.String(),
    endpoint: Type.String({ format: 'uri' })
  }),
  'aide-supervision-check': Type.Object({
    locationId: Type.String({ format: 'uuid' }),
    checkDate: Type.String({ format: 'date' })
  })
};
```

---

## 7. Core Configuration Files

### drizzle.config.ts

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/contexts/**/schemas/*.ts',
  out: './database/migrations/drizzle',
  dialect: 'postgresql',   // ✅ Correct — drizzle-kit 0.20+
  dbCredentials: {
    url: process.env.DATABASE_URL!  // ✅ Correct key name
  },
  introspect: {
    casing: 'preserve'
  }
});
```

### typebox_compiler.ts

```typescript
import { TypeCompiler } from '@sinclair/typebox/compiler';
import { PatientSchema, NOESchema, CapSchema, SessionSchema } from '../contexts';

// ✅ All schemas compiled ONCE at application startup
// This file is the single registry of all compiled validators
export const Validators = {
  Patient: TypeCompiler.Compile(PatientSchema),
  NOE: TypeCompiler.Compile(NOESchema),
  CapCalculation: TypeCompiler.Compile(CapSchema),
  Session: TypeCompiler.Compile(SessionSchema),
};

// Fastify 5 preValidation hook factory
export function validateBody(schema: keyof typeof Validators) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const validator = Validators[schema];
    if (!validator.Check(request.body)) {
      const errors = [...validator.Errors(request.body)];
      reply.code(400).send({
        resourceType: 'OperationOutcome',
        issue: errors.map(e => ({
          severity: 'error',
          code: 'invalid',
          diagnostics: `${e.path}: ${e.message}`
        }))
      });
    }
  };
}
```

### valkey.ts

```typescript
import Valkey from 'iovalkey';  // ✅ Correct package name

export const valkey = new Valkey.Cluster([
  { host: process.env.VALKEY_HOST, port: 6379 }
], {
  redisOptions: {
    password: process.env.VALKEY_PASSWORD,
    enableReadyCheck: true,
    tls: process.env.NODE_ENV === 'production' ? {} : undefined,
  }
});

export async function initializeValkey() {
  // Verify RedisJSON and RedisSearch modules are loaded
  await valkey.call('JSON.SET', 'test', '$', '{"status":"ready"}');
  await valkey.call('JSON.DEL', 'test', '$');
  console.log('Valkey connection established with RedisJSON');
}
```

---

## 8. Maintenance Notes

### Count Corrections (Verified)

- **Bounded Contexts:** 10 (containing 17 Schema Domains)
- **Migrations:** 126 SQL files (0000–0125 inclusive)
- **TypeBox Schemas:** 346 files (verify with `npm run db:schema-report`)
- **Validation Mode:** AOT compilation (all validators in `typebox_compiler.ts`)

### Common Mistakes to Avoid

| Mistake | Correct Approach |
|---------|-----------------|
| `import Valkey from "iovalis"` | `import Valkey from "iovalkey"` |
| `driver: "pg"` in drizzle config | `dialect: "postgresql"` |
| `TypeCompiler.Compile()` inside a function | Move to module level in `typebox_compiler.ts` |
| `SET app.current_user_id = '${userId}'` | `sql\`SELECT set_config('app.current_user_id', ${userId}, true)\`` |
| No `location_id` column on new tables | Every table serving user data must have `location_id` for RLS |

### RLS Implementation Tiers

- **Tier 1:** Foundation (users, locations) — `set_config` context
- **Tier 2:** Clinical (patients, encounters) — location + user validation
- **Tier 3:** Operational (billing, scheduling) — location + role validation

### FHIR Version Strategy

- Store `fhir_version` as promoted native column in PostgreSQL
- TypeBox adapters transform R4 ↔ R6
- Content negotiation via Fastify 5 `fhirVersion.middleware.ts`
- JSONB storage allows flexible schema evolution toward R6

---

_Hospici Drizzle ORM Reference v3.0 — TypeBox-validated, Parameterized RLS, AOT-compiled_
