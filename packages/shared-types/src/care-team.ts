// packages/shared-types/src/care-team.ts
// Interdisciplinary care team types — 42 CFR §418.56

export type CareTeamDiscipline =
  | "PHYSICIAN"
  | "RN"
  | "SW"
  | "CHAPLAIN"
  | "AIDE"
  | "VOLUNTEER"
  | "BEREAVEMENT"
  | "THERAPIST";

export interface CareTeamMemberResponse {
  id: string;
  patientId: string;
  locationId: string;
  userId?: string;
  name: string;
  discipline: CareTeamDiscipline;
  role: string;
  phone?: string;
  email?: string;
  isPrimaryContact: boolean;
  isOnCall: boolean;
  assignedByUserId?: string;
  assignedAt: string;
  unassignedAt?: string;
  createdAt: string;
}

export interface CareTeamListResponse {
  members: CareTeamMemberResponse[];
  total: number;
}

export interface AssignCareTeamMemberInput {
  name: string;
  discipline: CareTeamDiscipline;
  role: string;
  phone?: string;
  email?: string;
  isPrimaryContact?: boolean;
  isOnCall?: boolean;
  userId?: string;
}
