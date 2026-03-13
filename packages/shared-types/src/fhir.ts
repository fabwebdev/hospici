/**
 * FHIR R4 Resource Types
 * Shared types for FHIR R4 Patient + Observation endpoints (T3-6)
 */

// ── FHIR Primitive Types ─────────────────────────────────────────────────────

export type FhirId = string;
export type FhirUri = string;
export type FhirDate = string;
export type FhirDateTime = string;
export type FhirInstant = string;

// ── FHIR Datatypes ───────────────────────────────────────────────────────────

export interface FhirCoding {
  system?: FhirUri;
  version?: string;
  code?: string;
  display?: string;
  userSelected?: boolean;
}

export interface FhirCodeableConcept {
  coding?: FhirCoding[];
  text?: string;
}

export interface FhirIdentifier {
  use?: "usual" | "official" | "temp" | "secondary" | "old";
  type?: FhirCodeableConcept;
  system?: FhirUri;
  value?: string;
}

export interface FhirHumanName {
  use?: "usual" | "official" | "temp" | "nickname" | "anonymous" | "old" | "maiden";
  text?: string;
  family?: string;
  given?: string[];
  prefix?: string[];
  suffix?: string[];
}

export interface FhirAddress {
  use?: "home" | "work" | "temp" | "old" | "billing";
  type?: "postal" | "physical" | "both";
  text?: string;
  line?: string[];
  city?: string;
  district?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface FhirContactPoint {
  system?: "phone" | "fax" | "email" | "pager" | "url" | "sms" | "other";
  value?: string;
  use?: "home" | "work" | "temp" | "old" | "mobile";
}

export interface FhirReference {
  reference?: string;
  type?: FhirUri;
  identifier?: FhirIdentifier;
  display?: string;
}

export interface FhirQuantity {
  value?: number;
  comparator?: "<" | "<=" | ">=" | ">";
  unit?: string;
  system?: FhirUri;
  code?: string;
}

// ── US Core Patient Profile ───────────────────────────────────────────────────

export interface FhirPatient {
  resourceType: "Patient";
  id?: FhirId;
  meta?: {
    versionId?: string;
    lastUpdated?: FhirInstant;
    profile?: FhirUri[];
  };
  identifier: FhirIdentifier[];
  active?: boolean;
  name: FhirHumanName[];
  telecom?: FhirContactPoint[];
  gender: "male" | "female" | "other" | "unknown";
  birthDate?: FhirDate;
  deceasedBoolean?: boolean;
  deceasedDateTime?: FhirDateTime;
  address?: FhirAddress[];
  managingOrganization?: FhirReference;
}

// ── US Core Observation Profile ───────────────────────────────────────────────

export interface FhirObservation {
  resourceType: "Observation";
  id?: FhirId;
  meta?: {
    versionId?: string;
    lastUpdated?: FhirInstant;
    profile?: FhirUri[];
  };
  status:
    | "registered"
    | "preliminary"
    | "final"
    | "amended"
    | "corrected"
    | "cancelled"
    | "entered-in-error"
    | "unknown";
  category?: FhirCodeableConcept[];
  code: FhirCodeableConcept;
  subject: FhirReference;
  effectiveDateTime?: FhirDateTime;
  effectivePeriod?: {
    start?: FhirDateTime;
    end?: FhirDateTime;
  };
  issued?: FhirInstant;
  performer?: FhirReference[];
  valueQuantity?: FhirQuantity;
  valueCodeableConcept?: FhirCodeableConcept;
  valueString?: string;
  valueBoolean?: boolean;
  valueInteger?: number;
  interpretation?: FhirCodeableConcept[];
  note?: Array<{ text: string }>;
  component?: Array<{
    code: FhirCodeableConcept;
    valueQuantity?: FhirQuantity;
    valueCodeableConcept?: FhirCodeableConcept;
    valueString?: string;
  }>;
}

// ── FHIR Bundle ───────────────────────────────────────────────────────────────

export interface FhirBundleEntry {
  fullUrl?: FhirUri;
  resource?: FhirPatient | FhirObservation;
  search?: {
    mode?: "match" | "include" | "outcome";
    score?: number;
  };
}

export interface FhirBundle {
  resourceType: "Bundle";
  id?: FhirId;
  meta?: {
    versionId?: string;
    lastUpdated?: FhirInstant;
  };
  type:
    | "document"
    | "message"
    | "transaction"
    | "transaction-response"
    | "batch"
    | "batch-response"
    | "history"
    | "searchset"
    | "collection";
  total?: number;
  link?: Array<{
    relation: string;
    url: FhirUri;
  }>;
  entry?: FhirBundleEntry[];
}

// ── Search Parameters ─────────────────────────────────────────────────────────

export interface PatientSearchQuery {
  _id?: string;
  identifier?: string;
  given?: string;
  family?: string;
  name?: string;
  gender?: "male" | "female" | "other" | "unknown";
  birthdate?: string;
  _count?: number;
  _page?: number;
}

export interface ObservationSearchQuery {
  _id?: string;
  patient?: string;
  subject?: string;
  code?: string;
  category?: string;
  date?: string;
  "date-gt"?: string;
  "date-lt"?: string;
  "date-ge"?: string;
  "date-le"?: string;
  _count?: number;
  _page?: number;
}

// ── SMART on FHIR ─────────────────────────────────────────────────────────────

export interface SmartScope {
  scopeType: "patient" | "user" | "system";
  resource: string;
  action: "read" | "write" | "*";
}

// ── OperationOutcome ──────────────────────────────────────────────────────────

export interface OperationOutcomeIssue {
  severity: "fatal" | "error" | "warning" | "information";
  code: string;
  diagnostics?: string;
  details?: FhirCodeableConcept;
}

export interface OperationOutcome {
  resourceType: "OperationOutcome";
  id?: FhirId;
  issue: OperationOutcomeIssue[];
}

// ── Capability Statement ──────────────────────────────────────────────────────

export interface FhirCapabilityStatement {
  resourceType: "CapabilityStatement";
  id?: string;
  status: "draft" | "active" | "retired" | "unknown";
  kind: "instance" | "capability" | "requirements";
  date: string;
  software?: {
    name: string;
    version?: string;
  };
  implementation?: {
    description: string;
    url?: string;
  };
  fhirVersion: string;
  format: string[];
  rest?: Array<{
    mode: "server" | "client";
    security?: {
      cors?: boolean;
      service?: FhirCodeableConcept[];
      extension?: unknown[];
    };
    resource: Array<{
      type: string;
      profile?: string;
      interaction: Array<{ code: string }>;
      searchParam?: Array<{
        name: string;
        type: string;
      }>;
    }>;
  }>;
}
