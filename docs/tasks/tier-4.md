# Tier 4 — Interoperability & Scale

> `needs:` Tier 3 exit gates. Each task is its own session.
> All HIGH tasks: 2 architecture docs max per session.

---

## T4-1 · SMART on FHIR 2.0 Backend Services + Client Registry `HIGH`

`read:` `SECURITY`, `BE-SPEC` §Phase 5

> Differentiation task — no hospice competitor publicly markets this as a first-class capability. See `docs/qa/SMART_ON_FHIR_COMPETITIVE_ANALYSIS.md`.

**Authorization server surface**
- SMART Backend Services profile (M2M, asymmetric keys only — RS384 / ES384 JWT client assertions; no symmetric client secrets)
- `POST /api/v1/smart/token` — token endpoint: validate JWT client assertion against registered JWKS, issue scoped access token (TTL 300 s)
- `GET /.well-known/smart-configuration` — SMART discovery document (`token_endpoint`, `jwks_uri`, `grant_types_supported`, `scopes_supported`)
- `GET /api/v1/smart/jwks` — Hospici signing-key JWKS (public key set for token verification by clients)

**Client registry (DB)**
- `smart_clients` table: `clientId`, `name`, `description`, `locationId` (nullable = global), `jwksUri` OR `jwksInline` JSONB, `allowedScopes text[]`, `status` (active/suspended/revoked), `createdByUserId`, `updatedAt`, `auditNotes`
- `smart_access_log` table (append-only): `clientId`, `grantedScopes text[]`, `resourceType`, `httpMethod`, `responseStatus`, `tokenIssuedAt`, `requestedAt`

**Client registry routes (admin)**
- `POST /api/v1/smart/clients` — register new SMART client (compliance_officer / super_admin)
- `GET /api/v1/smart/clients` — list all clients with status + last-used
- `GET /api/v1/smart/clients/:id` — client detail (scopes, JWKS, status)
- `PATCH /api/v1/smart/clients/:id` — update scopes, suspend, or revoke
- `POST /api/v1/smart/clients/:id/rotate` — trigger key rotation (sets `jwksRotatedAt`, re-validates JWKS URI)
- `GET /api/v1/smart/clients/:id/access-log` — paginated token + resource access history

**System scopes (new scope class)**
- `system/Patient.read`, `system/Observation.read`, `system/Claim.read`, `system/HospiceAssessment.read`, `system/BenefitPeriod.read`
- T3-6 FHIR route-layer scope enforcement already checks `patient/` scopes; extend to also accept `system/` scopes issued to backend-services tokens

**Required audit events**
- `SMART_CLIENT_REGISTERED`, `SMART_CLIENT_UPDATED`, `SMART_CLIENT_REVOKED`
- `SMART_TOKEN_ISSUED`, `SMART_TOKEN_DENIED` (with reason: `invalid_assertion` / `unknown_client` / `scope_exceeded`)
- `SMART_RESOURCE_ACCESS` (logged per FHIR request carrying a system-scoped token)

**Frontend admin (SMART app registry)**
- `settings/smart/index.tsx` — registry table (name, status, last-used, scopes, key rotation date)
- Register Client modal (name, JWKS URI or paste inline JSON, scope selection)
- Client detail page: status badge, scope pills, key rotation CTA, access log table
- Suspend / Revoke action with confirmation modal

**Done when:** Backend client can register, obtain a token via JWT client assertion (SMART Backend Services flow), call authorized FHIR endpoints under `system/` scopes, and be fully visible in the app registry with audit logs; `.well-known/smart-configuration` and JWKS endpoints validate against HL7 SMART App Launch IG expectations.

---

## T4-2 · FHIR R4 Bulk Data `$export` + Export Job Lifecycle `HIGH`

`read:` `BE-SPEC` §Phase 5

> WellSky is the direct public standards benchmark (explicit FHIR Bulk Data Access + NDJSON). Axxess is an adjacent export-workflow benchmark only. See `docs/qa/FHIR_BULK_EXPORT_COMPETITIVE_ANALYSIS.md`.
> `needs:` T4-1 (SMART system scopes must be in place before kick-off authorization works)

**Kick-off endpoints (FHIR Bulk Data spec HTTP semantics)**
- `GET /api/v1/fhir/Patient/$export` — patient-level export (all enrolled patients at requesting client's location scope)
- `GET /api/v1/fhir/Group/:id/$export` — group-level export (filter by location / care team group)
- Required request headers: `Accept: application/fhir+json`, `Prefer: respond-async`
- Query params: `_type` (comma-separated resource types), `_since` (ISO-8601 datetime filter), `_outputFormat` (default `application/fhir+ndjson`)
- Response: `202 Accepted` + `Content-Location: /api/v1/fhir/bulk-export/:jobId/status` header (no body)

**Status + download endpoints**
- `GET /api/v1/fhir/bulk-export/:jobId/status`
  - In-progress: `202` + `X-Progress: "N of M resources processed"` header
  - Complete: `200` + JSON manifest (see manifest shape below)
  - Failed: `500` + FHIR OperationOutcome body
- `GET /api/v1/fhir/bulk-export/:jobId/files/:filename` — signed download for individual NDJSON files (15-min Valkey token, same pattern as T3-10)
- `DELETE /api/v1/fhir/bulk-export/:jobId` — cancel in-progress job or delete completed artifacts

**Export manifest shape (200 response on complete status)**
```json
{
  "transactionTime": "<ISO-8601>",
  "request": "<original kick-off URL>",
  "requiresAccessToken": true,
  "output": [
    { "type": "Patient", "url": "...", "count": 42 },
    { "type": "Observation", "url": "...", "count": 318 }
  ],
  "error": [],
  "extension": {
    "hospici:exportJobId": "<uuid>",
    "hospici:locationId": "<uuid>",
    "hospici:fileHashes": { "<filename>": "<sha256>" }
  }
}
```

**NDJSON resource types (initial set)**
- `Patient` — from T3-6 FHIR mapper
- `Observation` — pain assessments (all LOINC-mapped types from T3-6)
- `CarePlan` — from T2-5
- `Claim` — T3-7a claim records projected to FHIR Claim resource shape
- `Encounter` — visit records from T2-10
- `Condition` — diagnoses
- `Practitioner` / `Organization` — location + care team members

**BullMQ job**
- `bulk-export.worker.ts`: concurrency 2, per-resource-type chunked writes to `./export-storage/bulk/:jobId/`, SHA-256 per file, emits `bulk:export:complete` / `bulk:export:failed` via Socket.IO; job progress via BullMQ `job.updateProgress()`

**DB layer**
- `bulk_export_jobs` table: `jobId`, `clientId` (FK → `smart_clients`), `locationId`, `requestedResourceTypes text[]`, `sinceFilter timestamptz`, `status` (PENDING/RUNNING/COMPLETE/FAILED/CANCELLED), `bullJobId`, `manifestJson JSONB`, `startedAt`, `completedAt`, `expiresAt`, `errorMessage`, RLS (read = client's own locationId + admin)

**Authorization**
- Kick-off requires valid SMART Backend Services token from T4-1 with `system/Patient.read` (+ each requested resource type's system scope)
- No user-session auth path — this endpoint is machine-to-machine only

**Required audit events**
- `BULK_EXPORT_REQUESTED` (clientId, resourceTypes, locationId)
- `BULK_EXPORT_COMPLETE` (jobId, fileCount, totalRecords)
- `BULK_EXPORT_FAILED` (jobId, reason)
- `BULK_EXPORT_DOWNLOADED` (jobId, filename, clientId)
- `BULK_EXPORT_CANCELLED` (jobId)

**Observability (admin UI)**
- `settings/smart/index.tsx` export-jobs tab (jobId, client, status, resource count, started/completed, expiry, download links)
- Failure reason surfaced inline

**Done when:** Authorized backend client sends `GET /Patient/$export` with `Prefer: respond-async`, receives `202` + `Content-Location`, polls status until `200` manifest, downloads per-resource-type NDJSON files with valid SHA-256 hashes, and all export activity is recorded in audit logs; `Content-Location` flow matches HL7 FHIR Bulk Data Access IG specification.

---

## T4-3 · eRx + EPCS Integration `HIGH`

`read:` `BE-SPEC` §Phase 5

> FireNote is the clearest public workflow benchmark (care-plan-native prescribing, pharmacy routing after signature). Axxess also competes on eRx presence. Public EPCS mechanics are thin for all competitors — Hospici must design the compliance layer rigorously itself. See `docs/qa/ERX_EPCS_COMPETITIVE_ANALYSIS.md`.
> `needs:` T2-6 (med list / allergy / pharmacy fields), T3-9 (physician order routing)

**EPCS compliance boundary — what DoseSpot/NewCrop own vs. what Hospici owns**
> DEA identity proofing (21 CFR §1311), 2FA device registration, and EPCS certification are **DoseSpot's / NewCrop's responsibility** — that is the core value of using a DEA-certified EPCS vendor. Hospici's job is to check and surface prescriber readiness status returned by the vendor, gate the controlled-substance UI on that flag, and store the audit trail the vendor sends back.

**Vendor integration (staging first)**
- DoseSpot or NewCrop SSO embed: launch prescribing UI in an iframe / redirect flow with patient + prescriber context
- Prescription events webhook / polling: new rx, renewal, discontinuation, pharmacy status sync
- Prescriber enrollment: call DoseSpot API to determine if a prescriber has completed EPCS enrollment; store `isEpcsEnabled: boolean` + `epcsEnrolledAt` on the prescriber record

**Non-controlled prescription flow**
- "Prescribe" action from medication list (`T2-6`) and care-plan context
- Prefill: patient demographics, allergies, current medications, pharmacy on file
- On completion: create medication record + link back to DoseSpot prescription ID
- On discontinuation: mark medication inactive + audit event

**Controlled-substance (EPCS) gating**
- Gate UI: if `prescriber.isEpcsEnabled === false` → show blocked state with specific reason ("EPCS enrollment not completed in DoseSpot") and link to enrollment
- If `prescriber.deaSchedules` empty → block + message ("No DEA registration on file")
- Never build or store 2FA tokens or DEA credentials — those live in DoseSpot
- Receive and store DoseSpot's EPCS audit record (prescription ID, prescriber NPI, schedule, timestamp, pharmacy NCPDP) for each controlled prescription

**Workflow integration**
- Prescribing from care-plan context (comfort kit, symptom management, plan-of-care change)
- Link prescriptions to physician orders (`T3-9` order context)
- Pharmacy coordination: reuse pharmacy fields from `T2-6`; no duplicate entry
- MAR updates on prescription fulfillment events (where vendor webhook supports it)

**Admin / ops visibility**
- `settings/integrations/erx.tsx`: DoseSpot/NewCrop enabled status, environment (sandbox/production), last connectivity check
- Prescriber readiness table: name, NPI, DEA schedules on file, EPCS enrolled status, enrolled date
- "Sync prescriber status" action (calls DoseSpot API, updates DB)

**Required audit events**
- `ERX_PRESCRIPTION_CREATED` (prescriberId, patientId, medicationName, schedule, rxId)
- `ERX_PRESCRIPTION_RENEWED`, `ERX_PRESCRIPTION_DISCONTINUED`
- `ERX_EPCS_BLOCKED` (reason: no_dea / not_enrolled / vendor_unavailable)
- `ERX_CONTROLLED_ISSUED` (schedule, DEA audit record from vendor stored)

**Done when:** Staging round-trip succeeds with DoseSpot or NewCrop; non-controlled prescriptions can be issued from medication workflow and appear in the med list; controlled-substance path is gated on `isEpcsEnabled` with clear blocked-state UX; EPCS audit records from the vendor are stored; prescriber readiness is visible to admins.

---

## T4-4 · Direct Secure Messaging `HIGH`

`read:` `BE-SPEC` §Phase 5, `SECURITY`

> No hospice competitor publicly details their DSM implementation. Kno2 is the dominant HISP partner in post-acute/hospice (marketed explicitly for that segment). Surescripts Direct and Availity Direct are also viable. All three provide a managed HISP so Hospici does not operate its own MTA or trust anchor. ONC §170.315(h)(2) certification is the compliance driver.
> `needs:` T3-6 (FHIR patient/observation — base for C-CDA assembly), T3-10 (record packet export — reuse document assembly patterns)

**What Direct Secure Messaging is**
> The Direct protocol (ONC §170.315(h)(2)) is an S/MIME-encrypted, trust-bundle-validated email transport for exchanging clinical documents (C-CDA R2.1) between HIPAA-covered entities. Hospici sends and receives via a HISP vendor; we do not operate an MTA or manage trust anchors directly.

**HISP vendor integration boundary**
- Vendor (Kno2 / Surescripts Direct / Availity Direct) owns: SMTP/IMAP MTA, S/MIME certificate issuance, DirectTrust community bundle, certificate validation
- Hospici owns: C-CDA document assembly, message composition UI, inbound document routing, patient matching, audit trail, BAA compliance
- Vendor API style: REST (Kno2 API) or SMTP relay with webhook callbacks — abstract behind a `DirectMessagingPort` interface so vendor is swappable

**Direct addresses**
- Each organization gets a Direct address: `location-slug@hospici.direct` (provisioned by HISP)
- Each clinician can optionally have an individual address: `npi@hospici.direct`
- Store `directAddress` on `locations` table and on `users` (nullable) table

**DB layer**
- `direct_messages` table: `id`, `locationId`, `direction` (OUTBOUND/INBOUND), `status` (DRAFT/QUEUED/SENT/DELIVERED/FAILED/RECEIVED/MATCHED/UNMATCHED), `fromAddress`, `toAddresses text[]`, `subject`, `messageId` (HISP-assigned), `threadId`, `patientId` (nullable — populated after match), `documentType` (C-CDA/XDM/OTHER), `cdaPayloadStorageKey` (encrypted S3/local path), `xdmMetadataJson JSONB`, `sentAt`, `receivedAt`, `failureReason`, `createdByUserId`, RLS (locationId-scoped)
- `direct_address_book` table: `id`, `locationId`, `displayName`, `organization`, `directAddress`, `npi` (nullable), `specialty`, `isVerified` (trust bundle lookup), `lastUsedAt` — for autocomplete and routing

**Outbound message flows (hospice-specific)**
1. **Referral acceptance / care summary** — on patient admit, send C-CDA Continuity of Care Document (CCD) to referring physician's Direct address
2. **Discharge summary on death or revocation** — triggered automatically from `patient.status → DECEASED` or `NOTRService`; compose C-CDA Discharge Summary, queue to PCP + referring on file
3. **Medication reconciliation** — send updated med list in C-CDA format to coordinating pharmacy or specialist when care plan changes
4. **Physician order acknowledgment** — send signed order confirmation back to ordering physician

**C-CDA R2.1 document assembly**
- `CcdaAssemblerService`: builds XML from Drizzle-fetched patient + clinical data; sections: Patient Demographics, Problems (diagnoses), Medications (T2-6), Allergies, Plan of Care (T2-5), Functional Status (pain assessments T2-3), Encounter History (T2-10)
- Reuse FHIR patient/observation projectors from T3-6 as data source (single source of truth)
- Output: valid C-CDA R2.1 XML; store encrypted at rest before sending to HISP API

**XDM packaging**
- Wrap C-CDA in XDM (IHE XDS.b metadata) when HISP requires it: `DocumentEntry` metadata (classCode, confidentialityCode, formatCode `urn:hl7-org:sdwg:ccda-structuredBody:2.1`, mimeType `text/xml`, patientId, creationTime, uniqueId)
- `XdmPackager`: accepts `CdaDocument` + metadata, emits XDM ZIP structure (`IHE_XDM/SUBSET01/DOCUMENT01.xml` + `METADATA.xml`)

**Inbound message handling**
- HISP webhook (or polling job every 5 min) → `DirectInboundWorker` (BullMQ)
- Steps: (1) validate sender trust (HISP performs cert check; Hospici confirms `isVerified` in address book), (2) decrypt payload via HISP API, (3) store encrypted CDA, (4) attempt patient match via MRN in CDA header or demographics fuzzy match (name + DOB + NPI), (5) emit `direct:message:received` Socket.IO event to clinical staff, (6) route to unified inbox if unmatched
- Unmatched messages queue in `direct_messages` with `status=UNMATCHED` for manual review

**Inbox / outbox UI**
- `messaging/direct/index.tsx` — inbox table: sender, patient match badge, document type, received timestamp, status, "View" / "Assign to patient" CTA
- `messaging/direct/compose.tsx` — compose form: patient selector (prefills demographics), recipient Direct address (autocomplete from address book + manual entry), document type selector, send CTA
- `messaging/direct/:messageId.tsx` — message detail: rendered CDA summary (key sections only — no raw XML), patient match status, reply CTA, audit history
- Address book management: `settings/direct/address-book.tsx` — add/edit/verify recipient organizations

**Admin / ops visibility**
- `settings/integrations/direct.tsx`: HISP vendor enabled status, Direct address provisioned, connectivity check ("Send test message"), last inbound poll timestamp, certificate expiry warning (HISP-managed but surfaced)
- Location-level Direct address: visible on location settings page

**Required audit events**
- `DIRECT_MESSAGE_SENT` (messageId, toAddresses, documentType, patientId, senderId)
- `DIRECT_MESSAGE_DELIVERED` (messageId, deliveredAt from HISP callback)
- `DIRECT_MESSAGE_FAILED` (messageId, reason)
- `DIRECT_MESSAGE_RECEIVED` (messageId, fromAddress, documentType, patientId or UNMATCHED)
- `DIRECT_MESSAGE_MATCHED` (messageId, patientId, matchedByUserId)
- `DIRECT_CDA_ASSEMBLED` (patientId, documentType, sections included)

**PHI handling**
- C-CDA payloads contain PHI — store using `PhiEncryptionService` (T1-5), never in plaintext at rest
- Never log CDA content via Pino — log only messageId, direction, documentType
- HISP vendor requires BAA — track in T3-8 BAA registry with `serviceType = HISP`

**Done when:** Outbound C-CDA CCD sends to a test Direct address via staging HISP and delivery is confirmed; inbound test message arrives, triggers BullMQ worker, patient-matches, and appears in inbox with document summary; discharge-trigger automation fires on patient death/revocation and queues outbound message; all message events are in the audit log; XDM packaging validates against IHE XDM profile; PHI encrypted at rest throughout.

---

## T4-5 · DDE/FISS Integration `HIGH`

- CMS Direct Data Entry for NOE/NOTR submission
- Deferred from T3-2
- Requires CMS HETS enrollment

---

## T4-6 · TypeBox AOT CI verification `LOW`

CI check that no `TypeCompiler.Compile()` call exists outside `typebox-compiler.ts`.

Valkey caching for FHIR `$everything` and cap year data.

**Done when:** Lint gate passes; Valkey hit rate >95% under load

---

## T4-7 · Load testing `MEDIUM`

- k6 suite
- Target: p99 API response <200ms
- `EXPLAIN ANALYZE` on all cap/billing queries

---

## T4-8 · Error monitoring `LOW`

- Sentry SDK
- PHI scrubbed in `beforeSend`
- Wire to Fastify error handler + BullMQ worker errors

---

## T4-9 · Predictive analytics `HIGH`

> Adds `RAPID_DECLINE_RISK`, `REVOCATION_RISK`, and length-of-stay variance signals to the T2-8 alert system. Requires sufficient pain assessment + visit data to train/run models.

`needs:` T2-8 (alert service), T2-10 (visit scheduling), T4-7 (load tested baseline)

**Signals to derive (rule-based first, ML later):**
- `RAPID_DECLINE_RISK` — ESAS total score increase ≥30% in 14 days OR ≥2 new symptoms in last IDG
- `REVOCATION_RISK` — patient hospitalized >3 days in 30-day window OR caregiver distress flag
- `LENGTH_OF_STAY_VARIANCE` — patient in care >180 days AND last IDG did not document continued decline

**Implementation approach:**
1. Phase 1: Rule-based queries in a new BullMQ daily job (`predictive-risk.worker.ts`) — no external ML, pure SQL + TypeScript
2. Phase 2: Optional — pipe features to external model endpoint (configurable, fail-open)

**AlertType additions:**
- `RAPID_DECLINE_RISK` — severity: `warning` — snoozeable (not a CMS hard block)
- `REVOCATION_RISK` — severity: `warning` — snoozeable
- `SUITABILITY_REVIEW` — severity: `info` — for length-of-stay outliers

**PHI:** Risk scores are derived values, not PHI themselves, but trigger display of patient context — follow same PHI_ACCESS role gate as all T2-8 alerts.

**Done when:** Rule-based daily job produces `RAPID_DECLINE_RISK` alerts for qualifying patients; alerts appear in T2-8 dashboard under a distinct "Risk" filter tab; PHI access gate enforced; no real ML model required for Phase 1 done-state
