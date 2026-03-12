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

export interface PatientResponse {
  id: string;
  resourceType: "Patient";
  identifier: PatientIdentifier[];
  name: HumanName[];
  gender?: "male" | "female" | "other" | "unknown";
  birthDate: string;
  address?: PatientAddress[];
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
