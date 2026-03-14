# Base Review Checklist

All checks run on every review. Severity is per-item.

---

## 🔴 Critical Checks

### C-01: PHI in Unauthenticated Routes
Any API route missing auth middleware that returns patient data.
- Check: `src/api/**/*.ts` — routes without `preHandler: [authenticate]`
- PHI fields: ssn, dob, mrn, npi, address, phone, diagnosis, medication, prognosis

### C-02: Unencrypted PHI at Rest
Patient fields stored as plaintext that should use `@47ng/cloak` encryption.
- Fields: ssn, dob, diagnosis_codes, medication_list, clinical_notes
- Check: Drizzle schema — these columns must have `.notNull()` + encryption decorator

### C-03: PHI in Error Responses
`throw new Error(...)` or FastError responses that include patient data in the message string.
- Pattern: `new Error(\`...\${patient\...}\`)` or `reply.send({ error: ..., patient: ... })`

### C-04: Missing Transaction on Multi-Table Patient Writes
Any service function writing to 2+ patient-related tables without `db.transaction()`.
- Tables: patients, episodes, medications, care_plans, diagnoses, visit_notes

### C-05: Hardcoded Credentials or Secrets
Any `.env` value, API key, or password literal in source files.
- Pattern: strings matching `/sk-|Bearer |password\s*=\s*['"][^'"]{8,}/i`

### C-06: SQL Injection via Raw Queries
Use of `db.execute(sql\`...\${userInput}\`)` without parameterization.

### C-07: Missing RBAC on Sensitive Routes
Routes touching patient records, billing, or clinical data without `authorize()` check.

---

## 🟡 Warning Checks

### W-01: Missing Audit Log on Patient Record Mutation
Any CREATE/UPDATE/DELETE on patient records without calling `auditLog()`.
- Required per 42 CFR Part 418.100 — hospice CoPs require change tracking.

### W-02: Console.log with Patient Fields
Any `console.log`, `console.error`, or logger call that references patient object properties.
- Pattern: `console\.(log|error|warn|info)\(.*patient\.|.*\.ssn|.*\.mrn`

### W-03: Missing Input Validation Schema
FastifyRoute handlers without a `schema: { body: ..., querystring: ... }` definition.

### W-04: Unhandled Promise Rejections
`async` functions without try/catch or `.catch()` in route handlers or workers.

### W-05: Missing Pagination on List Endpoints
Any route returning arrays of patients/episodes/medications without limit/offset.

### W-06: Drizzle Query Without `where` Clause on Patient Table
Accidental full-table scan risk — flag any `db.select().from(patients)` without `.where()`.

### W-07: Missing Content-Type Validation
File upload routes without MIME type checking (risk of malicious file upload).

### W-08: Deprecated Drizzle Patterns
Usage of `.execute()` where `.query()` or `.prepare()` should be used.

### W-09: Missing Rate Limiting on Auth Routes
`/login`, `/register`, `/reset-password` routes without `rateLimit` plugin applied.

### W-10: Direct Date Manipulation Without dayjs/date-fns
Raw `new Date()` arithmetic for clinical date calculations (admission dates, benefit periods).
Risk of timezone bugs in hospice billing.

---

## 🔵 Info Checks

### I-01: TODO / FIXME Comments
Flag all `TODO`, `FIXME`, `HACK`, `XXX` comments with file and line.

### I-02: Any Type Usage
TypeScript `any` type — flag for proper typing.

### I-03: Missing JSDoc on Public Service Functions
Exported functions in `src/services/` without JSDoc block.

### I-04: Inconsistent Error Code Format
Error codes not matching `HOSPICI_ERR_<DOMAIN>_<CODE>` convention.

### I-05: Long Functions (>80 lines)
Flag functions exceeding 80 lines as candidates for decomposition.

### I-06: Missing Index on Foreign Keys
Drizzle schema — FK columns without corresponding `.index()` call.

### I-07: Unused Imports
`import` statements with no references in file body.

### I-08: Env Variable Access Outside Config Module
Direct `process.env.X` access outside `src/config/env.ts`.
