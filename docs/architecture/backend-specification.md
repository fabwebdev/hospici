# Hospici Backend Architecture Specification

## Modern Hospice EHR Technical Specification

**Version:** 2.0
**Date:** 2026-03-11
**Status:** Canonical Reference — Pre-Production
**Stack:** Node.js 22 · Fastify 5 · TypeBox · Drizzle ORM · PostgreSQL 18 · Valkey 8
**Frontend UI:** See [`docs/design-system.md`](../design-system.md) for the component library, design tokens, and CMS compliance UI components.

---

## 1. Executive Summary

**Hospici** is a cloud-native Hospice EHR built on **Domain-Driven Design (DDD)** principles with a **Schema-First Architecture** using TypeBox as the single source of truth. The system adheres to **CMS Hospice Conditions of Participation (CoP)** per 42 CFR Part 418, the **HIPAA Security Rule**, and **21st Century Cures Act** interoperability mandates.

### Key Architectural Decisions

| Decision                  | Rationale                                                                     |
| ------------------------- | ----------------------------------------------------------------------------- |
| **Fastify 5**             | Enhanced hook lifecycle, native ESM, improved preSerialization performance    |
| **TypeBox**               | JSON Schema 2020-12 compliance, AOT compilation, automatic OpenAPI generation |
| **Valkey 8**              | Redis OSS drop-in replacement (iovalkey package), RedisJSON support, cost-effective at scale |
| **FHIR R4 + R6 Adapters** | Current R4 implementation with abstraction layer for R6 migration             |
| **Drizzle + TypeBox**     | Type-safe SQL with JSON Schema validation bridge                              |
| **BullMQ on Valkey**      | Persistent job queues with DLQ, retry, and alerting for billing-critical ops  |

---

## 2. Technology Stack

### Core Runtime

- **Runtime:** Node.js 22+ (LTS) with ES Modules
- **Framework:** Fastify 5.x
- **Language:** TypeScript 5.4+ (strict mode, verbatimModuleSyntax)

### Data & Validation

- **ORM:** Drizzle ORM (`dialect: "postgresql"`) with TypeBox schema synthesis
- **Validation:** TypeBox 0.32+ (AOT-compiled validators, module-level instantiation)
- **Database:** PostgreSQL 18+ (RLS, pgcrypto, pgvector, JSONB)
- **Cache/Queue:** Valkey 8.0+ (RedisJSON, RedisSearch, BullMQ-compatible)

### Security & Auth

- **Auth:** Better Auth (TypeBox-validated schemas)
- **Session Store:** Valkey (TTL-based, location-scoped)
- **FHIR Auth:** SMART on FHIR 2.0 (Backend Services)
- **Encryption:** AES-256 (PHI at rest via pgcrypto), TLS 1.3 (in transit)

### Interoperability

- **FHIR Version:** R4 (4.0.1) with R6 transformation adapters
- **Schema Generation:** TypeBox → OpenAPI 3.1 + FHIR StructureDefinition
- **SMART Scopes:** See §11 Scope Registry

---

## 3. Fastify 5 + TypeBox Integration

### Validation Strategy

TypeBox serves as the **single source of truth** for runtime validation, TypeScript types, and OpenAPI schemas. Validators are compiled **once at module initialization** using `TypeCompiler.Compile()` — never inside request handlers or hot paths.

```typescript
// schemas/patient.schema.ts
import { Type, Static } from "@sinclair/typebox";
import { TypeCompiler } from "@sinclair/typebox/compiler";

export const PatientSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    resourceType: Type.Literal("Patient"),
    identifier: Type.Array(IdentifierSchema),
    name: Type.Array(HumanNameSchema),
    gender: Type.Optional(
      Type.Enum({
        male: "male",
        female: "female",
        other: "other",
        unknown: "unknown",
      }),
    ),
    birthDate: Type.String({ format: "date" }),
    address: Type.Optional(Type.Array(AddressSchema)),
    // Extension point for R6 migration
    _gender: Type.Optional(FhirElementSchema),
  },
  {
    additionalProperties: false,
    description: "Hospici Patient Resource (FHIR R4 compatible)",
  },
);

// ✅ Compile ONCE at module level — never inside request handlers
export const PatientValidator = TypeCompiler.Compile(PatientSchema);

export type Patient = Static<typeof PatientSchema>;
```

### Fastify 5 Route Pattern

```typescript
// routes/patient.routes.ts
import { FastifyInstance } from "fastify";

export default async function patientRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/fhir/r4/Patient",
    {
      schema: {
        body: PatientSchema,
        response: {
          201: PatientSchema,
          400: OperationOutcomeSchema,
        },
      },
      preValidation: async (request, reply) => {
        if (!PatientValidator.Check(request.body)) {
          const errors = [...PatientValidator.Errors(request.body)];
          reply.code(400).send({
            resourceType: "OperationOutcome",
            issue: errors.map((e) => ({
              severity: "error",
              code: "invalid",
              diagnostics: `${e.path}: ${e.message}`,
            })),
          });
        }
      },
    },
    async (request, reply) => {
      const patient = await createPatient(request.body);
      return patient;
    },
  );
}
```

### Hook Lifecycle (Fastify 5)

Order of execution for security and compliance:

1. `onRequest` — Helmet headers, CORS, APM
2. `preParsing` — Request logging
3. `preValidation` — TypeBox AOT schema validation
4. `preHandler` — ABAC authorization, RLS context injection (parameterized — see §10)
5. `preSerialization` — PHI encryption, HIPAA audit logging
6. `onSend` — Response compression
7. `onResponse` — Metrics collection

---

## 4. Valkey Infrastructure (Redis-Compatible)

### Installation

```bash
npm install iovalkey bullmq
```

> **Critical:** The correct npm package is `iovalkey`, not `iovalis`. Use `import Valkey from "iovalkey"` throughout the codebase.

### Configuration

```typescript
// config/valkey.ts
import Valkey from "iovalkey";

export const valkey = new Valkey.Cluster(
  [{ host: process.env.VALKEY_HOST, port: 6379 }],
  {
    redisOptions: {
      password: process.env.VALKEY_PASSWORD,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      tls: process.env.NODE_ENV === "production" ? {} : undefined,
    },
  },
);

// Modules: RedisJSON, RedisSearch, RedisBloom (rate limiting)
```

### Usage Patterns

#### Session Management (Location-Scoped)

```typescript
// Multi-tenancy session storage
await valkey.setex(
  `session:${locationId}:${userId}`,
  3600,
  JSON.stringify({
    userId,
    locationId,
    abacAttributes,
    breakGlass: false,
  }),
);
```

#### FHIR Resource Caching (RedisJSON)

```typescript
// Cache FHIR Patient $everything bundles
await valkey.call(
  "JSON.SET",
  `fhir:Patient:${patientId}:everything`,
  "$",
  JSON.stringify(bundle),
);

// Search index
await valkey.call(
  "FT.CREATE", "patient-idx", "ON", "JSON",
  "PREFIX", "1", "fhir:Patient:",
  "SCHEMA",
  "$.name[0].family", "AS", "family", "TEXT",
  "$.birthDate", "AS", "birthDate", "TAG",
);
```

#### BullMQ Job Queue with DLQ

```typescript
import { Queue, Worker, QueueEvents } from "bullmq";

const claimQueue = new Queue("claim-processing", {
  connection: valkey,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: { count: 100 },
    removeOnFail: false, // Keep failed jobs for DLQ inspection
  },
});

// Dead Letter Queue: jobs that exhaust all retries are moved here
const claimDLQ = new Queue("claim-processing-dlq", { connection: valkey });

// QueueEvents for failure alerting
const queueEvents = new QueueEvents("claim-processing", { connection: valkey });

queueEvents.on("failed", async ({ jobId, failedReason }) => {
  const job = await claimQueue.getJob(jobId);
  if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
    // Move to DLQ
    await claimDLQ.add("dlq-claim", { ...job.data, failedReason, originalJobId: jobId });
    // Alert on-call
    await alertService.send({
      severity: "critical",
      channel: "ops",
      message: `Claim job ${jobId} exhausted all retries: ${failedReason}`,
    });
  }
});

// Manual requeue from DLQ
export async function requeueFromDLQ(dlqJobId: string) {
  const job = await claimDLQ.getJob(dlqJobId);
  if (!job) throw new Error("DLQ job not found");
  await claimQueue.add("scrub-claim", job.data.originalData, { attempts: 1 });
  await job.remove();
}
```

### Job Failure Handling

Every BullMQ queue must implement the following pattern:

| Stage | Action |
|---|---|
| Attempt 1-3 | Exponential backoff (1s, 2s, 4s) |
| All retries exhausted | Move to `{queue-name}-dlq` |
| DLQ entry | Alert ops channel (Slack/PagerDuty) |
| Manual intervention | Ops engineer reviews, fixes data, calls `requeueFromDLQ()` |
| Post-resolution | Remove from DLQ, add to audit log |

---

## 5. FHIR R4/R6 Future-Proofing

### Version Abstraction Layer

```typescript
// contexts/interoperability/fhir/version-adapter.ts
export interface FhirVersionAdapter<T extends FhirResource> {
  version: "4.0" | "6.0";
  schema: TSchema;
  validate: (data: unknown) => data is T;
  transform?: {
    toR6: (r4: T) => FhirR6<T>;
    toR4: (r6: FhirR6<T>) => T;
  };
}

export const PatientAdapter: FhirVersionAdapter<Patient> = {
  version: "4.0",
  schema: FhirPatientR4Schema,
  validate: (data): data is Patient => PatientValidator.Check(data),
  transform: {
    toR6: (r4) => ({
      ...r4,
      deceased: r4.deceasedBoolean || r4.deceasedDateTime,
      link: undefined,
      _gender: { id: "gender-extension" },
    }),
    toR4: (r6) => ({
      ...r6,
      deceasedBoolean: typeof r6.deceased === "boolean" ? r6.deceased : undefined,
      deceasedDateTime: typeof r6.deceased === "string" ? r6.deceased : undefined,
    }),
  },
};
```

### Content Negotiation

```typescript
// middleware/fhirVersion.middleware.ts
fastify.addHook("preHandler", async (request, reply) => {
  const accept = request.headers.accept || "";
  const versionMatch = accept.match(/fhirVersion=(\d+\.\d+)/);
  request.fhirVersion = versionMatch ? versionMatch[1] : "4.0";
  if (request.fhirVersion === "6.0") request.transformToR6 = true;
});
```

---

## 6. Domain-Driven Architecture

### Bounded Contexts

```
src/contexts/
├── identity/              # Auth, ABAC, Audit, Break-glass
├── clinical/              # Patients, Encounters, Assessments, Pain
├── billing/               # NOE/NOTR, Hospice Cap, Claims, Revenue
├── documentation/         # eSignatures, Notes, Forms
├── scheduling/            # Staff, IDG, Visits
├── interoperability/      # FHIR, SMART, CMS, eRx, DSM
├── analytics/             # QAPI, CAHPS, Reporting
├── communication/         # Chat, Notifications
└── shared-kernel/         # Money, DateRange, PatientId (value objects)
```

### Shared Kernel Value Objects

```typescript
// shared-kernel/value-objects.ts
export const MoneySchema = Type.Object({
  currency: Type.Literal("USD"),
  amount: Type.Number({ minimum: 0, multipleOf: 0.01 }),
}, { description: "CMS-compliant monetary value" });

export const DateRangeSchema = Type.Object({
  start: Type.String({ format: "date" }),
  end: Type.Optional(Type.String({ format: "date" })),
}, { description: "Inclusive benefit period date range" });
```

---

## 7. Database Architecture

### Migration Strategy

- **Location:** `database/migrations/drizzle/`
- **Format:** `XXXX_descriptive_name.sql`
- **Tool:** `drizzle-kit` with `dialect: "postgresql"` (not `driver: "pg"`)
- **Post-hook:** TypeBox validator generation after each migration
- **Baseline:** `0000_baseline.sql` (users, locations, audit foundation)

### Column Promotion Policy

This table defines which fields are always promoted to native PostgreSQL columns (for indexing/RLS) versus stored exclusively in JSONB.

| Field Category | Storage Strategy | Rationale |
|---|---|---|
| `location_id` | **Native column** | Required for all RLS policies |
| `patient_id` | **Native column** | FK for all clinical tables |
| `admission_date`, `discharge_date` | **Native column** | Date range queries on cap calculations |
| `fhir_version` | **Native column** | Content negotiation filtering |
| `status` (NOE, claim, benefit period) | **Native column** | State machine queries and indexes |
| `created_at`, `updated_at` | **Native column** | Audit and TTL queries |
| FHIR narrative fields | **JSONB only** | Flexible, queryable via GIN index |
| Assessment scores | **JSONB only** | Highly variable structure |
| ABAC attributes | **JSONB only** | Policy engine flexibility |

### Row-Level Security (RLS)

All PHI tables use PostgreSQL RLS. Context is injected via parameterized Drizzle `sql` template — **never via string interpolation.**

```typescript
// ✅ CORRECT — parameterized RLS context injection
fastify.addHook("preHandler", async (request) => {
  const userId = request.user.id;       // uuid string from verified JWT
  const locationId = request.locationId; // uuid string from verified session

  // Use sql tagged template — safe from injection
  await db.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
  await db.execute(sql`SELECT set_config('app.current_location_id', ${locationId}, true)`);
});

// ❌ NEVER do this — string interpolation is unsafe even with uuid values
// await db.execute(`SET app.current_user_id = '${userId}'`);
```

**RLS Policies (canonical examples):**

```sql
-- Patients: location isolation
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY patients_location_read ON patients
  FOR SELECT
  USING (location_id = current_setting('app.current_location_id')::uuid);

CREATE POLICY patients_location_write ON patients
  FOR INSERT WITH CHECK (location_id = current_setting('app.current_location_id')::uuid);

-- Audit logs: append-only (no update or delete)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_insert ON audit_logs
  FOR INSERT WITH CHECK (true);

CREATE POLICY audit_logs_select ON audit_logs
  FOR SELECT USING (
    location_id = current_setting('app.current_location_id')::uuid
  );

-- No UPDATE or DELETE policy is intentional — audit logs are immutable

-- Billing: location + role restriction
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY claims_billing_read ON claims
  FOR SELECT USING (
    location_id = current_setting('app.current_location_id')::uuid
    AND current_setting('app.current_role') IN ('admin', 'billing', 'supervisor')
  );
```

### Transaction Patterns

For operations that must be atomic, use Drizzle's `db.transaction()`. The following patterns are mandatory:

```typescript
// NOE filing + benefit period creation (atomic)
async function fileNOE(input: NOEInput): Promise<NOEResult> {
  return await db.transaction(async (tx) => {
    // 1. Create benefit period
    const [benefitPeriod] = await tx
      .insert(benefitPeriods)
      .values({
        patientId: input.patientId,
        periodNumber: input.periodNumber,
        startDate: input.electionDate,
        endDate: addDays(input.electionDate, 90),
        type: "initial_90",
        locationId: input.locationId,
      })
      .returning();

    // 2. Create NOE linked to benefit period
    const [noe] = await tx
      .insert(noticeOfElection)
      .values({
        patientId: input.patientId,
        benefitPeriodId: benefitPeriod.id,
        electionDate: input.electionDate,
        filingDeadline: addBusinessDays(input.electionDate, 5),
        status: "draft",
        locationId: input.locationId,
      })
      .returning();

    // 3. Audit log entry (same transaction)
    await tx.insert(auditLogs).values({
      userId: input.userId,
      action: "noe_created",
      resourceType: "NOE",
      resourceId: noe.id,
      locationId: input.locationId,
    });

    return { noe, benefitPeriod };
  });
  // If any step throws, the entire transaction rolls back
}

// Claim generation + audit (atomic)
async function generateClaim(claimData: ClaimInput): Promise<Claim> {
  return await db.transaction(async (tx) => {
    const [claim] = await tx.insert(claims).values(claimData).returning();
    await tx.insert(auditLogs).values({
      userId: claimData.userId,
      action: "claim_generated",
      resourceType: "Claim",
      resourceId: claim.id,
      locationId: claimData.locationId,
    });
    return claim;
  });
}
```

---

## 8. CMS Compliance & Business Logic

### NOE/NOTR State Machine

```typescript
// schemas/noe.schema.ts
export const NOESchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  patientId: Type.String({ format: "uuid" }),
  status: Type.Enum({
    draft: "draft",
    submitted: "submitted",
    acknowledged: "acknowledged",
    rejected: "rejected",
    corrected: "corrected",
  }),
  electionDate: Type.String({ format: "date" }),
  submittedAt: Type.Optional(Type.String({ format: "date-time" })),
  filingDeadline: Type.String({ format: "date" }),
  lateFilingReason: Type.Optional(Type.String({ minLength: 20 })),
});

// NOE 5-day rule — handles Friday edge case
export const validateNOEDeadline = (noe: Static<typeof NOESchema>): void => {
  const electionDate = new Date(noe.electionDate);
  const deadline = addBusinessDays(electionDate, 5); // skips weekends + federal holidays

  const isLate = new Date() > deadline;
  if (isLate && !noe.lateFilingReason) {
    throw new NOEValidationError(
      "Late NOE filing requires a justification of at least 20 characters.",
      { deadline: deadline.toISOString(), electionDate: noe.electionDate },
    );
  }
};

// Friday edge case: election on Friday → deadline is following Friday (5 business days)
// Federal holidays are excluded via the addBusinessDays() utility
```

### Benefit Period Rules

| Period | Duration | Notes |
|---|---|---|
| Period 1 | 90 days | Initial election |
| Period 2 | 90 days | First recertification |
| Period 3+ | 60 days | Unlimited subsequent; F2F required within 30 days prior |
| Concurrent care | Special | Medicare Advantage patients only |

- Alert at day 75 (15 days before expiry)
- Block recertification if F2F not documented (period 3+)
- Cap year boundary: November 1 reset; partial-year proration applies

### Hospice Cap Calculation

```typescript
// services/cap-calculator.service.ts — monthly BullMQ job
export class CapCalculationJob {
  async process(data: Static<typeof CapCalculationSchema>) {
    // Cap year: Nov 1 – Oct 31
    const capYearStart = new Date(`${data.capYear - 1}-11-01`);
    const capYearEnd = new Date(`${data.capYear}-10-31`);

    const liability = Math.max(0, data.actualReimbursement - data.aggregateCapAmount);

    if (data.actualReimbursement / data.aggregateCapAmount > data.alertThreshold) {
      await notificationService.sendCapAlert({
        hospiceId: data.hospiceId,
        liability,
        threshold: data.alertThreshold,
        capYear: data.capYear,
        capYearStart: capYearStart.toISOString(),
        capYearEnd: capYearEnd.toISOString(),
      });
    }

    return { liability, status: liability > 0 ? "overage" : "under_cap" };
  }
}
```

### HHA Aide Supervision (42 CFR §418.76)

CMS requires hospice aides to be supervised every 14 days. Hospici enforces this via the scheduling context:

```typescript
// contexts/scheduling/schemas/aideSupervision.schema.ts
export const AideSupervisionSchema = Type.Object({
  patientId: Type.String({ format: "uuid" }),
  aideId: Type.String({ format: "uuid" }),
  supervisorId: Type.String({ format: "uuid" }), // RN or supervising clinician
  supervisionDate: Type.String({ format: "date" }),
  nextSupervisionDue: Type.String({ format: "date" }), // supervisionDate + 14 days
  method: Type.Enum({
    inPerson: "in_person",
    virtual: "virtual",
    observation: "observation",
  }),
  findings: Type.String({ minLength: 10 }),
  actionRequired: Type.Boolean(),
  actionTaken: Type.Optional(Type.String()),
});

// BullMQ daily job checks for overdue supervisions
// Supervisors receive alert 2 days before 14-day deadline
```

---

## 9. Background Jobs (BullMQ + Valkey)

### Job Registry

```typescript
// jobs/schemas/index.ts
export const JobSchemas = {
  "cap-recalculation": CapCalculationSchema,
  "noe-deadline-check": NOEDeadlineSchema,
  "idg-compliance": IDGComplianceSchema,
  "claim-scrub": ClaimScrubSchema,
  "fhir-subscription": FhirSubscriptionSchema,
  "audit-archive": AuditArchiveSchema,
  "aide-supervision-check": AideSupervisionCheckSchema,
  "benefit-period-alert": BenefitPeriodAlertSchema,
  // HOPE quality reporting (effective 2025-10-01, replaces HIS)
  "hope-submission": HOPEiQIESSubmissionSchema,
  "hope-deadline-check": HOPEDeadlineSchema,       // daily 06:00 — flags assessments near window expiry
  "hqrp-period-close": HOPEReportingPeriodSchema,  // quarterly — aggregates measures for CMS submission
} as const;

export type JobData = {
  [K in keyof typeof JobSchemas]: Static<(typeof JobSchemas)[K]>;
};
```

| Job | Trigger | Schema | DLQ |
|---|---|---|---|
| `capRecalculation` | Scheduled (monthly, Nov 2) | `CapCalculationSchema` | `cap-dlq` |
| `noeDeadlineAlert` | Scheduled (daily 06:00) | `NOEDeadlineSchema` | `noe-dlq` |
| `idgCompliance` | Scheduled (daily 06:00) | `IDGComplianceSchema` | `idg-dlq` |
| `claimScrubber` | Queue-driven | `ClaimScrubSchema` | `claim-dlq` |
| `fhirSubscription` | Webhook | `FhirSubscriptionSchema` | `fhir-dlq` |
| `auditArchive` | Scheduled (weekly) | `AuditArchiveSchema` | `audit-dlq` |
| `aideSupervisionCheck` | Scheduled (daily 06:00) | `AideSupervisionSchema` | `aide-dlq` |
| `hopeSubmission` | Event-driven (assessment completed) | `HOPEiQIESSubmissionSchema` | `hope-submission-dlq` |
| `hopeDeadlineCheck` | Scheduled (daily 06:00) | `HOPEDeadlineSchema` | `hope-dlq` |
| `hqrpPeriodClose` | Scheduled (quarterly) | `HOPEReportingPeriodSchema` | `hqrp-dlq` |

---

## 10. Security Implementation

### PHI Field Schemas

```typescript
// security/schemas/phi.schema.ts
export const PhiFieldSchema = Type.Object({
  ssn: Type.String({
    pattern: "^\\d{3}-\\d{2}-\\d{4}$",
    description: "Encrypted at rest via pgcrypto",
  }),
  mrn: Type.String({ minLength: 5, maxLength: 50 }),
  dob: Type.String({ format: "date" }),
  lastAccessed: Type.Optional(Type.String({ format: "date-time" })),
  accessLog: Type.Array(
    Type.Object({
      userId: Type.String({ format: "uuid" }),
      timestamp: Type.String({ format: "date-time" }),
      action: Type.Enum({ view: "view", edit: "edit", delete: "delete" }),
    }),
  ),
});

export const BreakGlassSchema = Type.Object({
  userId: Type.String({ format: "uuid" }),
  reason: Type.String({ minLength: 20 }),
  patientId: Type.String({ format: "uuid" }),
  requestedAt: Type.String({ format: "date-time" }),
  expiresAt: Type.String({ format: "date-time" }), // 4-hour max TTL
  approvedBy: Type.Optional(Type.String({ format: "uuid" })),
});
```

### Middleware Stack (Correct Hook Order)

```typescript
// app.ts — Fastify 5 plugin registration
await fastify.register(helmet);
await fastify.register(cors, { origin: process.env.ALLOWED_ORIGINS?.split(",") });
await fastify.register(rateLimit, {
  store: new ValkeyStore(valkey),
  max: 100,
  timeWindow: "1 minute",
});

// ✅ CORRECT — parameterized RLS context (no string interpolation)
fastify.addHook("preHandler", async (request) => {
  const ability = defineAbilityFor(request.user);
  const userId = request.user.id;
  const locationId = request.locationId;

  // Safe: uses parameterized set_config function call
  await db.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
  await db.execute(sql`SELECT set_config('app.current_location_id', ${locationId}, true)`);

  request.auditContext = await auditService.createContext(request);
});

fastify.addHook("preSerialization", async (request, _reply, payload) => {
  if (request.routeConfig?.encryptPhi) {
    return encryptPhiFields(payload);
  }
  return payload;
});
```

---

## 11. Interoperability Specifications

### FHIR R4 Endpoints

| Resource          | Operations                | Notes                     |
| ----------------- | ------------------------- | ------------------------- |
| Patient           | CRUD, $match, $everything | R6 adapter ready          |
| Encounter         | CRUD, Search              | Level of care validation  |
| Observation       | CRUD                      | Pain assessments, Vitals  |
| CarePlan          | CRUD                      | CMS certification linkage |
| Claim             | Create, Search            | X12 837i mapping          |
| DocumentReference | CRUD                      | CDA attachment support    |

### SMART on FHIR 2.0 — Scope Registry

Hospici exposes the following SMART scopes. All scopes require a valid JWT issued by the Hospici authorization server.

| Scope | Access Level | Resources Governed | Notes |
|---|---|---|---|
| `patient/*.read` | Patient-context | All clinical resources for authenticated patient | App-launch only |
| `patient/*.write` | Patient-context | Observations, CarePlan updates | Requires patient consent |
| `user/Patient.read` | User-context | Patient demographics, identifiers | Clinician-facing apps |
| `user/Patient.write` | User-context | Patient updates (non-PHI fields) | Supervisor+ role |
| `user/Encounter.read` | User-context | Visit records | All clinical roles |
| `user/Observation.write` | User-context | Clinical assessments | Clinician role only |
| `system/Patient.read` | Backend services | Bulk patient export | FHIR $export, CMS submissions |
| `system/Claim.write` | Backend services | 837i submission | Billing system integration |
| `system/*.read` | Backend services | All resources | Reserved for CMS/payer integrations |

### Direct Secure Messaging (DSM)

- **XDM Packaging:** ZIP with C-CDA documents
- **Validation:** TypeBox schemas for XDM metadata
- **Transport:** SMTP + TLS 1.3 to HISP (Health Information Service Provider)

---

## 12. Development Phases

### Phase Exit Criteria

Each phase requires explicit sign-off before the next begins. The table below defines dependencies and exit gates.

### Phase 1: Foundation (Weeks 1–3)

**Depends on:** Repository setup, environment provisioned

- [ ] Fastify 5 + TypeBox integration (AOT compiled validators, module-level only)
- [ ] Valkey cluster setup (iovalkey package, RedisJSON + RedisSearch modules verified)
- [ ] Drizzle ORM with `dialect: "postgresql"` — no `driver: "pg"`
- [ ] RLS foundation (users, locations) with parameterized context injection
- [ ] Base FHIR R4 Patient/Encounter with R6 stubs
- [ ] Root directory cleanup (migration runners moved to `scripts/database/`)

**Exit gate:** `npm run test:rls` passes; `npm run test:schemas` passes; no string-interpolated SET statements in codebase.

### Phase 2: Clinical Core (Weeks 4–7)

**Depends on:** Phase 1 exit gate signed off

- [ ] Pain assessment suite (FLACC, PAINAD, Wong-Baker, NRS TypeBox schemas)
- [ ] Admission workflow with CMS business rules
- [ ] IDG meeting scheduling (15-day enforcement — hard block, not warning)
- [ ] Care planning (goals, interventions)
- [ ] Valkey-backed FHIR $everything operation
- [ ] HHA aide supervision schema and 14-day BullMQ job

**Exit gate:** Clinical E2E test suite passes; IDG 15-day block verified; aide supervision job runs in staging.

### Phase 3: Compliance (Weeks 8–11)

**Depends on:** Phase 2 exit gate; RLS Tier 2 must be complete before billing

- [ ] NOE/NOTR workflows (TypeBox state machines + Friday edge case test)
- [ ] Hospice Cap calculation engine (BullMQ/Valkey, Nov 1 cap year boundary)
- [ ] Benefit period automation (90d/90d/60d logic + F2F block for period 3+)
- [ ] Concurrent care revocation workflow
- [ ] Electronic signatures (TypeBox + tamper-evident)
- [ ] RLS Tier 2 (clinical tables) — **required before Phase 4**
- [ ] **HOPE quality reporting** (replaces HIS, effective 2025-10-01) — see `docs/compliance/hope-reporting.md`
  - [ ] `hope_assessments`, `hope_iqies_submissions`, `hope_reporting_periods` migrations + RLS
  - [ ] HOPE-A / HOPE-UV / HOPE-D routes wired at `/api/v1/hope`
  - [ ] 7-day window enforcement (`HOPEWindowViolationError`) for HOPE-A and HOPE-D
  - [ ] BullMQ `hope-submission` queue → iQIES REST API (DLQ: `hope-submission-dlq`)
  - [ ] BullMQ `hope-deadline-check` daily 06:00 job (near-expiry compliance alerts)
  - [ ] BullMQ `hqrp-period-close` quarterly job (aggregates NQF #3235, #3633, #3634, HCI)

**Exit gate:** NOE deadline tests pass including Friday edge case; cap overage alert fires at 80% threshold; RLS Tier 2 verified; HOPE-A 7-day window enforcement test passes; HQRP NQF #3235 numerator calculates correctly for test dataset; `hope-submission` DLQ alert fires on simulated iQIES rejection.

### Phase 4: Revenue Cycle (Weeks 12–15)

**Depends on:** Phase 3 exit gate (RLS Tier 2 must be complete)

- [ ] Claim generation (837i) with TypeBox validation and atomic transaction
- [ ] ERA 835 parsing and reconciliation
- [ ] Denial management (CARC/RARC TypeBox enums)
- [ ] Prior authorization workflows
- [ ] ASC 606 revenue recognition
- [ ] BullMQ DLQ configured for all billing queues

**Exit gate:** 837i claim validates against X12 validator; ERA 835 round-trip test passes; DLQ alert fires on simulated failure.

### Phase 5: Interoperability (Weeks 16–19)

**Depends on:** Phase 4 exit gate

- [ ] SMART on FHIR 2.0 (Backend Services) — all scopes from §11 registry
- [ ] Bulk FHIR $export with Valkey progress tracking
- [ ] eRx (DoseSpot/NewCrop) integration
- [ ] Direct Secure Messaging (DSM)
- [ ] R6 transformation layer testing
- [ ] ONC information blocking exception documentation

**Exit gate:** SMART scope tests pass; bulk export produces valid NDJSON; eRx round-trip tested in staging.

### Phase 6: Performance & Scale (Weeks 20–22)

**Depends on:** Phase 5 exit gate

- [ ] TypeBox AOT compilation verified (no runtime `TypeCompiler.Compile()` calls)
- [ ] PostgreSQL JSONB GIN indexing for FHIR queries
- [ ] Valkey RedisJSON for complex Bundle caching
- [ ] Read replica configuration for analytics queries
- [ ] Load testing (k6): 500 concurrent users, FHIR R4/R6 dual-mode

**Exit gate:** k6 load test passes at 500 concurrent; p95 latency < 200ms for FHIR reads; zero `TypeCompiler.Compile()` calls detected in hot paths via static analysis.

---

## 13. Configuration Files

### drizzle.config.ts

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/contexts/**/schemas/*.ts",
  out: "./database/migrations/drizzle",
  dialect: "postgresql",            // ✅ Correct — not driver: "pg" (deprecated)
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  introspect: {
    casing: "preserve",
  },
});
```

### valkey.conf (Production)

```conf
# Valkey 8.0 Configuration
port 6379
cluster-enabled yes
cluster-config-file nodes.conf
cluster-node-timeout 5000
appendonly yes
appendfsync everysec
loadmodule /usr/lib/valkey/modules/redisjson.so
loadmodule /usr/lib/valkey/modules/redisearch.so
maxmemory-policy allkeys-lru
requirepass ${VALKEY_PASSWORD}
```

---

## 14. Testing Strategy

### TypeBox Schema Testing

```typescript
// tests/schemas/patient.test.ts
import { PatientValidator } from "../../src/contexts/clinical/patient/schemas";

describe("Patient Schema Validation", () => {
  it("validates a correct FHIR R4 patient", () => {
    const valid = {
      resourceType: "Patient",
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: [{ family: "Doe", given: ["John"] }],
      gender: "male",
      birthDate: "1970-01-01",
    };
    expect(PatientValidator.Check(valid)).toBe(true);
  });

  it("rejects NOE submitted after 5 business days without justification", () => {
    // Friday election date: next filing deadline crosses a weekend
    const fridayElection = "2026-03-06"; // Friday
    const mondayFiled = "2026-03-16";    // More than 5 business days later
    expect(() => validateNOEDeadline({ electionDate: fridayElection, filedDate: mondayFiled }))
      .toThrow("Late NOE filing requires a justification");
  });
});
```

### Integration Testing

- **Pact:** Consumer-driven contracts for FHIR APIs
- **k6:** Load testing with FHIR R4/R6 content negotiation, 500 concurrent users
- **Drizzle:** Testcontainers with PostgreSQL 18 + RLS policy verification
- **BullMQ:** DLQ failure simulation tests for all billing queues

---

## 15. Deployment Checklist

### Pre-Deployment

- [ ] `iovalkey` package installed (not `iovalis`)
- [ ] Drizzle config uses `dialect: "postgresql"` (not `driver: "pg"`)
- [ ] TypeBox validators compiled at module level only (no hot-path compilation)
- [ ] RLS context injected via parameterized `set_config` (no string interpolation)
- [ ] Valkey cluster health check (RedisJSON + RedisSearch modules loaded)
- [ ] RLS policies enabled on all PHI tables
- [ ] FHIR R4/R6 transformation tests passing
- [ ] CMS business rule validation active (NOE 5-day, IDG 15-day, aide 14-day)

### Security

- [ ] Encryption keys rotated (AES-256)
- [ ] Audit logging verified (all PHI touchpoints logged)
- [ ] Break-glass procedures tested
- [ ] SMART on FHIR JWKS endpoints validated
- [ ] Valkey authentication enabled (requirepass set)
- [ ] BAA signed with all third-party vendors (Valkey host, DoseSpot, SMTP provider)

### Compliance

- [ ] HIPAA risk assessment signed off
- [ ] CMS connectivity tested (FISS/DDE for Medicare)
- [ ] 6-year audit log retention configured
- [ ] Disaster recovery tested (Valkey AOF persistence + PG point-in-time recovery)
- [ ] SMART scope registry matches deployed authorization server
- [ ] ONC information blocking exceptions documented and reviewed by counsel

---

_Hospici Backend Specification v2.0 — TypeBox-First, CMS-Compliant, FHIR R4/R6 Ready_
