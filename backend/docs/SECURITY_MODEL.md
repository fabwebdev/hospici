# SECURITY_MODEL.md — Hospici Security Architecture

> **Classification:** Internal — Confidential
> **Version:** 3.0 | **Date:** 2026-03-11
> **Owner:** Security Lead (Petra agent)

---

## 1. Security Architecture Overview

Hospici implements a layered security model:

```
Request
  │
  ├─ TLS 1.3 (in transit)
  │
  ├─ Fastify Middleware
  │   ├─ Helmet (HTTP security headers)
  │   ├─ CORS (origin validation)
  │   ├─ Rate limiting (Valkey-backed)
  │   ├─ JWT authentication (Better Auth)
  │   └─ CSRF protection
  │
  ├─ Authorization
  │   ├─ ABAC (Attribute-Based Access Control via CASL)
  │   │   ├─ 30 granular roles
  │   │   ├─ Role groups for policy management
  │   │   └─ Condition-based access rules
  │   └─ RLS (PostgreSQL Row-Level Security)
  │       ├─ Location-scoped access
  │       ├─ Role-based filtering
  │       └─ Helper functions for complex rules
  │
  ├─ Data Layer
  │   ├─ AES-256 (PHI at rest via pgcrypto)
  │   ├─ Audit logging (immutable, append-only)
  │   └─ Break-glass (emergency access)
  │
  └─ Response
      └─ PHI field encryption (preSerialization hook)
```

---

## 2. Authentication

### Better Auth Configuration

```typescript
// config/auth.config.ts
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  session: {
    expiresIn: 3600,        // 1 hour
    cookieCache: {
      enabled: true,
      maxAge: 60,           // 1 minute client-side cache
    },
  },
  plugins: [
    passkey(),              // WebAuthn/FIDO2
    twoFactor(),            // TOTP
    multiSession(),         // Multiple location support
  ],
});
```

### Session Schema

```typescript
export const SessionSchema = Type.Object({
  userId: Type.String({ format: "uuid" }),
  locationId: Type.String({ format: "uuid" }),   // current working location
  role: UserRoleSchema,                          // 30 granular roles
  abacAttributes: Type.Object({
    locationIds: Type.Array(Type.String({ format: "uuid" })), // authorized locations
    permissions: Type.Array(Type.String()),      // additional granular permissions
    discipline: Type.Optional(Type.String()),    // clinical discipline
    supervisedLocationIds: Type.Optional(Type.Array(Type.String({ format: "uuid" }))),
    licenseNumber: Type.Optional(Type.String()),
    licenseExpiresAt: Type.Optional(Type.String({ format: "date-time" })),
  }),
  availableLocationIds: Type.Array(Type.String({ format: "uuid" })),
  breakGlass: Type.Boolean({ default: false }),
  expiresAt: Type.Number(), // Unix timestamp
});
```

---

## 3. ABAC Model (Attribute-Based Access Control)

### Policy Structure

```typescript
export const ABACPolicySchema = Type.Object({
  resource: Type.String(),      // "patient", "claim", "audit_log", etc.
  action: Type.Enum({ 
    read: "read", 
    write: "write", 
    delete: "delete", 
    sign: "sign",
    export: "export",
    admin: "admin"
  }),
  conditions: Type.Array(Type.Object({
    attribute: Type.String(),   // "locationId", "role", "breakGlass", "noteType"
    operator: Type.Enum({ eq: "eq", in: "in", contains: "contains", gte: "gte", lte: "lte", startsWith: "startsWith" }),
    value: Type.Unknown()
  })),
  effect: Type.Enum({ allow: "allow", deny: "deny" }),
  priority: Type.Optional(Type.Number()),  // Higher overrides lower
  description: Type.Optional(Type.String())
});
```

### Complete Role Definitions (30 Roles)

#### Clinical Disciplines (Direct Patient Care)

| Role | Description | Clinical | Billing | Admin | Audit |
|------|-------------|----------|---------|-------|-------|
| `registered_nurse` | RN case managers | Full | None | None | Own |
| `lpn` | Licensed Practical Nurse | Limited | None | None | Own |
| `social_worker` | LCSW/MSW | Write | None | None | Own |
| `chaplain` | Spiritual care coordinator | Write | None | None | Own |
| `physical_therapist` | PT | Write | None | None | Own |
| `occupational_therapist` | OT | Write | None | None | Own |
| `speech_therapist` | SLP | Write | None | None | Own |
| `dietitian` | RD | Write | None | None | Own |
| `aide_cna` | CNA | Limited | None | None | Own |
| `aide_hha` | HHA | Limited | None | None | Own |

#### Physician Hierarchy

| Role | Description | Clinical | Billing | Admin | Audit |
|------|-------------|----------|---------|-------|-------|
| `physician_attending` | Attending of record | Full | None | None | Own |
| `physician_np` | Nurse Practitioner | Full | None | None | Own |
| `medical_director` | Hospice medical director | Full | Read | Location | Location |
| `physician_consultant` | Consulting specialist | Read | None | None | Own |

#### Operational Staff

| Role | Description | Clinical | Billing | Admin | Audit |
|------|-------------|----------|---------|-------|-------|
| `intake_coordinator` | Admissions/referrals | Read | Read | None | Own |
| `scheduler` | Visit scheduling | None | None | None | Own |
| `volunteer` | Hospice volunteers | None | None | None | Own |
| `volunteer_coordinator` | Manages volunteers | Read | None | None | Own |
| `bereavement_coordinator` | Grief support | Read | None | None | Own |
| `emergency_oncall` | After-hours clinician | Full | None | None | Own |

#### Administrative & Oversight

| Role | Description | Clinical | Billing | Admin | Audit |
|------|-------------|----------|---------|-------|-------|
| `billing_specialist` | Claims processing | Read only | Full | None | Own |
| `revenue_manager` | RCM oversight | Read | Full | Read | Location |
| `clinical_supervisor_rn` | Clinical supervisor | Full | Read | Location | Location |
| `clinical_director` | Director of Nursing | Full | Read | Location | Location |
| `quality_assurance` | QAPI staff | Read | Read | None | Location |
| `compliance_officer` | HIPAA/compliance | Read | Read | Read | Full |
| `operations_manager` | Operations | Read | Read | Location | Location |
| `hr_admin` | Personnel only | None | None | None | Own |
| `admin` | Location administrator | Full | Full | Location | Full |
| `super_admin` | System administrator | Full | Full | Full | Full |

#### External & Portal

| Role | Description | Clinical | Billing | Admin | Audit |
|------|-------------|----------|---------|-------|-------|
| `pharmacy_consultant` | Consulting pharmacist | Read* | None | None | Own |
| `dme_coordinator` | Equipment coordinator | Read* | Read | None | Own |
| `surveyor_state` | State auditor | Read* | Read* | None | Location |
| `surveyor_accreditation` | TJC/ACHC | Read* | Read* | None | Location |
| `family_caregiver` | Patient's family | None | None | None | Own |
| `patient_portal` | Patient themselves | None | Read | None | Own |

*Limited to specific fields

### Role Groups

Role groups simplify policy management by grouping related roles:

```typescript
const RoleGroups = {
  CLINICAL_DIRECT: ["registered_nurse", "lpn", "social_worker", "chaplain", 
                    "physical_therapist", "occupational_therapist", 
                    "speech_therapist", "dietitian"],
  CLINICAL_AIDE: ["aide_cna", "aide_hha"],
  ALL_CLINICAL: [/* all 10 clinical roles */],
  PHYSICIAN: ["physician_attending", "physician_np", "medical_director"],
  ALL_PROVIDERS: [/* all providers including consultants */],
  BILLING: ["billing_specialist", "revenue_manager"],
  SUPERVISORY: ["clinical_supervisor_rn", "clinical_director", "medical_director"],
  ADMINISTRATIVE: ["admin", "super_admin", "operations_manager"],
  QUALITY_COMPLIANCE: ["quality_assurance", "compliance_officer"],
  EXTERNAL: ["pharmacy_consultant", "dme_coordinator"],
  SURVEYOR: ["surveyor_state", "surveyor_accreditation"],
  PORTAL: ["family_caregiver", "patient_portal"],
  LIMITED: ["volunteer", "scheduler", "hr_admin"],
  EMERGENCY: ["emergency_oncall"],
  BEREAVEMENT: ["bereavement_coordinator"],
  VOLUNTEER: ["volunteer", "volunteer_coordinator"],
  INTAKE: ["intake_coordinator"],
};
```

### ABAC Policy Examples

```typescript
// 1. Clinicians can only access patients in their assigned locations
const clinicianPatientPolicy: ABACPolicy = {
  resource: "patient",
  action: "read",
  conditions: [{
    attribute: "locationId",
    operator: "in",
    value: session.abacAttributes.locationIds,
  }],
  effect: "allow",
  description: "Clinicians access patients in assigned locations",
};

// 2. Billing cannot access clinical notes
const billingClinicalNotesDeny: ABACPolicy = {
  resource: "clinical_note",
  action: "read",
  conditions: [{ attribute: "role", operator: "eq", value: "billing_specialist" }],
  effect: "deny",
  priority: 100,
  description: "Billing staff cannot view detailed clinical notes",
};

// 3. Aides can only document ADLs
const aideDocumentationPolicy: ABACPolicy = {
  resource: "clinical_note",
  action: "write",
  conditions: [
    { attribute: "role", operator: "in", value: ["aide_cna", "aide_hha"] },
    { attribute: "noteType", operator: "eq", value: "adl_documentation" }
  ],
  effect: "allow",
  description: "Aides can only document ADLs",
};

// 4. Break-glass allows emergency access
const breakGlassPolicy: ABACPolicy = {
  resource: "patient",
  action: ["read", "write"],
  conditions: [{ attribute: "breakGlass", operator: "eq", value: true }],
  effect: "allow",
  priority: 200,
  description: "Break-glass emergency access",
};

// 5. Surveyor limited access during survey
const surveyorPolicy: ABACPolicy = {
  resource: "patient",
  action: "read",
  conditions: [
    { attribute: "role", operator: "in", value: ["surveyor_state", "surveyor_accreditation"] },
    { attribute: "surveyType", operator: "in", value: ["complaint", "recertification", "annual", "accreditation"] }
  ],
  effect: "allow",
  description: "Surveyor read access during active survey",
};
```

### Using ABACService

```typescript
import { ABACService, can, isInGroup } from "@/contexts/identity/services/abac.service.js";

// Check permission
if (ABACService.can(userRole, "write", "patient", { resourceAttributes: { locationId } })) {
  // Allow action
}

// Check role group membership
if (isInGroup(userRole, "CLINICAL_DIRECT")) {
  // Show clinical interface
}

// Get role definition
const roleDef = ABACService.getRoleDefinition("registered_nurse");
console.log(roleDef.clinical); // "full"

// Get all allowed actions
const actions = ABACService.getAllowedActions("admin", "patient");
// ["read", "write", "admin"]
```

---

## 4. Row-Level Security (RLS)

### Context Injection (Parameterized — No Exceptions)

```typescript
// ✅ CORRECT — parameterized set_config
fastify.addHook("preHandler", async (request) => {
  const { id: userId, role } = request.user;
  const locationId = request.session.locationId;

  await db.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
  await db.execute(sql`SELECT set_config('app.current_location_id', ${locationId}, true)`);
  await db.execute(sql`SELECT set_config('app.current_role', ${role}, true)`);
});
```

### Helper Functions

```sql
-- Check role group membership
CREATE OR REPLACE FUNCTION current_role_in_group(group_name TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    current_role TEXT := current_setting('app.current_role', true);
BEGIN
    RETURN CASE group_name
        WHEN 'CLINICAL_DIRECT' THEN current_role IN (...)
        WHEN 'ADMINISTRATIVE' THEN current_role IN ('admin', 'super_admin', ...)
        -- ... etc
    END;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Check clinical access level
CREATE OR REPLACE FUNCTION role_has_clinical_access(required_level TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    current_role TEXT := current_setting('app.current_role', true);
    role_level TEXT;
BEGIN
    role_level := CASE current_role
        WHEN 'super_admin' THEN 'full'
        WHEN 'registered_nurse' THEN 'full'
        WHEN 'lpn' THEN 'limited'
        -- ... etc
    END;
    
    RETURN CASE required_level
        WHEN 'full' THEN role_level IN ('full')
        WHEN 'write' THEN role_level IN ('full', 'write')
        -- ... etc
    END;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
```

### RLS Policy Registry

| Table | Policy Name | Access | Filter |
|-------|-------------|--------|--------|
| `users` | `users_select` | SELECT | Self + Admin + HR + Supervisory |
| `users` | `users_insert` | INSERT | Admin + HR |
| `users` | `users_update` | UPDATE | Self + Admin + HR + Supervisor of clinical staff |
| `users` | `users_delete` | DELETE | Admin only |
| `audit_logs` | `audit_logs_insert` | INSERT | Any authenticated |
| `audit_logs` | `audit_logs_select` | SELECT | Location + Admin + Supervisory + QA + Surveyor |
| `patients` | `patients_select` | SELECT | Location + Clinical + Admin + Billing + QA + Intake + Scheduler |
| `patients` | `patients_insert` | INSERT | Location + Intake + Admin + Supervisory |
| `patients` | `patients_update` | UPDATE | Location + Clinical(write) + Admin + Supervisory |
| `patients` | `patients_delete` | DELETE | Admin only |
| `pain_assessments` | `pain_assessments_select` | SELECT | Location + Clinical + Supervisory + QA (NOT billing) |
| `pain_assessments` | `pain_assessments_insert` | INSERT | Location + Clinical(limited) + Own records only |
| `notice_of_election` | `noe_select` | SELECT | Location + Billing + Admin + Supervisory + Physician |
| `notice_of_election` | `noe_insert` | INSERT | Location + Billing + Admin |
| `notice_of_election` | `noe_update` | UPDATE | Location + Billing + Admin |
| `benefit_periods` | `benefit_periods_select` | SELECT | Location + Clinical + Billing + Admin + Supervisory |
| `benefit_periods` | `benefit_periods_insert` | INSERT | Location + Billing + Admin + Intake |
| `benefit_periods` | `benefit_periods_update` | UPDATE | Location + Billing + Admin |
| `idg_meetings` | `idg_meetings_select` | SELECT | Location + Clinical + Admin + Supervisory |
| `idg_meetings` | `idg_meetings_insert` | INSERT | Location + Clinical + Admin + Scheduler |
| `idg_meetings` | `idg_meetings_update` | UPDATE | Location + Clinical + Admin + Scheduler |
| `aide_supervisions` | `aide_supervisions_select` | SELECT | Location + Supervisory + Aides + RN |
| `aide_supervisions` | `aide_supervisions_insert` | INSERT | Location + Supervisory |

---

## 5. PHI Field Inventory

The following fields are classified as Protected Health Information and are **encrypted at rest** via pgcrypto (`pgp_sym_encrypt`):

| Field | Table | Encryption |
|-------|-------|-----------|
| `ssn` | `patients` | AES-256 via pgcrypto |
| `date_of_birth` | `patients` | AES-256 via pgcrypto |
| `mrn` | `patients` | AES-256 via pgcrypto |
| `last_name`, `first_name` | `patients` | AES-256 via pgcrypto |
| `address` (full) | `patients` | AES-256 via pgcrypto |
| `phone_number` | `patients` | AES-256 via pgcrypto |
| `email` | `patients` | AES-256 via pgcrypto |
| `diagnosis_code` | `primary_diagnoses` | AES-256 via pgcrypto |
| `signature_data` | `electronic_signatures` | AES-256 via pgcrypto |
| `clinical_notes` content | `nursing_notes` | AES-256 via pgcrypto |

**PHI must never be:**
- Logged via Pino (use `redact` config)
- Returned in error messages to the client
- Stored unencrypted in Valkey cache
- Stored in the `storage/` directory

### Encryption Service

```typescript
// contexts/identity/services/EncryptionService.service.ts
export class EncryptionService {
  async encryptPHI(value: string): Promise<string> {
    const result = await db.execute(
      sql`SELECT pgp_sym_encrypt(${value}, ${process.env.PHI_ENCRYPTION_KEY}) AS encrypted`
    );
    return result.rows[0].encrypted as string;
  }

  async decryptPHI(encrypted: string): Promise<string> {
    const result = await db.execute(
      sql`SELECT pgp_sym_decrypt(${encrypted}::bytea, ${process.env.PHI_ENCRYPTION_KEY}) AS decrypted`
    );
    return result.rows[0].decrypted as string;
  }
}
```

---

## 6. Audit Logging

### Audit Log Schema

```typescript
export const AuditLogSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  userId: Type.String({ format: "uuid" }),
  userRole: Type.String(),                    // Now includes 30 roles
  locationId: Type.String({ format: "uuid" }),
  action: Type.Enum({
    view: "view",
    create: "create",
    update: "update",
    delete: "delete",
    sign: "sign",
    export: "export",
    breakGlass: "break_glass",
    login: "login",
    logout: "logout",
    access_denied: "access_denied",           // New: permission denied
    role_changed: "role_changed",             // New: role modification
  }),
  resourceType: Type.String(),
  resourceId: Type.String({ format: "uuid" }),
  ipAddress: Type.Optional(Type.String()),
  userAgent: Type.Optional(Type.String()),
  timestamp: Type.String({ format: "date-time" }),
  details: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});
```

### Audit Log Rules

- **Retention:** 6 years (HIPAA minimum)
- **Immutability:** No UPDATE or DELETE policies exist on `audit_logs`
- **Partitioning:** Table is partitioned by month for query performance
- **All PHI access:** Every SELECT on a PHI-containing table generates an audit entry
- **Access denials:** Failed permission checks are logged for security monitoring
- **Service:** Always use `AuditService.log()` — never insert directly

---

## 7. Break-Glass Emergency Access

### Schema

```typescript
export const BreakGlassSchema = Type.Object({
  userId: Type.String({ format: "uuid" }),
  reason: Type.String({ minLength: 20 }),          // Enforced minimum
  patientId: Type.String({ format: "uuid" }),
  requestedAt: Type.String({ format: "date-time" }),
  expiresAt: Type.String({ format: "date-time" }),  // Maximum 4 hours
  approvedBy: Type.Optional(Type.String({ format: "uuid" })),
  reviewStatus: Type.Optional(Type.Enum({
    pending: "pending",
    approved: "approved",
    rejected: "rejected",
    needs_review: "needs_review",
  })),
});
```

### Break-Glass Workflow

1. Clinician requests break-glass access with reason (≥ 20 chars)
2. System grants immediate access (no delay — clinical urgency)
3. Access logged in `audit_logs` with `action: "break_glass"`
4. Supervisor notified within 5 minutes via notification service
5. Access expires after 4 hours automatically (Valkey TTL)
6. Supervisor must review and document outcome within 24 hours

### Eligible Roles

Break-glass access is available to:
- `emergency_oncall` — Full emergency access
- `registered_nurse` — When on-call and urgent need
- `physician_attending` — Emergency consultations
- `clinical_supervisor_rn` — Override for urgent review
- `medical_director` — Any urgent clinical situation

---

## 8. SMART on FHIR Security

See `HOSPICI_BACKEND_SPECIFICATION.md §11` for the complete scope registry.

### JWKS Endpoint

```typescript
// GET /.well-known/jwks.json
export const JWKSchema = Type.Object({
  kty: Type.String(),
  kid: Type.String(),
  use: Type.Optional(Type.String()),
  n: Type.String(), // RSA modulus
  e: Type.String(), // RSA exponent
  alg: Type.Literal("RS256"),
});
```

### Key Rotation

Keys are rotated every 90 days. Procedure documented in `docs/security/key-rotation.md`.

---

## 9. Encryption Key Management

| Key | Purpose | Rotation | Storage |
|-----|---------|---------|---------|
| `PHI_ENCRYPTION_KEY` | pgcrypto PHI encryption | 90 days | AWS Secrets Manager / Vault |
| `BETTER_AUTH_SECRET` | Session signing | 180 days | AWS Secrets Manager / Vault |
| `SMART JWKS private key` | FHIR auth | 90 days | AWS Secrets Manager / Vault |
| `Valkey requirepass` | Cache auth | 180 days | AWS Secrets Manager / Vault |

**Emergency key compromise procedure:** See `docs/security/incident-response.md`.

---

## 10. Migration Notes

### From v2.0 to v3.0 (Role Expansion)

1. **Database Migration:** Run `0001_enhanced_roles_rls.sql`
2. **Role Mapping:** Update existing users:
   - `clinician` → `registered_nurse` (default) or specific discipline
   - `physician` → `physician_attending` or `physician_np`
   - `aide` → `aide_cna` or `aide_hha`
   - `billing` → `billing_specialist`
   - `supervisor` → `clinical_supervisor_rn`
   
3. **ABAC Policies:** Service automatically loads new role definitions
4. **RLS Policies:** Database migration updates all policies
5. **Testing:** Verify all role transitions in staging

### Deprecated Roles (v2.0)

| Old Role | New Role | Migration |
|----------|----------|-----------|
| `clinician` | `registered_nurse` | Map based on actual discipline |
| `physician` | `physician_attending` | Map based on actual title |
| `aide` | `aide_cna` / `aide_hha` | Map based on certification |
| `billing` | `billing_specialist` | Direct mapping |
| `supervisor` | `clinical_supervisor_rn` | Direct mapping |

---

_SECURITY_MODEL.md v3.0 — Hospici Security Architecture — Confidential_
