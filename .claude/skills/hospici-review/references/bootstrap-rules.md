# Bootstrap Rules

Pre-seeded rules for Hospici EHR. These are loaded into learned-rules.yaml on first run.
These represent known hospice EHR anti-patterns before the codebase has been scanned.

---

## PHI Rules

```yaml
- id: phi-001
  status: active
  severity: critical
  category: phi
  title: "SSN returned in API response"
  pattern: "Response object contains `ssn` field without masking or encryption"
  why: "SSN is a HIPAA Safe Harbor identifier. Exposure in API responses violates 45 CFR §164.514."
  fix: "Use a serializer that strips ssn from all non-admin responses. Never include ssn in list endpoints."
  example_bad: "reply.send({ ...patient }) // includes ssn"
  example_good: "reply.send(serializePatient(patient)) // serializer strips phi"
  first_seen: { file: "bootstrap", line: 0, date: "2025-01-01" }
  last_triggered: null
  trigger_count: 0
  archived_date: null

- id: phi-002
  status: active
  severity: critical
  category: phi
  title: "PHI in console.log or logger"
  pattern: "logger.*(patient\\.|ssn|mrn|dob|diagnosis) or console.log with patient object"
  why: "Logs are often shipped to external services (Datadog, CloudWatch). PHI in logs is a breach."
  fix: "Log only patient.id (UUID). Never spread or stringify patient objects in logs."
  example_bad: "logger.info({ patient }, 'Updated record')"
  example_good: "logger.info({ patientId: patient.id }, 'Updated record')"
  first_seen: { file: "bootstrap", line: 0, date: "2025-01-01" }
  last_triggered: null
  trigger_count: 0
  archived_date: null

- id: phi-003
  status: active
  severity: critical
  category: phi
  title: "PHI in Error message string"
  pattern: "new Error(`...${patient.name}`) or similar interpolation of PHI into error messages"
  why: "Error messages may surface in API responses, Sentry, or log aggregators."
  fix: "Use error codes only. Pass patientId if needed for debugging, never PHI fields."
  example_bad: "throw new Error(`Patient ${patient.ssn} not found`)"
  example_good: "throw new NotFoundError('PATIENT_NOT_FOUND', { patientId: patient.id })"
  first_seen: { file: "bootstrap", line: 0, date: "2025-01-01" }
  last_triggered: null
  trigger_count: 0
  archived_date: null

- id: phi-004
  status: active
  severity: critical
  category: phi
  title: "PHI as URL path parameter"
  pattern: "Route defined with MRN, SSN, name, or DOB as path segment"
  why: "URL path parameters appear in access logs, browser history, and referrer headers."
  fix: "Always use internal UUID as path parameter. Look up by MRN internally, never expose in URL."
  example_bad: "GET /patients/:mrn/episodes"
  example_good: "GET /patients/:id/episodes  // id is internal UUID"
  first_seen: { file: "bootstrap", line: 0, date: "2025-01-01" }
  last_triggered: null
  trigger_count: 0
  archived_date: null

- id: phi-005
  status: active
  severity: critical
  category: phi
  title: "Unencrypted clinical fields in Drizzle schema"
  pattern: "Columns for diagnosis, medication, clinical_notes defined as plain text/varchar without encryption"
  why: "Clinical data at rest must be encrypted per HIPAA Technical Safeguards (§164.312)."
  fix: "Use @47ng/cloak for field-level encryption on all clinical content columns."
  example_bad: "clinicalNotes: text('clinical_notes')"
  example_good: "clinicalNotes: text('clinical_notes').$type<Encrypted<string>>()"
  first_seen: { file: "bootstrap", line: 0, date: "2025-01-01" }
  last_triggered: null
  trigger_count: 0
  archived_date: null
```

---

## Auth Rules

```yaml
- id: auth-001
  status: active
  severity: critical
  category: auth
  title: "Patient route missing authenticate preHandler"
  pattern: "Fastify route under /patients, /episodes, /medications, /care-plans without preHandler: [authenticate]"
  why: "Unauthenticated access to clinical data is a HIPAA breach."
  fix: "All clinical routes must declare preHandler: [authenticate, authorize(ROLE)]"
  example_bad: "fastify.get('/patients/:id', handler)"
  example_good: "fastify.get('/patients/:id', { preHandler: [authenticate, authorize('clinician')] }, handler)"
  first_seen: { file: "bootstrap", line: 0, date: "2025-01-01" }
  last_triggered: null
  trigger_count: 0
  archived_date: null

- id: auth-002
  status: active
  severity: warning
  category: auth
  title: "Missing role check on billing routes"
  pattern: "Routes under /billing, /claims, /reimbursements with authenticate but no role check"
  why: "Billing data includes diagnosis codes and financial PHI — requires admin or billing role."
  fix: "Add authorize('billing') or authorize('admin') preHandler."
  first_seen: { file: "bootstrap", line: 0, date: "2025-01-01" }
  last_triggered: null
  trigger_count: 0
  archived_date: null

- id: auth-003
  status: active
  severity: critical
  category: auth
  title: "JWT secret hardcoded or using default value"
  pattern: "JWT_SECRET set to 'secret', 'changeme', 'dev', or any value under 32 chars"
  why: "Weak JWT secret allows token forgery — full auth bypass."
  fix: "Use process.env.JWT_SECRET, minimum 64 chars, generated with crypto.randomBytes(64)"
  first_seen: { file: "bootstrap", line: 0, date: "2025-01-01" }
  last_triggered: null
  trigger_count: 0
  archived_date: null
```

---

## Drizzle Rules

```yaml
- id: drizzle-001
  status: active
  severity: critical
  category: drizzle
  title: "Multi-table patient write outside transaction"
  pattern: "Two or more inserts/updates to patient-related tables without db.transaction() wrapper"
  why: "Partial writes leave clinical data in inconsistent state — critical in EHR context."
  fix: "Wrap all multi-table patient writes in db.transaction(async (tx) => { ... })"
  example_bad: |
    await db.insert(patients).values(...)
    await db.insert(episodes).values(...)
  example_good: |
    await db.transaction(async (tx) => {
      await tx.insert(patients).values(...)
      await tx.insert(episodes).values(...)
    })
  first_seen: { file: "bootstrap", line: 0, date: "2025-01-01" }
  last_triggered: null
  trigger_count: 0
  archived_date: null

- id: drizzle-002
  status: active
  severity: warning
  category: drizzle
  title: "Select without where on patients table"
  pattern: "db.select().from(patients) with no .where() clause"
  why: "Full table scan returns all patient records — performance risk and over-fetching PHI."
  fix: "Always scope patient queries with at least a tenant/organization filter."
  first_seen: { file: "bootstrap", line: 0, date: "2025-01-01" }
  last_triggered: null
  trigger_count: 0
  archived_date: null

- id: drizzle-003
  status: active
  severity: warning
  category: drizzle
  title: "Migration file modified after creation"
  pattern: "Changes to files in migrations/ directory that were already committed"
  why: "Modifying existing migrations breaks reproducible schema history — dangerous in prod."
  fix: "Never edit existing migration files. Create a new migration for any schema change."
  first_seen: { file: "bootstrap", line: 0, date: "2025-01-01" }
  last_triggered: null
  trigger_count: 0
  archived_date: null
```

---

## Fastify Rules

```yaml
- id: fastify-001
  status: active
  severity: critical
  category: fastify
  title: "Missing security headers plugin"
  pattern: "Fastify app without @fastify/helmet registered"
  why: "Missing security headers (CSP, HSTS, X-Frame-Options) required for HIPAA-compliant web app."
  fix: "Register fastify.register(require('@fastify/helmet')) in app bootstrap."
  first_seen: { file: "bootstrap", line: 0, date: "2025-01-01" }
  last_triggered: null
  trigger_count: 0
  archived_date: null

- id: fastify-002
  status: active
  severity: warning
  category: fastify
  title: "Route missing response schema"
  pattern: "Fastify route handler with no schema.response definition"
  why: "Without response schema, Fastify cannot serialize/validate output — PHI may leak through unintended fields."
  fix: "Define schema: { response: { 200: PatientResponseSchema } } for all clinical routes."
  first_seen: { file: "bootstrap", line: 0, date: "2025-01-01" }
  last_triggered: null
  trigger_count: 0
  archived_date: null

- id: fastify-003
  status: active
  severity: critical
  category: fastify
  title: "CORS allows wildcard origin in non-dev environment"
  pattern: "fastify-cors origin: '*' without NODE_ENV check"
  why: "Wildcard CORS on a HIPAA application allows any website to make credentialed requests."
  fix: "Restrict CORS origin to explicit allowlist. Use env-based config."
  first_seen: { file: "bootstrap", line: 0, date: "2025-01-01" }
  last_triggered: null
  trigger_count: 0
  archived_date: null
```

---

## Audit Rules

```yaml
- id: audit-001
  status: active
  severity: warning
  category: audit
  title: "Patient record mutation without audit log"
  pattern: "INSERT/UPDATE/DELETE on patients, episodes, care_plans, medications without auditLog() call"
  why: "42 CFR Part 418 (hospice CoPs) requires tracking of all clinical record changes."
  fix: "Call auditLog({ action, entityId, entityType, userId, changes }) after every mutation."
  first_seen: { file: "bootstrap", line: 0, date: "2025-01-01" }
  last_triggered: null
  trigger_count: 0
  archived_date: null

- id: audit-002
  status: active
  severity: warning
  category: audit
  title: "Bulk operations without per-record audit"
  pattern: "Batch inserts or updates on clinical tables with single audit entry for entire batch"
  why: "Individual record audit trail required — bulk audit entries are insufficient for CMS review."
  fix: "Loop audit entries per record. Consider audit trigger at DB level for bulk ops."
  first_seen: { file: "bootstrap", line: 0, date: "2025-01-01" }
  last_triggered: null
  trigger_count: 0
  archived_date: null
```

---

## Standards Rules

```yaml
- id: std-001
  status: active
  severity: info
  category: standards
  title: "Direct process.env access outside config module"
  pattern: "process.env.VARIABLE_NAME referenced outside src/config/env.ts"
  why: "Scattered env access makes config validation and testing difficult."
  fix: "Import from src/config/env.ts which validates all env vars at startup."
  first_seen: { file: "bootstrap", line: 0, date: "2025-01-01" }
  last_triggered: null
  trigger_count: 0
  archived_date: null

- id: std-002
  status: active
  severity: info
  category: standards
  title: "any type in clinical service layer"
  pattern: "TypeScript `any` type in src/services/ or src/api/"
  why: "Untyped clinical data is a runtime risk and makes PHI tracking impossible."
  fix: "Define explicit types. Use unknown + type guard if input is truly dynamic."
  first_seen: { file: "bootstrap", line: 0, date: "2025-01-01" }
  last_triggered: null
  trigger_count: 0
  archived_date: null

- id: std-003
  status: active
  severity: warning
  category: standards
  title: "Raw Date arithmetic for benefit period calculation"
  pattern: "new Date() + arithmetic for hospice benefit period, election date, or recertification"
  why: "Timezone bugs in benefit period calculations cause CMS billing errors."
  fix: "Use dayjs or date-fns with explicit UTC timezone for all clinical date math."
  first_seen: { file: "bootstrap", line: 0, date: "2025-01-01" }
  last_triggered: null
  trigger_count: 0
  archived_date: null
```
