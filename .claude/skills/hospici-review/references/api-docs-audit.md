# API Documentation Audit

Hospici uses both Fastify JSON Schema (runtime validation) and OpenAPI/Swagger (spec documentation).
This audit ensures they stay in sync and that all routes are fully documented.

---

## 1. Missing OpenAPI Spec on New Routes

### Detection
For every Fastify route registered in `src/api/**/*.ts`:
1. Extract the method + path (e.g., `GET /patients/:id/medications`)
2. Check `openapi/paths/` for a corresponding entry
3. Flag routes with no OpenAPI path entry as `api-docs` Warning

### Required OpenAPI fields per route
```yaml
/patients/{id}/medications:
  get:
    summary: "..."           # required
    description: "..."       # required
    operationId: "..."       # required — must match Fastify route id
    tags: [...]              # required
    security: [...]          # required — document auth requirements
    parameters: [...]        # required if path/query params exist
    responses:
      200:
        description: "..."
        content:
          application/json:
            schema: { $ref: '#/components/schemas/MedicationListResponse' }
      400: { $ref: '#/components/responses/ValidationError' }
      401: { $ref: '#/components/responses/Unauthorized' }
      403: { $ref: '#/components/responses/Forbidden' }
      500: { $ref: '#/components/responses/InternalError' }
```

### Flag if missing
- No OpenAPI entry for route → 🟡 Warning
- OpenAPI entry exists but missing `security` field → 🟡 Warning
- OpenAPI entry exists but missing error responses (400/401/403/500) → 🔵 Info

---

## 2. Fastify Schema vs OpenAPI Drift

### Detection
For every route that has BOTH a Fastify schema AND an OpenAPI spec entry:
1. Extract the Fastify `schema.response[200]` definition
2. Extract the OpenAPI `responses.200.content.application/json.schema`
3. Compare field names and types

### Drift conditions to flag

```typescript
// Fastify schema (runtime)
schema: {
  response: {
    200: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        patientName: { type: 'string' },
        dosage: { type: 'number' },     // ← exists in Fastify
        frequency: { type: 'string' }
      }
    }
  }
}

// OpenAPI spec (documentation)
# Missing `dosage` field — DRIFT DETECTED 🟡
```

### Severity
- Field in Fastify schema but missing from OpenAPI → 🟡 Warning (undocumented behavior)
- Field in OpenAPI but missing from Fastify schema → 🟡 Warning (documented but not validated)
- Type mismatch between Fastify and OpenAPI → 🔴 Critical (misleading documentation)
- Entire response shape differs → 🔴 Critical

---

## 3. Outdated Response Schemas

### Detection
Compare current Drizzle schema field names/types against OpenAPI component schemas.

For each `components/schemas/` entry in the OpenAPI spec:
1. Find the corresponding Drizzle table (by convention: `PatientResponse` → `patients` table)
2. Compare fields: any Drizzle column added/removed/renamed since last doc update?
3. Flag mismatches

```typescript
// Drizzle schema added field
admissionSource: varchar('admission_source', { length: 50 })  // new field
// But PatientResponse schema in OpenAPI still doesn't include admissionSource → 🟡 Warning
```

### High-priority schemas to always check
`PatientResponse`, `EpisodeResponse`, `MedicationResponse`, `ClaimResponse`,
`ClinicalNoteResponse`, `VisitResponse`, `CarePlanResponse`

---

## 4. Undocumented Error Codes

### Detection
Scan `src/` for all custom error classes and error code constants:
```typescript
// These must all appear in OpenAPI components/responses or components/schemas/ErrorResponse
throw new HospiciError('PATIENT_NOT_FOUND', ...)
throw new HospiciError('CLAIM_ALREADY_SUBMITTED', ...)
throw new HospiciError('BENEFIT_PERIOD_EXPIRED', ...)
```

Cross-reference against `openapi/components/responses/` and `openapi/components/schemas/ErrorCodes`.

Flag any error code thrown in application code that has no OpenAPI documentation → 🔵 Info

---

## 5. Missing operationId

Every Fastify route should declare a unique `operationId` that matches the OpenAPI spec:
```typescript
// Fastify route
fastify.get('/patients/:id', {
  config: { operationId: 'getPatientById' },  // ← required
  schema: { ... },
  preHandler: [authenticate],
}, handler)
```

Flag routes missing `operationId` → 🔵 Info (needed for SDK generation and client tooling)

---

## 6. PHI in API Docs

OpenAPI descriptions and examples must never contain real or realistic PHI:
- No real SSNs, MRNs, NPIs, DOBs in `example` fields
- Use obviously fake values: `"mrn": "TEST-00001"`, `"ssn": "000-00-0000"`

Flag any OpenAPI example containing realistic PHI patterns (run same regex as phi-detection.md) → 🔴 Critical
