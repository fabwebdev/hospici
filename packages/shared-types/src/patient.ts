// shared-types/patient.ts
// Patient response types shared between backend and frontend.
// Zero runtime dependencies — TypeScript interfaces only.

export interface HumanName {
  use?: "usual" | "official" | "temp" | "nickname" | "old" | "maiden";
  family: string;
  given: string[];
}

export interface PatientAddress {
  use?: "home" | "work" | "temp" | "old" | "billing";
  line: string[];
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface PatientIdentifier {
  system: string;
  value: string;
}

export type CareModel = "HOSPICE" | "PALLIATIVE" | "CCM";

// ── Telecom / ContactPoint ────────────────────────────────────────────────────

export interface ContactPoint {
  system?: "phone" | "fax" | "email" | "pager" | "url" | "sms" | "other";
  value: string;
  use?: "home" | "work" | "temp" | "old" | "mobile";
}

// ── Emergency contacts (FHIR R4 Patient.contact) ─────────────────────────────

export interface PatientContact {
  /** Relationship code(s) e.g. ['emergency', 'family'] */
  relationship?: string[];
  name?: HumanName;
  telecom?: ContactPoint[];
  address?: PatientAddress;
  gender?: "male" | "female" | "other" | "unknown";
  /** Designate primary emergency contact */
  isPrimary?: boolean;
}

// ── Advance Directives ────────────────────────────────────────────────────────

export interface HealthcareProxy {
  name: string;
  relationship?: string;
  phone?: string;
  alternatePhone?: string;
}

export interface AdvanceDirectives {
  dnrOnFile?: boolean;
  dnrDate?: string;
  /** UUID reference to a patient_documents record */
  dnrDocumentId?: string;
  polstOnFile?: boolean;
  polstDate?: string;
  polstDocumentId?: string;
  livingWillOnFile?: boolean;
  livingWillDate?: string;
  healthcareProxy?: HealthcareProxy;
  organDonation?: boolean;
}

// ── Patient core response ─────────────────────────────────────────────────────

export interface PatientResponse {
  id: string;
  resourceType: "Patient";
  identifier: PatientIdentifier[];
  name: HumanName[];
  gender?: "male" | "female" | "other" | "unknown";
  birthDate: string;
  telecom?: ContactPoint[];
  address?: PatientAddress[];
  contact?: PatientContact[];
  advanceDirectives?: AdvanceDirectives;
  hospiceLocationId: string;
  admissionDate?: string;
  dischargeDate?: string;
  careModel: CareModel;
  createdAt?: string;
  updatedAt?: string;
}

export interface PatientListResponse {
  patients: PatientResponse[];
  total: number;
  page: number;
  limit: number;
}

export interface PatientListQuery {
  page?: number;
  limit?: number;
  careModel?: CareModel;
}

// ── My Dashboard ─────────────────────────────────────────────────────────────

export interface DashboardScheduleItem {
  id: string;
  time: string;
  type: "visit" | "idg";
  visitType: string;
  label: string;
}

export interface DashboardLastSignedNote {
  visitedAt: string;
  visitType: string;
  patientName: string;
}

export interface MyDashboardResponse {
  schedule: DashboardScheduleItem[];
  lastSignedNote: DashboardLastSignedNote | null;
}

// ── Patient list summary (bulk enrichment) ──────────────────────────────────

export interface PatientEnrichment {
  idg: {
    lastCompletedAt: string | null;
    daysRemaining: number | null;
    status: "ok" | "warning" | "overdue" | "none";
  };
  noeStatus: string | null;
  primaryClinician: string | null;
}

export interface PatientListSummaryResponse {
  summary: Record<string, PatientEnrichment>;
}

// ── Conditions (diagnoses) ────────────────────────────────────────────────────

export type ConditionClinicalStatus = "ACTIVE" | "RESOLVED" | "REMISSION";
export type ConditionSeverity = "MILD" | "MODERATE" | "SEVERE";

export interface PatientConditionResponse {
  id: string;
  patientId: string;
  icd10Code: string;
  description: string;
  /** Qualifying terminal diagnosis for hospice eligibility (42 CFR §418.22) */
  isTerminal: boolean;
  /** CMS-required related condition on claim */
  isRelated: boolean;
  clinicalStatus: ConditionClinicalStatus;
  severity?: ConditionSeverity;
  onsetDate?: string;
  confirmedDate?: string;
  isActive: boolean;
  documentedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConditionListResponse {
  conditions: PatientConditionResponse[];
  total: number;
}

export interface CreateConditionBody {
  icd10Code: string;
  description: string;
  isTerminal: boolean;
  isRelated: boolean;
  clinicalStatus: ConditionClinicalStatus;
  severity?: ConditionSeverity;
  onsetDate?: string;
  confirmedDate?: string;
}

export type PatchConditionBody = Partial<CreateConditionBody>;

// ── Insurance (coverage) ──────────────────────────────────────────────────────

export type InsuranceCoverageType =
  | "MEDICARE_PART_A"
  | "MEDICARE_ADVANTAGE"
  | "MEDICAID"
  | "MEDICAID_WAIVER"
  | "PRIVATE"
  | "VA"
  | "OTHER";

export type SubscriberRelationship = "SELF" | "SPOUSE" | "CHILD" | "OTHER";

export interface PatientInsuranceResponse {
  id: string;
  patientId: string;
  coverageType: InsuranceCoverageType;
  isPrimary: boolean;
  payerName: string;
  payerId?: string;
  planName?: string;
  policyNumber?: string;
  groupNumber?: string;
  /** Medicare Beneficiary ID or plan-specific member ID */
  subscriberId: string;
  subscriberFirstName?: string;
  subscriberLastName?: string;
  subscriberDob?: string;
  relationshipToPatient: SubscriberRelationship;
  effectiveDate?: string;
  terminationDate?: string;
  priorAuthNumber?: string;
  isActive: boolean;
  documentedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface InsuranceListResponse {
  insurance: PatientInsuranceResponse[];
  total: number;
}

export interface CreateInsuranceBody {
  coverageType: InsuranceCoverageType;
  isPrimary: boolean;
  payerName: string;
  payerId?: string;
  planName?: string;
  policyNumber?: string;
  groupNumber?: string;
  subscriberId: string;
  subscriberFirstName?: string;
  subscriberLastName?: string;
  subscriberDob?: string;
  relationshipToPatient: SubscriberRelationship;
  effectiveDate?: string;
  terminationDate?: string;
  priorAuthNumber?: string;
}

export type PatchInsuranceBody = Partial<CreateInsuranceBody>;
