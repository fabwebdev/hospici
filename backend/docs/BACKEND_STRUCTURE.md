# Hospici Backend Structure

> **Stack:** Node.js 22 · Fastify 5 · TypeBox · Drizzle ORM · PostgreSQL 18 · Valkey 8 (iovalkey) · Better Auth · Socket.IO

---

## Repository Topology

Hospici is organized as a monorepo. The `Backend/` directory is one of several top-level packages:

```
hospici/                         # Monorepo root
├── Backend/                     # This document — Fastify 5 API server
├── Frontend/                    # Next.js 15 clinical web application
├── packages/
│   ├── shared-types/            # TypeBox schemas shared across Backend + Frontend
│   ├── fhir-adapters/           # R4/R6 transformation utilities
│   └── cms-rules/               # CMS business rule validators
├── docker-compose.yml           # Local dev: PG 18 + Valkey 8 + services
├── turbo.json                   # Turborepo pipeline configuration
└── package.json                 # Workspace root
```

The `Backend/` directory is the Fastify 5 API server. It is the only package that connects directly to PostgreSQL and Valkey. Frontend communicates exclusively through the Backend API.

---

## AI Development Guidelines

Two files at the root of `Backend/` govern AI-assisted development:

- **`CLAUDE.md`** — Rules for Claude (Anthropic) code generation: TypeBox-first patterns, forbidden antipatterns, RLS safety rules, migration conventions
- **`AGENTS.md`** — Multi-agent orchestration instructions for the OpenClaw agent swarm (Warden, Clara, Axel, Rex, Cora, Petra)

These files are mandatory reading for any LLM before generating code in this repository. See the root-level `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, and `OPENAI.md` for per-model rules.

---

## Root Files

```
Backend/
├── .dockerignore              # Docker build exclusions
├── .editorconfig              # Editor consistency rules
├── .eslintrc.json             # ESLint configuration (Biome preferred)
├── .gitignore                 # Git exclusions
├── .prettierrc                # Code formatting (Biome preferred)
├── AGENTS.md                  # Multi-agent orchestration rules
├── CLAUDE.md                  # Claude AI coding rules (TypeBox-first)
├── Dockerfile                 # Container build (Node 22 Alpine)
├── Makefile                   # Build automation
├── README.md                  # Project overview
├── drizzle.config.ts          # Drizzle ORM (dialect: "postgresql")
├── eslint.config.js           # Modern ESLint flat config
├── vitest.config.ts           # Unit test configuration
├── vitest.contract.config.ts  # Contract test configuration (Pact)
├── vitest.integration.config.ts # Integration test configuration
├── icd10-codes.txt            # Medical code reference data
├── package*.json              # Dependencies & lock files
└── server.ts                  # Application entry point (Fastify 5)
```

> **Root cleanup note:** Scripts previously at root level (`fix-crud-controllers.js`, `fix-select-antipattern.js`, `run-*-migration*.js`) have been relocated to `scripts/database/` as part of Phase 1 cleanup. Lint report artifacts (`lint-errors.txt`, `npm-audit-*.json`) are git-ignored and generated on-demand.

---

## Directory Structure

```text
Backend/
├── database/                  # Migration assets (outside runtime)
│   ├── config/                # DB configuration files
│   └── migrations/
│       └── drizzle/           # TypeBox-validated SQL migrations (0000–0125)
├── docker/                    # Docker Compose files (dev/test/prod)
│   └── valkey/                # Valkey 8 cluster configuration (AOF + RDB)
├── docs/                      # API documentation
│   ├── openapi.yaml           # OpenAPI 3.1 spec (TypeBox-generated)
│   ├── openapi.json           # JSON spec alternative
│   ├── scalar-ui.html         # Self-hosted Scalar UI
│   ├── ALL_ROUTES.md          # Complete route inventory
│   ├── PROJECT_STRUCTURE.md   # Narrative documentation
│   ├── ALL_ROUTES_DETAILS/    # Detailed endpoint docs
│   └── cms-compliance/
│       ├── noe-notr/          # NOE filing rules + Friday edge case
│       ├── cap-calculation/   # Cap year boundary (Nov 1) guidelines
│       ├── aide-supervision/  # HHA 14-day supervision rules
│       └── fhir-mapping/      # FHIR R4/R6 transformation rules
├── postman/                   # Postman collections
├── public/                    # Static assets
├── scripts/                   # Database & maintenance scripts
│   └── database/
│       ├── migrate.ts         # Migration runner
│       ├── check_tables.ts    # Schema inspection
│       ├── next_migration_number.ts  # Safe sequential numbering
│       ├── generate-typebox-schemas.ts # Validator post-hook
│       ├── fix-crud-controllers.js    # One-time migration utility
│       ├── fix-select-antipattern.js  # Code quality cleanup
│       └── run-migrations/    # Environment-specific migration runners
├── src/                       # Application source code
│   ├── contexts/              # 10 Bounded Contexts (DDD)
│   │   ├── identity/          # Auth, ABAC, Audit
│   │   ├── clinical/          # Patients, Encounters, Assessments
│   │   ├── billing/           # NOE/NOTR, Hospice Cap
│   │   ├── documentation/     # eSignatures, Notes
│   │   ├── scheduling/        # Staff, IDG Meetings, Aide Supervision
│   │   ├── interoperability/  # FHIR, SMART, eRx
│   │   ├── analytics/         # QAPI, CAHPS
│   │   ├── communication/     # Chat, Notifications
│   │   └── shared-kernel/     # Value objects (Money, DateRange)
│   ├── config/                # Fastify 5 + Valkey configuration
│   ├── middleware/            # Fastify hook-based middleware
│   ├── schemas/               # Cross-domain TypeBox definitions
│   └── jobs/                  # BullMQ processors (Valkey-backed)
├── storage/                   # Runtime storage (ephemeral in production)
│   └── framework/
│       ├── cache/             # Non-PHI application cache (Valkey fallback)
│       ├── sessions/          # Session fallback only — PHI must not persist here
│       ├── testing/           # Test artifacts
│       └── views/             # Compiled view templates
├── test-data/                 # Synthetic data (HIPAA-compliant)
│   ├── 271-samples/           # Eligibility response samples
│   └── 835-samples/           # ERA payment samples
└── tests/                     # Comprehensive test suites
    ├── cap-accuracy/          # Hospice cap calculation tests (incl. Nov 1 boundary)
    ├── config/                # Config validation tests
    ├── fhir/                  # FHIR R4/R6 integration tests
    ├── fixtures/              # Test data fixtures
    ├── golden-workflow-verification/ # CMS workflow validation
    ├── integration/           # API integration tests
    │   ├── edge-cases/        # Friday NOE, cap year boundary, aide supervision
    │   ├── endpoints/
    │   ├── helpers/
    │   └── workflows/
    ├── contract/              # Pact contract tests
    ├── unit/                  # Unit tests (Vitest)
    ├── utils/                 # Test utilities
    └── validation/            # TypeBox schema tests
```

---

## High-Level Architecture

| Directory | Purpose |
|-----------|---------|
| `database/` | **Migration assets** — versioned SQL with Drizzle (`dialect: "postgresql"`) + TypeBox generation |
| `src/contexts/` | **DDD Bounded Contexts** — strict boundaries, TypeBox schemas per context |
| `src/schemas/` | **Cross-domain TypeBox** — FHIR core, HIPAA audit, shared value objects |
| `src/config/` | **Fastify 5 configuration** — AOT validators compiled once at startup |
| `src/middleware/` | **Hook-based middleware** — Fastify 5 lifecycle with parameterized RLS |
| `src/jobs/` | **Background processing** — BullMQ on Valkey with DLQ for billing-critical jobs |
| `src/shared-kernel/` | **Domain primitives** — Money, DateRange, PatientId (branded types) |
| `scripts/database/` | **DB maintenance** — migration runners, TypeBox generator, schema reporter |
| `storage/` | **Ephemeral runtime files** — Valkey primary; storage is fallback only, no PHI |
| `test-data/` | **HIPAA-compliant synthetic data** — TypeBox-validated X12 fixtures |

---

## Detailed Source Structure (`src/`)

### Configuration Layer (`src/config/`)

| File | Purpose |
|------|---------|
| `app.config.ts` | Fastify 5 instance factory |
| `auth.config.ts` | Better Auth with TypeBox schemas |
| `valkey.config.ts` | iovalkey cluster (RedisJSON + RedisSearch) |
| `broadcasting.config.ts` | Socket.IO with Valkey adapter |
| `cache.config.ts` | Valkey cache layer (TTL strategies) |
| `cors.config.ts` | CORS policy definitions |
| `database.config.ts` | PostgreSQL 18+ connection + RLS setup |
| `drizzle.config.ts` | Drizzle ORM client (`dialect: "postgresql"`) |
| `encryption.config.ts` | PHI field encryption (pgcrypto AES-256) |
| `helmet.config.ts` | HTTP security headers |
| `logging.config.ts` | Pino structured logging (Fastify native) |
| `mail.config.ts` | Email transport (SMTP/SendGrid) — BAA required |
| `permission.config.ts` | CASL/RBAC permission setup |
| `queue.config.ts` | BullMQ configuration (Valkey-backed, DLQ per queue) |
| `rateLimit.config.ts` | Rate limiting (Valkey store) |
| `rbac.ts` | Role definitions matrix (TypeBox enums) |
| `session.config.ts` | Session management (Valkey-backed, location-scoped) |
| `tls.config.ts` | TLS/mTLS settings |
| `typebox-compiler.ts` | **Central registry** — all TypeBox AOT validators compiled here |

### Middleware Stack (`src/middleware/`)

Fastify 5 hook-based middleware — executed in strict order:

| Middleware | Hook | Purpose |
|------------|------|---------|
| `apm.middleware.ts` | `onRequest` | Application performance monitoring |
| `cors.middleware.ts` | `onRequest` | CORS enforcement |
| `origin.middleware.ts` | `onRequest` | Request origin validation |
| `cookie-fix.middleware.ts` | `onRequest` | Cookie normalization |
| `auth.middleware.ts` | `preValidation` | JWT/session authentication |
| `betterAuth.middleware.ts` | `preValidation` | Better Auth session handler |
| `csrf.middleware.ts` | `preValidation` | CSRF token validation |
| `typebox-validation.middleware.ts` | `preValidation` | AOT TypeBox validation |
| `breakGlass.middleware.ts` | `preHandler` | Emergency access enforcement |
| `fhirVersion.middleware.ts` | `preHandler` | R4/R6 content negotiation |
| `locationScope.middleware.ts` | `preHandler` | **Parameterized** RLS context injection |
| `audit.middleware.ts` | `preSerialization` | HIPAA audit trail |
| `encryption.middleware.ts` | `preSerialization` | PHI field encryption |
| `error.middleware.ts` | `onError` | Global error handler |

### Bounded Contexts (`src/contexts/`)

#### 1. Identity & Access (`contexts/identity/`)

**TypeBox Schemas:**
- `user.schema.ts` — Users with ABAC attributes
- `session.schema.ts` — Valkey-backed sessions
- `role.schema.ts`, `permission.schema.ts` — RBAC matrix
- `abacPolicy.schema.ts` — Attribute-Based Access Control
- `auditLog.schema.ts` — Immutable audit events
- `breakGlass.schema.ts` — Emergency access (4-hour TTL, 20-char minimum reason)
- `signaturePin.schema.ts` — Clinical signing

**Services:**
- `AuditService.service.ts` — HIPAA-compliant logging
- `EncryptionService.service.ts` — PHI encryption
- `ABAC.service.ts` — Attribute-based authorization
- `BreakGlass.service.ts` — Emergency access management

#### 2. Clinical (`contexts/clinical/`)

**Patient Management:** 18 TypeBox schemas covering demographics, contacts, referral, FHIR mapping.

**Pain Management:** 32 TypeBox schemas (FLACC, FLAC-Revised, Wong-Baker, Oucher, NRS, VAS, PAINAD, Doloplus-2, EOPS, DN4, and specialized scales).

**Assessments:** HOPE v2 (267 elements), cardiac, respiratory, neurological, GI, GU, integumentary, psychosocial (GAD-7, PHQ-9, Columbia, Zarit Burden).

**Care Planning:**
- `certification.schema.ts` — 90-day periods, state machine
- `idgMeeting.schema.ts` — Every 15 days (hard block enforcement)
- `carePlan.schema.ts` — Goals, interventions, FHIR CarePlan mapping

#### 3. Billing (`contexts/billing/`)

**CMS Compliance:**
- `benefitPeriod.schema.ts` — 90d/90d/60d/unlimited logic
- `electionStatement.schema.ts` — Hospice election lifecycle
- `noticeOfElection.schema.ts` — NOE (5-day rule + Friday edge case)
- `noticeOfTermination.schema.ts` — NOTR tracking
- `hospiceCap.schema.ts` — Aggregate/Proportional (Nov 1 cap year boundary)

**Revenue Cycle:**
- `claim.schema.ts` — X12 837i mapping
- `claimAdjustment.schema.ts` — RTP corrections
- `era.schema.ts` — 835 remittance
- `asc606.schema.ts` — Revenue recognition

#### 4. Documentation (`contexts/documentation/`)

- `electronicSignature.schema.ts` — Tamper-evident signing
- `nursingNote.schema.ts` — Structured narrative
- `clinicalEmbeddings.schema.ts` — pgvector AI notes
- `patientRights.schema.ts` — State-specific notices

#### 5. Scheduling (`contexts/scheduling/`)

- `idgSchedule.schema.ts` — Auto-scheduling every 15 days
- `staffSchedule.schema.ts` — Temporal assignments
- `timeClock.schema.ts` — Billable hours tracking
- `aideSupervision.schema.ts` — HHA 14-day supervision (CMS §418.76)

#### 6. Interoperability (`contexts/interoperability/`)

- `r4/` — R4 resources (Patient, Encounter, Observation)
- `r6/` — R6 resource stubs
- `adapters/` — R4 ↔ R6 transformation logic
- `validators/` — Compiled TypeBox validators (generated — do not edit manually)
- `smart.schema.ts` — SMART on FHIR 2.0 (full scope registry)
- `dosespot.schema.ts` — eRx integration (BAA required)
- `dsm.schema.ts` — Direct Secure Messaging

#### 7. Analytics (`contexts/analytics/`)

- `qapi.schema.ts` — Quality metrics
- `cahps.schema.ts` — Survey management (Press Ganey/CHAP integration)
- `capReport.schema.ts` — Cap liability dashboards

#### 8. Communication (`contexts/communication/`)

- `chat.schema.ts` — Socket.IO chat (TypeBox message validation)
- `notification.schema.ts` — Push notifications
- `broadcast.schema.ts` — Organization-wide alerts

#### 9. Shared Kernel (`contexts/shared-kernel/`)

- `Money.schema.ts` — USD with precision
- `DateRange.schema.ts` — Inclusive ranges
- `PatientId.schema.ts` — Branded type
- `AuditContext.schema.ts` — HIPAA context carrier

### Jobs (`src/jobs/`)

All BullMQ jobs run on Valkey. Each queue has a corresponding DLQ (`{queue-name}-dlq`).

| Job | Trigger | Schema | DLQ |
|-----|---------|--------|-----|
| `capRecalculation.job.ts` | Monthly (Nov 2) | `CapCalculationSchema` | `cap-dlq` |
| `noeDeadlineAlert.job.ts` | Daily 06:00 | `NOEDeadlineSchema` | `noe-dlq` |
| `idgCompliance.job.ts` | Daily 06:00 | `IDGComplianceSchema` | `idg-dlq` |
| `aideSupervision.job.ts` | Daily 06:00 | `AideSupervisionSchema` | `aide-dlq` |
| `benefitPeriodAlert.job.ts` | Daily 06:00 | `BenefitPeriodAlertSchema` | `bp-dlq` |
| `claimScrubber.job.ts` | Queue-driven | `ClaimScrubSchema` | `claim-dlq` |
| `fhirSubscription.job.ts` | Webhook | `FhirSubscriptionSchema` | `fhir-dlq` |
| `auditArchive.job.ts` | Weekly | `AuditArchiveSchema` | `audit-dlq` |

### Routes (`src/contexts/*/routes/`)

**Auth & Identity:** `auth.routes.ts`, `user.routes.ts`, `role.routes.ts`, `abac.routes.ts`, `breakGlass.routes.ts`

**FHIR API:** `fhir/patient.routes.ts`, `fhir/encounter.routes.ts`, `fhir/observation.routes.ts` (dual R4/R6 via content negotiation)

**CMS Operations:** `noe.routes.ts`, `cap.routes.ts`, `election.routes.ts`, `benefitPeriod.routes.ts`

---

## Key Developer Clarifications

### 1. Schema-First Development

- **TypeBox** is the single source of truth — define schema first, derive everything else
- All TypeBox validators are compiled at module level in `src/config/typebox-compiler.ts`
- Never call `TypeCompiler.Compile()` inside a request handler or function body

### 2. Valkey Architecture

- **Package:** `iovalkey` (not `iovalis`)
- **Sessions:** Location-scoped TTL buckets
- **Cache:** RedisJSON for FHIR resource caching
- **Queues:** BullMQ with DLQ per queue; all billing queues have alerting on failure
- **Rate Limiting:** Valkey-backed sliding window

### 3. FHIR R4/R6 Dual Mode

- Store as JSONB with promoted `fhir_version` native column
- TypeBox adapters transform between versions
- Content negotiation via `Accept: application/fhir+json; fhirVersion=4.0|6.0`

### 4. RLS Context — Parameterized Only

```typescript
// ✅ CORRECT
await db.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);

// ❌ NEVER — no exceptions, even with validated uuid values
await db.execute(`SET app.current_user_id = '${userId}'`);
```

### 5. Drizzle Configuration

```typescript
// ✅ CORRECT
export default defineConfig({ dialect: 'postgresql', dbCredentials: { url: process.env.DATABASE_URL! } });

// ❌ DEPRECATED (drizzle-kit < 0.20)
export default defineConfig({ driver: 'pg', dbCredentials: { connectionString: '...' } });
```

### 6. Testing Hierarchy

- **Unit:** Vitest for TypeBox validators and domain logic
- **Contract:** Pact for FHIR API consumer contracts
- **Integration:** Testcontainers with PostgreSQL 18 + Valkey; includes Friday NOE edge case, cap year boundary, aide supervision overdue scenarios

### 7. storage/ Directory

`storage/` is ephemeral in all containerized deployments (tmpfs recommended). It must never contain PHI. Valkey is the primary session and cache store; `storage/` exists only as a framework-layer fallback.

---

_Hospici Backend Structure v2.0 — Monorepo-aware, DDD-organized, CMS-compliant_
