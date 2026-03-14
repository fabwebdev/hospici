/**
 * Shared types for the medication management module.
 * Consumed by both backend routes (via @hospici/shared-types) and the frontend.
 * Zero runtime dependencies — types only.
 */

export type MedicationStatus = "ACTIVE" | "DISCONTINUED" | "ON_HOLD";
export type FrequencyType = "SCHEDULED" | "PRN";
export type DEASchedule = "I" | "II" | "III" | "IV" | "V";
export type MedicareCoverageType = "PART_A_RELATED" | "PART_D" | "NOT_COVERED" | "OTC";
export type AdministrationType = "GIVEN" | "OMITTED" | "REFUSED";
export type AllergySeverity = "MILD" | "MODERATE" | "SEVERE" | "LIFE_THREATENING";
export type AllergenType = "DRUG" | "FOOD" | "ENVIRONMENTAL" | "OTHER";

export interface DrugInteractionWarning {
  description: string;
  severity: string;
  interactingDrug: string;
}

export interface MedicationResponse {
  id: string;
  patientId: string;
  locationId: string;
  name: string;
  genericName?: string;
  brandName?: string;
  dosage: string;
  route: string;
  frequency: string;
  frequencyType: FrequencyType;
  prnReason?: string;
  prnMaxDosesPerDay?: number;
  isComfortKit: boolean;
  indication: string;
  startDate: string;
  endDate?: string;
  prescriberId?: string;
  physicianOrderId?: string;
  status: MedicationStatus;
  discontinuedReason?: string;
  discontinuedAt?: string;
  discontinuedBy?: string;
  isControlledSubstance: boolean;
  deaSchedule?: DEASchedule;
  medicareCoverageType: MedicareCoverageType;
  pharmacyName?: string;
  pharmacyPhone?: string;
  pharmacyFax?: string;
  patientInstructions?: string;
  teachingCompleted: boolean;
  teachingCompletedAt?: string;
  teachingCompletedBy?: string;
  reconciledAt?: string;
  reconciledBy?: string;
  reconciliationNotes?: string;
  createdAt: string;
  updatedAt: string;
  interactionWarnings?: DrugInteractionWarning[];
}

export interface MedicationListResponse {
  medications: MedicationResponse[];
  total: number;
}

export interface MedicationAdministration {
  id: string;
  medicationId: string;
  patientId: string;
  locationId: string;
  administeredAt: string;
  administeredBy: string;
  administrationType: AdministrationType;
  doseGiven?: string;
  routeGiven?: string;
  omissionReason?: string;
  effectivenessRating?: number;
  adverseEffectNoted: boolean;
  adverseEffectDescription?: string;
  notes?: string;
  createdAt: string;
}

export interface AdministrationListResponse {
  administrations: MedicationAdministration[];
  total: number;
}

export interface PatientAllergy {
  id: string;
  patientId: string;
  locationId: string;
  allergen: string;
  allergenType: AllergenType;
  reaction: string;
  severity: AllergySeverity;
  onsetDate?: string;
  documentedBy: string;
  documentedAt: string;
  isActive: boolean;
  createdAt: string;
}

export interface AllergyListResponse {
  allergies: PatientAllergy[];
  total: number;
}

// Input types for server functions
export interface CreateMedicationInput {
  name: string;
  genericName?: string;
  brandName?: string;
  dosage: string;
  route: string;
  frequency: string;
  frequencyType: FrequencyType;
  prnReason?: string;
  prnMaxDosesPerDay?: number;
  isComfortKit?: boolean;
  indication: string;
  startDate: string;
  endDate?: string;
  prescriberId?: string;
  physicianOrderId?: string;
  isControlledSubstance?: boolean;
  deaSchedule?: DEASchedule;
  medicareCoverageType: MedicareCoverageType;
  pharmacyName?: string;
  pharmacyPhone?: string;
  pharmacyFax?: string;
  patientInstructions?: string;
}

export interface PatchMedicationInput {
  status?: MedicationStatus;
  discontinuedReason?: string;
  endDate?: string;
  medicareCoverageType?: MedicareCoverageType;
  pharmacyName?: string;
  pharmacyPhone?: string;
  pharmacyFax?: string;
  patientInstructions?: string;
  teachingCompleted?: boolean;
  reconciliationNotes?: string;
  reconciledAt?: string;
  physicianOrderId?: string;
}

export interface RecordAdministrationInput {
  administeredAt: string;
  administrationType: AdministrationType;
  doseGiven?: string;
  routeGiven?: string;
  omissionReason?: string;
  effectivenessRating?: number;
  adverseEffectNoted?: boolean;
  adverseEffectDescription?: string;
  notes?: string;
}

export interface CreateAllergyInput {
  allergen: string;
  allergenType: AllergenType;
  reaction: string;
  severity: AllergySeverity;
  onsetDate?: string;
}

export interface PatchAllergyInput {
  isActive?: boolean;
  reaction?: string;
  severity?: AllergySeverity;
}

export interface DoseSpotSsoResponse {
  ssoUrl: string;
  expiresAt: string;
}
