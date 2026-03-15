// shared-types/discharge.ts
// Discharge workflow types shared between backend and frontend.
// Zero runtime dependencies — TypeScript interfaces only.

export type DischargeType = "expected_death" | "revocation" | "transfer" | "live_discharge";

export type DeathLocation = "home" | "inpatient" | "snf" | "hospital";

export interface DischargeInput {
  dischargeType: DischargeType;
  /** ISO date (YYYY-MM-DD). Cannot be a future date. */
  dischargeDate: string;

  // ── expected_death ─────────────────────────────────────────────────────────
  /** HH:MM 24-hour time */
  timeOfDeath?: string;
  pronouncingPhysician?: string;
  locationAtDeath?: DeathLocation;
  witnessName?: string;
  familyNotified?: boolean;
  /** ISO date-time */
  physicianNotificationAt?: string;

  // ── revocation ─────────────────────────────────────────────────────────────
  /** Minimum 20 characters (CMS requirement) */
  revocationReason?: string;
  patientRepresentative?: string;
  /** UUID of the active NOE to close */
  noeId?: string;

  // ── transfer ───────────────────────────────────────────────────────────────
  receivingAgencyNpi?: string;
  receivingHospiceName?: string;
  /** ISO date */
  transferDate?: string;

  // ── live_discharge ─────────────────────────────────────────────────────────
  physicianDocumentation?: string;
  liveDischargeReason?: string;
}

export interface DischargeResponse {
  patientId: string;
  dischargeType: DischargeType;
  /** ISO date */
  dischargeDate: string;
  /** expected_death only: dischargeDate + 7 calendar days */
  hopeDWindowDeadline?: string;
  /** revocation/transfer only: created NOTR id */
  notrId?: string;
  /** revocation/transfer only: 5-business-day NOTR filing deadline */
  notrDeadline?: string;
}
