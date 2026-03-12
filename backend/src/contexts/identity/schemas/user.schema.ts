// contexts/identity/schemas/user.schema.ts
// User identity and ABAC (Attribute-Based Access Control) schemas
// Updated with comprehensive role definitions for hospice EHR

import { type Static, Type } from "@sinclair/typebox";

/**
 * Comprehensive User Role Enumeration
 * Covers all clinical, operational, administrative, and external roles
 * for a complete hospice EHR security model
 */
export const UserRoleSchema = Type.Enum({
  // ═══════════════════════════════════════════════════════════
  // CLINICAL DISCIPLINES (Direct Patient Care)
  // ═══════════════════════════════════════════════════════════
  /** Registered Nurse - Case managers with full clinical scope */
  registered_nurse: "registered_nurse",
  /** Licensed Practical Nurse - Limited clinical scope, med admin */
  lpn: "lpn",
  /** Licensed Clinical Social Worker - Psychosocial care */
  social_worker: "social_worker",
  /** Chaplain/Spiritual Care Coordinator - Spiritual assessments */
  chaplain: "chaplain",
  /** Physical Therapist - PT evaluations and treatment */
  physical_therapist: "physical_therapist",
  /** Occupational Therapist - OT evaluations and ADL training */
  occupational_therapist: "occupational_therapist",
  /** Speech Language Pathologist - Speech/swallowing therapy */
  speech_therapist: "speech_therapist",
  /** Registered Dietitian - Nutritional assessments */
  dietitian: "dietitian",
  /** Certified Nursing Assistant - ADL support */
  aide_cna: "aide_cna",
  /** Home Health Aide - Personal care services */
  aide_hha: "aide_hha",

  // ═══════════════════════════════════════════════════════════
  // PHYSICIAN HIERARCHY
  // ═══════════════════════════════════════════════════════════
  /** Attending Physician - Primary physician of record */
  physician_attending: "physician_attending",
  /** Nurse Practitioner - Advanced practice, collaborative */
  physician_np: "physician_np",
  /** Hospice Medical Director - Oversight, reprisals, policy */
  medical_director: "medical_director",
  /** Consulting Physician - Specialist consultations */
  physician_consultant: "physician_consultant",

  // ═══════════════════════════════════════════════════════════
  // OPERATIONAL STAFF
  // ═══════════════════════════════════════════════════════════
  /** Intake Coordinator - Admissions, eligibility, referrals */
  intake_coordinator: "intake_coordinator",
  /** Scheduler - Visit scheduling, no clinical access */
  scheduler: "scheduler",
  /** Hospice Volunteer - Activity logging only */
  volunteer: "volunteer",
  /** Volunteer Coordinator - Manages volunteer assignments */
  volunteer_coordinator: "volunteer_coordinator",
  /** Bereavement Coordinator - Grief support, follow-ups */
  bereavement_coordinator: "bereavement_coordinator",
  /** Emergency On-Call Clinician - After-hours access */
  emergency_oncall: "emergency_oncall",

  // ═══════════════════════════════════════════════════════════
  // ADMINISTRATIVE & BILLING
  // ═══════════════════════════════════════════════════════════
  /** Billing Specialist - Claims processing, read-only clinical */
  billing_specialist: "billing_specialist",
  /** Revenue Cycle Manager - Full billing + reports */
  revenue_manager: "revenue_manager",
  /** Clinical Supervisor (RN) - Override clinical, team oversight */
  clinical_supervisor_rn: "clinical_supervisor_rn",
  /** Director of Nursing - All clinical, QA review */
  clinical_director: "clinical_director",
  /** Quality Assurance Staff - QAPI, incident review */
  quality_assurance: "quality_assurance",
  /** Compliance Officer - HIPAA audits, policy enforcement */
  compliance_officer: "compliance_officer",
  /** Operations Manager - Multi-module read, admin reports */
  operations_manager: "operations_manager",
  /** HR Administrator - Staff records only, no patient access */
  hr_admin: "hr_admin",
  /** Location Administrator - Full location scope */
  admin: "admin",
  /** System Administrator - Full system access */
  super_admin: "super_admin",

  // ═══════════════════════════════════════════════════════════
  // EXTERNAL & PORTAL ROLES
  // ═══════════════════════════════════════════════════════════
  /** Pharmacy Consultant - Medication review, interactions */
  pharmacy_consultant: "pharmacy_consultant",
  /** DME Coordinator - Equipment orders, delivery tracking */
  dme_coordinator: "dme_coordinator",
  /** State Surveyor/Auditor - Limited time, read-only */
  surveyor_state: "surveyor_state",
  /** Accreditation Surveyor (TJC/ACHC) - Read-only, specific */
  surveyor_accreditation: "surveyor_accreditation",
  /** Family Caregiver - Portal access to their patient */
  family_caregiver: "family_caregiver",
  /** Patient Portal - Own records, messaging */
  patient_portal: "patient_portal",
});

/**
 * Role Groups for ABAC Policy Management
 * Groups related roles to simplify permission assignments
 */
export const RoleGroups = {
  /** All clinical staff with direct patient care */
  CLINICAL_DIRECT: [
    "registered_nurse",
    "lpn",
    "social_worker",
    "chaplain",
    "physical_therapist",
    "occupational_therapist",
    "speech_therapist",
    "dietitian",
  ] as const,

  /** Aide-level staff with limited documentation */
  CLINICAL_AIDE: ["aide_cna", "aide_hha"] as const,

  /** All patient care staff (direct + aides) */
  ALL_CLINICAL: [
    "registered_nurse",
    "lpn",
    "social_worker",
    "chaplain",
    "physical_therapist",
    "occupational_therapist",
    "speech_therapist",
    "dietitian",
    "aide_cna",
    "aide_hha",
  ] as const,

  /** Physician-level providers */
  PHYSICIAN: ["physician_attending", "physician_np", "medical_director"] as const,

  /** All providers including consultants */
  ALL_PROVIDERS: [
    "physician_attending",
    "physician_np",
    "medical_director",
    "physician_consultant",
    "registered_nurse",
    "lpn",
    "social_worker",
    "chaplain",
    "physical_therapist",
    "occupational_therapist",
    "speech_therapist",
    "dietitian",
  ] as const,

  /** Billing and revenue staff */
  BILLING: ["billing_specialist", "revenue_manager"] as const,

  /** Supervisory roles with oversight */
  SUPERVISORY: ["clinical_supervisor_rn", "clinical_director", "medical_director"] as const,

  /** Administrative roles with location or system scope */
  ADMINISTRATIVE: ["admin", "super_admin", "operations_manager"] as const,

  /** Quality and compliance roles */
  QUALITY_COMPLIANCE: ["quality_assurance", "compliance_officer"] as const,

  /** External healthcare partners */
  EXTERNAL: ["pharmacy_consultant", "dme_coordinator"] as const,

  /** Surveyor/auditor roles */
  SURVEYOR: ["surveyor_state", "surveyor_accreditation"] as const,

  /** Patient/family portal users */
  PORTAL: ["family_caregiver", "patient_portal"] as const,

  /** Limited access roles */
  LIMITED: ["volunteer", "scheduler", "hr_admin"] as const,

  /** Emergency access roles */
  EMERGENCY: ["emergency_oncall"] as const,

  /** Bereavement program staff */
  BEREAVEMENT: ["bereavement_coordinator"] as const,

  /** Volunteer program staff */
  VOLUNTEER: ["volunteer", "volunteer_coordinator"] as const,

  /** Intake and admission staff */
  INTAKE: ["intake_coordinator"] as const,
} as const;

/**
 * ABAC Attributes Schema
 * Defines the attributes used for Attribute-Based Access Control
 */
export const ABACAttributesSchema = Type.Object({
  /** Authorized location IDs for this user */
  locationIds: Type.Array(Type.String({ format: "uuid" })),
  /** Primary role of the user */
  role: UserRoleSchema,
  /** Additional granular permissions beyond role */
  permissions: Type.Array(Type.String()),
  /** Discipline/specialty for clinical roles */
  discipline: Type.Optional(Type.String()),
  /** Supervised locations (for supervisors) */
  supervisedLocationIds: Type.Optional(Type.Array(Type.String({ format: "uuid" }))),
  /** License number for clinical roles */
  licenseNumber: Type.Optional(Type.String()),
  /** License expiration date */
  licenseExpiresAt: Type.Optional(Type.String({ format: "date-time" })),
});

/**
 * User Schema
 * Core user identity with ABAC attributes
 */
export const UserSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    email: Type.String({ format: "email" }),
    emailVerified: Type.Boolean({ default: false }),
    abacAttributes: ABACAttributesSchema,
    /** Soft delete flag */
    isActive: Type.Boolean({ default: true }),
    /** Last login timestamp */
    lastLoginAt: Type.Optional(Type.String({ format: "date-time" })),
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);

/**
 * Session Schema
 * Active session context for ABAC enforcement
 */
export const SessionSchema = Type.Object({
  userId: Type.String({ format: "uuid" }),
  locationId: Type.String({ format: "uuid" }),
  role: UserRoleSchema,
  abacAttributes: ABACAttributesSchema,
  /** Break-glass emergency access flag */
  breakGlass: Type.Boolean({ default: false }),
  /** Multi-location session support */
  availableLocationIds: Type.Array(Type.String({ format: "uuid" })),
  /** Session expiration */
  expiresAt: Type.Number(),
});

/**
 * Break-Glass Emergency Access Schema
 * For urgent patient access when normal permissions insufficient
 */
export const BreakGlassSchema = Type.Object({
  userId: Type.String({ format: "uuid" }),
  reason: Type.String({ minLength: 20 }),
  patientId: Type.String({ format: "uuid" }),
  requestedAt: Type.String({ format: "date-time" }),
  expiresAt: Type.String({ format: "date-time" }),
  approvedBy: Type.Optional(Type.String({ format: "uuid" })),
  /** Supervisor review status */
  reviewStatus: Type.Optional(
    Type.Enum({
      pending: "pending",
      approved: "approved",
      rejected: "rejected",
      needs_review: "needs_review",
    }),
  ),
});

// ═══════════════════════════════════════════════════════════
// TYPE EXPORTS
// ═══════════════════════════════════════════════════════════

export type User = Static<typeof UserSchema>;
export type Session = Static<typeof SessionSchema>;
export type BreakGlass = Static<typeof BreakGlassSchema>;
export type UserRole = Static<typeof UserRoleSchema>;
export type RoleGroup = keyof typeof RoleGroups;
