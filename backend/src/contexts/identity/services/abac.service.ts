// contexts/identity/services/abac.service.ts
// Attribute-Based Access Control (ABAC) Service
// Implements comprehensive ABAC policies for hospice EHR

import { RoleGroups, type UserRole } from "../schemas/user.schema.js";

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export type ABACAction = "read" | "write" | "delete" | "sign" | "export" | "admin";

export type ABACResource =
  | "patient"
  | "clinical_note"
  | "medication"
  | "order"
  | "claim"
  | "billing_record"
  | "audit_log"
  | "user"
  | "location"
  | "schedule"
  | "idg_meeting"
  | "benefit_period"
  | "noe"
  | "aide_supervision"
  | "report"
  | "export_data"
  | "break_glass";

export type ABACOperator = "eq" | "in" | "contains" | "gte" | "lte" | "startsWith";

export interface ABACCondition {
  attribute: string;
  operator: ABACOperator;
  value: unknown;
}

export interface ABACPolicy {
  resource: ABACResource;
  action: ABACAction | ABACAction[];
  conditions?: ABACCondition[];
  effect: "allow" | "deny";
  /** Higher priority policies override lower ones */
  priority?: number;
  /** Human-readable description */
  description?: string;
}

export interface ABACContext {
  userId: string;
  role: UserRole;
  locationId: string;
  locationIds: string[];
  breakGlass: boolean;
  /** Resource-specific attributes */
  resourceAttributes?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════
// ROLE DEFINITIONS WITH PERMISSIONS
// ═══════════════════════════════════════════════════════════

export interface RoleDefinition {
  role: UserRole;
  description: string;
  clinical: "none" | "read" | "write" | "full" | "limited";
  billing: "none" | "read" | "write" | "full";
  admin: "none" | "read" | "write" | "full" | "location";
  audit: "none" | "own" | "location" | "full";
  policies: ABACPolicy[];
}

export const RoleDefinitions: Record<UserRole, RoleDefinition> = {
  // ═══════════════════════════════════════════════════════════
  // CLINICAL DISCIPLINES
  // ═══════════════════════════════════════════════════════════
  registered_nurse: {
    role: "registered_nurse",
    description: "Registered Nurse - Case managers with full clinical scope",
    clinical: "full",
    billing: "none",
    admin: "none",
    audit: "own",
    policies: [
      {
        resource: "patient",
        action: ["read", "write"],
        effect: "allow",
        description: "RN full patient access in assigned locations",
      },
      {
        resource: "clinical_note",
        action: ["read", "write"],
        effect: "allow",
        description: "RN can document nursing assessments",
      },
      {
        resource: "medication",
        action: ["read", "write"],
        effect: "allow",
        description: "RN can document medication administration",
      },
      {
        resource: "order",
        action: "read",
        effect: "allow",
        description: "RN can view physician orders",
      },
      {
        resource: "idg_meeting",
        action: ["read", "write"],
        effect: "allow",
        description: "RN participates in IDG meetings",
      },
      {
        resource: "benefit_period",
        action: "read",
        effect: "allow",
        description: "RN can view benefit period info",
      },
    ],
  },
  lpn: {
    role: "lpn",
    description: "Licensed Practical Nurse - Limited clinical scope",
    clinical: "limited",
    billing: "none",
    admin: "none",
    audit: "own",
    policies: [
      {
        resource: "patient",
        action: "read",
        effect: "allow",
        description: "LPN can view patient info",
      },
      {
        resource: "clinical_note",
        action: "write",
        conditions: [{ attribute: "noteType", operator: "in", value: ["visit", "med_admin"] }],
        effect: "allow",
        description: "LPN can document visits and med admin only",
      },
      {
        resource: "medication",
        action: "write",
        conditions: [{ attribute: "action", operator: "eq", value: "administer" }],
        effect: "allow",
        description: "LPN can document medication administration",
      },
    ],
  },
  social_worker: {
    role: "social_worker",
    description: "Licensed Clinical Social Worker",
    clinical: "write",
    billing: "none",
    admin: "none",
    audit: "own",
    policies: [
      {
        resource: "patient",
        action: ["read", "write"],
        effect: "allow",
        description: "SW full patient access",
      },
      {
        resource: "clinical_note",
        action: ["read", "write"],
        conditions: [
          { attribute: "noteType", operator: "in", value: ["psychosocial", "assessment"] },
        ],
        effect: "allow",
        description: "SW can document psychosocial assessments",
      },
      {
        resource: "idg_meeting",
        action: ["read", "write"],
        effect: "allow",
        description: "SW participates in IDG meetings",
      },
    ],
  },
  chaplain: {
    role: "chaplain",
    description: "Spiritual Care Coordinator",
    clinical: "write",
    billing: "none",
    admin: "none",
    audit: "own",
    policies: [
      {
        resource: "patient",
        action: ["read", "write"],
        effect: "allow",
        description: "Chaplain patient access",
      },
      {
        resource: "clinical_note",
        action: ["read", "write"],
        conditions: [{ attribute: "noteType", operator: "eq", value: "spiritual_assessment" }],
        effect: "allow",
        description: "Chaplain documents spiritual care",
      },
      {
        resource: "idg_meeting",
        action: ["read", "write"],
        effect: "allow",
        description: "Chaplain participates in IDG meetings",
      },
    ],
  },
  physical_therapist: {
    role: "physical_therapist",
    description: "Physical Therapist",
    clinical: "write",
    billing: "none",
    admin: "none",
    audit: "own",
    policies: [
      {
        resource: "patient",
        action: ["read", "write"],
        effect: "allow",
        description: "PT patient access",
      },
      {
        resource: "clinical_note",
        action: ["read", "write"],
        conditions: [{ attribute: "noteType", operator: "in", value: ["pt_eval", "pt_treatment"] }],
        effect: "allow",
        description: "PT documents evaluations and treatments",
      },
    ],
  },
  occupational_therapist: {
    role: "occupational_therapist",
    description: "Occupational Therapist",
    clinical: "write",
    billing: "none",
    admin: "none",
    audit: "own",
    policies: [
      {
        resource: "patient",
        action: ["read", "write"],
        effect: "allow",
        description: "OT patient access",
      },
      {
        resource: "clinical_note",
        action: ["read", "write"],
        conditions: [{ attribute: "noteType", operator: "in", value: ["ot_eval", "ot_treatment"] }],
        effect: "allow",
        description: "OT documents evaluations and treatments",
      },
    ],
  },
  speech_therapist: {
    role: "speech_therapist",
    description: "Speech Language Pathologist",
    clinical: "write",
    billing: "none",
    admin: "none",
    audit: "own",
    policies: [
      {
        resource: "patient",
        action: ["read", "write"],
        effect: "allow",
        description: "SLP patient access",
      },
      {
        resource: "clinical_note",
        action: ["read", "write"],
        conditions: [
          { attribute: "noteType", operator: "in", value: ["slp_eval", "slp_treatment"] },
        ],
        effect: "allow",
        description: "SLP documents evaluations and treatments",
      },
    ],
  },
  dietitian: {
    role: "dietitian",
    description: "Registered Dietitian",
    clinical: "write",
    billing: "none",
    admin: "none",
    audit: "own",
    policies: [
      {
        resource: "patient",
        action: ["read", "write"],
        effect: "allow",
        description: "RD patient access",
      },
      {
        resource: "clinical_note",
        action: ["read", "write"],
        conditions: [{ attribute: "noteType", operator: "eq", value: "nutrition_assessment" }],
        effect: "allow",
        description: "RD documents nutritional assessments",
      },
    ],
  },
  aide_cna: {
    role: "aide_cna",
    description: "Certified Nursing Assistant",
    clinical: "limited",
    billing: "none",
    admin: "none",
    audit: "own",
    policies: [
      {
        resource: "patient",
        action: "read",
        conditions: [{ attribute: "fields", operator: "in", value: ["name", "care_plan", "adls"] }],
        effect: "allow",
        description: "CNA limited patient read",
      },
      {
        resource: "clinical_note",
        action: "write",
        conditions: [{ attribute: "noteType", operator: "eq", value: "adl_documentation" }],
        effect: "allow",
        description: "CNA documents ADLs only",
      },
    ],
  },
  aide_hha: {
    role: "aide_hha",
    description: "Home Health Aide",
    clinical: "limited",
    billing: "none",
    admin: "none",
    audit: "own",
    policies: [
      {
        resource: "patient",
        action: "read",
        conditions: [{ attribute: "fields", operator: "in", value: ["name", "care_plan", "adls"] }],
        effect: "allow",
        description: "HHA limited patient read",
      },
      {
        resource: "clinical_note",
        action: "write",
        conditions: [{ attribute: "noteType", operator: "eq", value: "adl_documentation" }],
        effect: "allow",
        description: "HHA documents ADLs only",
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // PHYSICIAN HIERARCHY
  // ═══════════════════════════════════════════════════════════
  physician_attending: {
    role: "physician_attending",
    description: "Attending Physician",
    clinical: "full",
    billing: "none",
    admin: "none",
    audit: "own",
    policies: [
      {
        resource: "patient",
        action: ["read", "write"],
        effect: "allow",
        description: "Attending full patient access",
      },
      {
        resource: "clinical_note",
        action: ["read", "write", "sign"],
        effect: "allow",
        description: "Attending can document and sign",
      },
      {
        resource: "order",
        action: ["read", "write", "sign"],
        effect: "allow",
        description: "Attending can write orders",
      },
      {
        resource: "medication",
        action: ["read", "write"],
        effect: "allow",
        description: "Attending can prescribe",
      },
      {
        resource: "idg_meeting",
        action: ["read", "write"],
        effect: "allow",
        description: "Attending participates in IDG",
      },
    ],
  },
  physician_np: {
    role: "physician_np",
    description: "Nurse Practitioner",
    clinical: "full",
    billing: "none",
    admin: "none",
    audit: "own",
    policies: [
      {
        resource: "patient",
        action: ["read", "write"],
        effect: "allow",
        description: "NP full patient access",
      },
      {
        resource: "clinical_note",
        action: ["read", "write", "sign"],
        effect: "allow",
        description: "NP can document and sign within scope",
      },
      {
        resource: "order",
        action: ["read", "write"],
        conditions: [{ attribute: "requiresCollaboration", operator: "eq", value: false }],
        effect: "allow",
        description: "NP can write orders per state scope",
      },
    ],
  },
  medical_director: {
    role: "medical_director",
    description: "Hospice Medical Director",
    clinical: "full",
    billing: "read",
    admin: "location",
    audit: "location",
    policies: [
      {
        resource: "patient",
        action: ["read", "write", "admin"],
        effect: "allow",
        description: "Medical Director full patient oversight",
      },
      {
        resource: "clinical_note",
        action: ["read", "write", "sign", "admin"],
        effect: "allow",
        description: "Medical Director can review and co-sign",
      },
      {
        resource: "order",
        action: ["read", "write", "sign", "admin"],
        effect: "allow",
        description: "Medical Director order oversight",
      },
      {
        resource: "claim",
        action: "read",
        effect: "allow",
        description: "Medical Director can review claims",
      },
      {
        resource: "audit_log",
        action: "read",
        effect: "allow",
        description: "Medical Director can review audits",
      },
    ],
  },
  physician_consultant: {
    role: "physician_consultant",
    description: "Consulting Physician",
    clinical: "read",
    billing: "none",
    admin: "none",
    audit: "own",
    policies: [
      {
        resource: "patient",
        action: "read",
        conditions: [{ attribute: "isReferral", operator: "eq", value: true }],
        effect: "allow",
        description: "Consultant read-only for referrals",
      },
      {
        resource: "clinical_note",
        action: "write",
        conditions: [{ attribute: "noteType", operator: "eq", value: "consultation" }],
        effect: "allow",
        description: "Consultant can add consultation notes",
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // OPERATIONAL STAFF
  // ═══════════════════════════════════════════════════════════
  intake_coordinator: {
    role: "intake_coordinator",
    description: "Intake Coordinator",
    clinical: "read",
    billing: "read",
    admin: "none",
    audit: "own",
    policies: [
      {
        resource: "patient",
        action: ["read", "write"],
        conditions: [
          { attribute: "status", operator: "in", value: ["referral", "pending", "admitted"] },
        ],
        effect: "allow",
        description: "Intake can create and manage referrals",
      },
      {
        resource: "benefit_period",
        action: "read",
        effect: "allow",
        description: "Intake checks benefit periods",
      },
    ],
  },
  scheduler: {
    role: "scheduler",
    description: "Visit Scheduler",
    clinical: "none",
    billing: "none",
    admin: "none",
    audit: "own",
    policies: [
      {
        resource: "patient",
        action: "read",
        conditions: [
          { attribute: "fields", operator: "in", value: ["name", "mrn", "schedule_needs"] },
        ],
        effect: "allow",
        description: "Scheduler limited patient info only",
      },
      {
        resource: "schedule",
        action: ["read", "write"],
        effect: "allow",
        description: "Scheduler full schedule access",
      },
    ],
  },
  volunteer: {
    role: "volunteer",
    description: "Hospice Volunteer",
    clinical: "none",
    billing: "none",
    admin: "none",
    audit: "own",
    policies: [
      {
        resource: "patient",
        action: "read",
        conditions: [{ attribute: "fields", operator: "in", value: ["first_name"] }],
        effect: "allow",
        description: "Volunteer only sees first name",
      },
      {
        resource: "clinical_note",
        action: "write",
        conditions: [{ attribute: "noteType", operator: "eq", value: "volunteer_visit" }],
        effect: "allow",
        description: "Volunteer can log visit activity only",
      },
    ],
  },
  volunteer_coordinator: {
    role: "volunteer_coordinator",
    description: "Volunteer Coordinator",
    clinical: "read",
    billing: "none",
    admin: "none",
    audit: "own",
    policies: [
      {
        resource: "patient",
        action: "read",
        conditions: [{ attribute: "fields", operator: "in", value: ["name", "volunteer_needs"] }],
        effect: "allow",
        description: "Coordinator can assign volunteers",
      },
      {
        resource: "user",
        action: ["read", "write"],
        conditions: [{ attribute: "role", operator: "eq", value: "volunteer" }],
        effect: "allow",
        description: "Coordinator manages volunteer records",
      },
    ],
  },
  bereavement_coordinator: {
    role: "bereavement_coordinator",
    description: "Bereavement Coordinator",
    clinical: "read",
    billing: "none",
    admin: "none",
    audit: "own",
    policies: [
      {
        resource: "patient",
        action: "read",
        conditions: [{ attribute: "status", operator: "eq", value: "deceased" }],
        effect: "allow",
        description: "Bereavement access to deceased patients",
      },
      {
        resource: "clinical_note",
        action: "write",
        conditions: [{ attribute: "noteType", operator: "eq", value: "bereavement_contact" }],
        effect: "allow",
        description: "Bereavement contact documentation",
      },
    ],
  },
  emergency_oncall: {
    role: "emergency_oncall",
    description: "Emergency On-Call Clinician",
    clinical: "full",
    billing: "none",
    admin: "none",
    audit: "own",
    policies: [
      {
        resource: "patient",
        action: ["read", "write"],
        effect: "allow",
        priority: 100,
        description: "On-call full access during shift",
      },
      {
        resource: "break_glass",
        action: "admin",
        effect: "allow",
        description: "On-call can initiate break-glass",
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // ADMINISTRATIVE & BILLING
  // ═══════════════════════════════════════════════════════════
  billing_specialist: {
    role: "billing_specialist",
    description: "Billing Specialist",
    clinical: "read",
    billing: "full",
    admin: "none",
    audit: "own",
    policies: [
      {
        resource: "patient",
        action: "read",
        effect: "allow",
        description: "Billing can view patient demographics",
      },
      {
        resource: "clinical_note",
        action: "read",
        conditions: [{ attribute: "noteType", operator: "in", value: ["visit", "assessment"] }],
        effect: "deny",
        description: "Billing CANNOT view detailed clinical notes",
      },
      {
        resource: "claim",
        action: ["read", "write"],
        effect: "allow",
        description: "Billing full claim access",
      },
      {
        resource: "billing_record",
        action: ["read", "write"],
        effect: "allow",
        description: "Billing full billing record access",
      },
      {
        resource: "noe",
        action: ["read", "write"],
        effect: "allow",
        description: "Billing manages NOEs",
      },
    ],
  },
  revenue_manager: {
    role: "revenue_manager",
    description: "Revenue Cycle Manager",
    clinical: "read",
    billing: "full",
    admin: "read",
    audit: "location",
    policies: [
      {
        resource: "patient",
        action: "read",
        effect: "allow",
        description: "RCM can view all patient data",
      },
      {
        resource: "claim",
        action: ["read", "write", "admin"],
        effect: "allow",
        description: "RCM full claim management",
      },
      {
        resource: "report",
        action: ["read", "export"],
        effect: "allow",
        description: "RCM can run financial reports",
      },
    ],
  },
  clinical_supervisor_rn: {
    role: "clinical_supervisor_rn",
    description: "Clinical Supervisor (RN)",
    clinical: "full",
    billing: "read",
    admin: "location",
    audit: "location",
    policies: [
      {
        resource: "patient",
        action: ["read", "write", "admin"],
        effect: "allow",
        description: "Supervisor full patient oversight",
      },
      {
        resource: "clinical_note",
        action: ["read", "write", "sign"],
        effect: "allow",
        description: "Supervisor can review and co-sign notes",
      },
      {
        resource: "aide_supervision",
        action: ["read", "write"],
        effect: "allow",
        description: "Supervisor manages aide supervisions",
      },
    ],
  },
  clinical_director: {
    role: "clinical_director",
    description: "Director of Nursing",
    clinical: "full",
    billing: "read",
    admin: "location",
    audit: "location",
    policies: [
      {
        resource: "patient",
        action: ["read", "write", "admin"],
        effect: "allow",
        description: "DON full patient access",
      },
      {
        resource: "clinical_note",
        action: ["read", "write", "sign", "admin"],
        effect: "allow",
        description: "DON full clinical documentation access",
      },
      {
        resource: "user",
        action: ["read", "write"],
        conditions: [{ attribute: "role", operator: "in", value: RoleGroups.ALL_CLINICAL }],
        effect: "allow",
        description: "DON manages clinical staff",
      },
    ],
  },
  quality_assurance: {
    role: "quality_assurance",
    description: "Quality Assurance Staff",
    clinical: "read",
    billing: "read",
    admin: "none",
    audit: "location",
    policies: [
      {
        resource: "patient",
        action: "read",
        effect: "allow",
        description: "QA full patient read access",
      },
      {
        resource: "clinical_note",
        action: "read",
        effect: "allow",
        description: "QA can review all clinical notes",
      },
      {
        resource: "audit_log",
        action: "read",
        effect: "allow",
        description: "QA can review audit logs",
      },
      {
        resource: "report",
        action: ["read", "export"],
        effect: "allow",
        description: "QA can run quality reports",
      },
    ],
  },
  compliance_officer: {
    role: "compliance_officer",
    description: "Compliance Officer",
    clinical: "read",
    billing: "read",
    admin: "read",
    audit: "full",
    policies: [
      {
        resource: "patient",
        action: "read",
        effect: "allow",
        description: "Compliance full patient read",
      },
      {
        resource: "audit_log",
        action: ["read", "export"],
        effect: "allow",
        description: "Compliance full audit access",
      },
      {
        resource: "user",
        action: "read",
        effect: "allow",
        description: "Compliance can review user access",
      },
    ],
  },
  operations_manager: {
    role: "operations_manager",
    description: "Operations Manager",
    clinical: "read",
    billing: "read",
    admin: "location",
    audit: "location",
    policies: [
      {
        resource: "patient",
        action: "read",
        effect: "allow",
        description: "Ops manager patient read",
      },
      {
        resource: "report",
        action: ["read", "export"],
        effect: "allow",
        description: "Ops manager can run operational reports",
      },
      {
        resource: "location",
        action: "read",
        effect: "allow",
        description: "Ops manager location access",
      },
    ],
  },
  hr_admin: {
    role: "hr_admin",
    description: "HR Administrator",
    clinical: "none",
    billing: "none",
    admin: "none",
    audit: "own",
    policies: [
      {
        resource: "user",
        action: ["read", "write"],
        effect: "allow",
        description: "HR manages user records",
      },
      {
        resource: "patient",
        action: ["read", "write", "delete", "sign", "export", "admin"],
        effect: "deny",
        description: "HR cannot access patient data",
      },
    ],
  },
  admin: {
    role: "admin",
    description: "Location Administrator",
    clinical: "full",
    billing: "full",
    admin: "location",
    audit: "full",
    policies: [
      {
        resource: "patient",
        action: ["read", "write", "admin"],
        effect: "allow",
        description: "Admin full patient access",
      },
      {
        resource: "user",
        action: ["read", "write", "admin"],
        effect: "allow",
        description: "Admin manages users at location",
      },
      {
        resource: "location",
        action: ["read", "write"],
        effect: "allow",
        description: "Admin location management",
      },
      {
        resource: "report",
        action: ["read", "export"],
        effect: "allow",
        description: "Admin can run all reports",
      },
    ],
  },
  super_admin: {
    role: "super_admin",
    description: "System Administrator",
    clinical: "full",
    billing: "full",
    admin: "full",
    audit: "full",
    policies: [
      {
        resource: "patient",
        action: ["read", "write", "delete", "admin"],
        effect: "allow",
        description: "Super Admin full system access",
      },
      {
        resource: "user",
        action: ["read", "write", "delete", "admin"],
        effect: "allow",
        description: "Super Admin user management",
      },
      {
        resource: "location",
        action: ["read", "write", "delete", "admin"],
        effect: "allow",
        description: "Super Admin location management",
      },
      {
        resource: "audit_log",
        action: ["read", "export", "admin"],
        effect: "allow",
        description: "Super Admin audit access",
      },
      {
        resource: "export_data",
        action: "admin",
        effect: "allow",
        description: "Super Admin can export all data",
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // EXTERNAL & PORTAL ROLES
  // ═══════════════════════════════════════════════════════════
  pharmacy_consultant: {
    role: "pharmacy_consultant",
    description: "Pharmacy Consultant",
    clinical: "read",
    billing: "none",
    admin: "none",
    audit: "own",
    policies: [
      {
        resource: "patient",
        action: "read",
        conditions: [
          { attribute: "fields", operator: "in", value: ["name", "medications", "allergies"] },
        ],
        effect: "allow",
        description: "Pharmacist medication access only",
      },
      {
        resource: "medication",
        action: ["read", "write"],
        conditions: [
          { attribute: "action", operator: "in", value: ["review", "interaction_check"] },
        ],
        effect: "allow",
        description: "Pharmacist can review and annotate meds",
      },
    ],
  },
  dme_coordinator: {
    role: "dme_coordinator",
    description: "DME Coordinator",
    clinical: "read",
    billing: "read",
    admin: "none",
    audit: "own",
    policies: [
      {
        resource: "patient",
        action: "read",
        conditions: [
          { attribute: "fields", operator: "in", value: ["name", "address", "dme_needs"] },
        ],
        effect: "allow",
        description: "DME coordinator limited patient info",
      },
      {
        resource: "order",
        action: ["read", "write"],
        conditions: [{ attribute: "orderType", operator: "eq", value: "dme" }],
        effect: "allow",
        description: "DME coordinator manages equipment orders",
      },
    ],
  },
  surveyor_state: {
    role: "surveyor_state",
    description: "State Surveyor",
    clinical: "read",
    billing: "read",
    admin: "none",
    audit: "location",
    policies: [
      {
        resource: "patient",
        action: "read",
        conditions: [
          {
            attribute: "surveyType",
            operator: "in",
            value: ["complaint", "recertification", "annual"],
          },
        ],
        effect: "allow",
        description: "Surveyor read access during survey",
      },
      {
        resource: "audit_log",
        action: "read",
        effect: "allow",
        description: "Surveyor can review audit trail",
      },
    ],
  },
  surveyor_accreditation: {
    role: "surveyor_accreditation",
    description: "Accreditation Surveyor",
    clinical: "read",
    billing: "read",
    admin: "none",
    audit: "location",
    policies: [
      {
        resource: "patient",
        action: "read",
        conditions: [{ attribute: "surveyType", operator: "eq", value: "accreditation" }],
        effect: "allow",
        description: "Accreditation surveyor read access",
      },
    ],
  },
  family_caregiver: {
    role: "family_caregiver",
    description: "Family Caregiver Portal",
    clinical: "none",
    billing: "none",
    admin: "none",
    audit: "own",
    policies: [
      {
        resource: "patient",
        action: "read",
        conditions: [{ attribute: "relationship", operator: "eq", value: "authorized_rep" }],
        effect: "allow",
        description: "Caregiver can view their patient only",
      },
    ],
  },
  patient_portal: {
    role: "patient_portal",
    description: "Patient Portal User",
    clinical: "none",
    billing: "read",
    admin: "none",
    audit: "own",
    policies: [
      {
        resource: "patient",
        action: "read",
        conditions: [{ attribute: "self", operator: "eq", value: true }],
        effect: "allow",
        description: "Patient can view own records only",
      },
    ],
  },
};

// ═══════════════════════════════════════════════════════════
// ABAC SERVICE
// ═══════════════════════════════════════════════════════════

function evaluateCondition(condition: ABACCondition, context: Partial<ABACContext>): boolean {
  const value = context.resourceAttributes?.[condition.attribute];

  switch (condition.operator) {
    case "eq":
      return value === condition.value;
    case "in":
      return Array.isArray(condition.value) && condition.value.includes(value as string);
    case "contains":
      return (
        Array.isArray(value) &&
        Array.isArray(condition.value) &&
        condition.value.every((v) => (value as unknown[]).includes(v))
      );
    case "gte":
      return typeof value === "number" && value >= (condition.value as number);
    case "lte":
      return typeof value === "number" && value <= (condition.value as number);
    case "startsWith":
      return (
        typeof value === "string" &&
        typeof condition.value === "string" &&
        value.startsWith(condition.value)
      );
    default:
      return false;
  }
}

export function isInGroup(role: UserRole, group: keyof typeof RoleGroups): boolean {
  return (RoleGroups[group] as readonly string[]).includes(role);
}

export function getRoleDefinition(role: UserRole): RoleDefinition {
  return RoleDefinitions[role];
}

export function can(
  role: UserRole,
  action: ABACAction,
  resource: ABACResource,
  context?: Partial<ABACContext>,
): boolean {
  const definition = RoleDefinitions[role];

  // Sort policies by priority (higher first)
  const policies = [...definition.policies].sort((a, b) => (b.priority || 0) - (a.priority || 0));

  for (const policy of policies) {
    if (policy.resource !== resource) continue;

    const actions = Array.isArray(policy.action) ? policy.action : [policy.action];
    if (!actions.includes(action)) continue;

    if (policy.conditions && context) {
      const conditionsMet = policy.conditions.every((condition) =>
        evaluateCondition(condition, context),
      );
      if (!conditionsMet) continue;
    }

    return policy.effect === "allow";
  }

  // Default deny
  return false;
}

export function getAllowedActions(role: UserRole, resource: ABACResource): ABACAction[] {
  const actions: ABACAction[] = ["read", "write", "delete", "sign", "export", "admin"];
  return actions.filter((action) => can(role, action, resource));
}

export function requireRoles(...allowedRoles: UserRole[]) {
  return (role: UserRole): boolean => allowedRoles.includes(role);
}

export function requireGroup(group: keyof typeof RoleGroups) {
  return (role: UserRole): boolean => isInGroup(role, group);
}

// Namespace object for callers that use ABACService.can(...) etc.
export const ABACService = {
  isInGroup,
  getRoleDefinition,
  can,
  getAllowedActions,
  requireRoles,
  requireGroup,
} as const;
