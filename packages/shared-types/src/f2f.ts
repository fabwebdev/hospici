// f2f.ts — F2F Validity Engine shared types (T3-2b)

export type F2FProviderRole = "physician" | "np" | "pa";
export type F2FEncounterSetting = "office" | "home" | "telehealth" | "snf" | "hospital";
export type F2FStatus = "valid" | "invalid" | "missing";

export interface F2FEncounterResponse {
	id: string;
	patientId: string;
	locationId: string;
	benefitPeriodId: string;
	f2fDate: string;
	f2fProviderId?: string;
	f2fProviderNpi?: string;
	f2fProviderRole: F2FProviderRole;
	encounterSetting: F2FEncounterSetting;
	clinicalFindings: string;
	isValidForRecert: boolean;
	validatedAt?: string;
	invalidationReason?: string;
	physicianTaskId?: string;
	createdAt: string;
	updatedAt: string;
	periodNumber: number;
	periodType: string;
}

export interface F2FEncounterListResponse {
	encounters: F2FEncounterResponse[];
	total: number;
}

export interface F2FValidityResult {
	isValid: boolean;
	reasons: string[];
	validatedAt: string;
}

export interface F2FQueueItem {
	patientId: string;
	patientName: string;
	periodNumber: number;
	periodType: string;
	startDate: string;
	endDate: string;
	recertDate: string;
	daysUntilRecert: number;
	f2fStatus: F2FStatus;
	lastF2FDate?: string;
	assignedPhysicianId?: string;
}

export interface F2FQueueResponse {
	items: F2FQueueItem[];
	total: number;
}

export interface CreateF2FInput {
	benefitPeriodId: string;
	f2fDate: string;
	f2fProviderId?: string;
	f2fProviderNpi?: string;
	f2fProviderRole: F2FProviderRole;
	encounterSetting: F2FEncounterSetting;
	clinicalFindings: string;
}

export interface PatchF2FInput {
	f2fDate?: string;
	f2fProviderId?: string;
	f2fProviderNpi?: string;
	f2fProviderRole?: F2FProviderRole;
	encounterSetting?: F2FEncounterSetting;
	clinicalFindings?: string;
}
