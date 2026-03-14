# PHI Detection Reference

HIPAA Safe Harbor identifiers per 45 CFR §164.514(b)(2) — all 18 must be protected.
Hospici must never expose these in logs, API responses, error messages, or temp files.

---

## Regex Patterns

```yaml
phi_patterns:
  ssn:
    regex: '\b\d{3}-\d{2}-\d{4}\b|\b\d{9}\b'
    severity: critical
    description: Social Security Number

  mrn:
    regex: 'mrn[:\s=]*[A-Z0-9\-]{4,20}'
    severity: critical
    description: Medical Record Number

  npi:
    regex: '\b[1-9]\d{9}\b'
    severity: critical
    description: National Provider Identifier (10-digit)

  dob:
    regex: '\b(0[1-9]|1[0-2])[\/\-](0[1-9]|[12]\d|3[01])[\/\-](19|20)\d{2}\b'
    severity: critical
    description: Date of Birth

  phone:
    regex: '\b(\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b'
    severity: warning
    description: Phone Number

  email_in_log:
    regex: '[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}'
    severity: warning
    description: Email address in non-email-service context

  zip_plus4:
    regex: '\b\d{5}-\d{4}\b'
    severity: info
    description: ZIP+4 (unique geo identifier under Safe Harbor)

  ip_address:
    regex: '\b(?:\d{1,3}\.){3}\d{1,3}\b'
    severity: info
    description: IP address (can identify individuals)
```

---

## Field Name Patterns (Semantic Scan)

Flag any variable, object key, or DB column name matching these patterns in non-encrypted, non-masked contexts:

```
patient_name, first_name, last_name, full_name
date_of_birth, dob, birth_date
social_security, ssn, social_security_number
medical_record, mrn, medical_record_number
diagnosis, icd_code, icd10, primary_diagnosis
medication, drug_name, prescription
address, street, city, state, zip, postal
phone, cell, mobile, telephone, fax
email, email_address
npi, provider_id, physician_id
insurance_id, medicare_id, medicaid_id, beneficiary_id
clinical_notes, care_notes, visit_notes, soap_notes
```

---

## Log Statement Scan

Scan all files for logger calls containing PHI field references:

```typescript
// BAD — always flag
console.log('Patient data:', patient)
logger.info({ ssn: patient.ssn }, 'Processing claim')
pino.debug(`MRN: ${patient.mrn}`)

// OK — acceptable
logger.info({ patientId: patient.id }, 'Claim processed')
logger.error({ claimId }, 'Claim failed')
```

**Rule**: Only `patient.id` (UUID) and anonymous identifiers are safe to log.
Never log PII/PHI fields even at debug level — logs may be shipped to external services.

---

## API Response Payload Inspection

For each Fastify route returning patient data:

1. Locate the response serializer or `reply.send()` call
2. Check against the allowlist of safe fields:

```typescript
// SAFE fields for public/standard responses
const SAFE_PATIENT_FIELDS = [
  'id',           // UUID only
  'status',       // admission status
  'episode_id',
  'created_at',
  'updated_at',
  'assigned_team_id',
]

// All other fields require:
// a) Role check (clinician, admin) AND
// b) Purpose limitation (clinical route, not generic list)
```

3. Flag any route returning fields outside SAFE_PATIENT_FIELDS without explicit auth + purpose check.

---

## Temp File / Disk PHI Scan

Workers that write temp files (fax, document generation, export):

- Check that temp files use `os.tmpdir()` + UUID filename (not patient name)
- Check that temp files are deleted after use (`fs.unlink` in finally block)
- Check that temp directories are not world-readable (`chmod 600`)

---

## Semantic Reasoning Pass

After regex and field-name scans, apply Claude reasoning to flag:

> "Does this code path, data structure, or API response have a reasonable chance of exposing
> patient-identifiable information to an unauthorized party, even if no regex matched?"

Examples of semantic catches:
- A function named `getPatientSummary()` that logs its full return value
- An error handler that serializes the full request body (which may contain PHI)
- A caching layer that uses patient name or DOB as the cache key
- A URL that embeds patient MRN as a path parameter (visible in access logs)
