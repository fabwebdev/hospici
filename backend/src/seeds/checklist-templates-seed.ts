/**
 * checklist-templates-seed.ts — T3-13 seed data for discipline × visit-type templates.
 * Run directly: tsx src/seeds/checklist-templates-seed.ts
 * System-level templates have location_id = NULL.
 */

import { db } from "@/db/client.js";
import { reviewChecklistTemplates } from "@/db/schema/index.js";
import { and, eq, isNull } from "drizzle-orm";

interface ChecklistItem {
  id: string;
  label: string;
  required: boolean;
  regulatoryRef?: string;
  scoringWeight?: number;
}

const TEMPLATES: {
  discipline: string;
  visitType: string;
  items: ChecklistItem[];
}[] = [
  {
    discipline: "RN",
    visitType: "routine_rn",
    items: [
      { id: "rn-routine-1", label: "Vital signs documented", required: true, regulatoryRef: "42 CFR §418.76", scoringWeight: 0.15 },
      { id: "rn-routine-2", label: "Pain assessment completed (scale used and documented)", required: true, regulatoryRef: "42 CFR §418.104", scoringWeight: 0.15 },
      { id: "rn-routine-3", label: "Symptom management interventions documented", required: true, scoringWeight: 0.15 },
      { id: "rn-routine-4", label: "Medication review and reconciliation completed", required: true, scoringWeight: 0.1 },
      { id: "rn-routine-5", label: "Care plan goals addressed and progress noted", required: true, regulatoryRef: "42 CFR §418.56", scoringWeight: 0.15 },
      { id: "rn-routine-6", label: "Patient/family teaching provided", required: false, scoringWeight: 0.1 },
      { id: "rn-routine-7", label: "Clinician signature present", required: true, scoringWeight: 0.1 },
      { id: "rn-routine-8", label: "Note completed within 24 hours of visit", required: false, scoringWeight: 0.1 },
    ],
  },
  {
    discipline: "RN",
    visitType: "admission",
    items: [
      { id: "rn-adm-1", label: "Comprehensive pain and symptom assessment", required: true, regulatoryRef: "42 CFR §418.54", scoringWeight: 0.12 },
      { id: "rn-adm-2", label: "Medication reconciliation — complete medication list", required: true, scoringWeight: 0.12 },
      { id: "rn-adm-3", label: "Allergy documentation confirmed", required: true, scoringWeight: 0.08 },
      { id: "rn-adm-4", label: "Advance directives reviewed and documented", required: true, regulatoryRef: "42 CFR §418.52(a)(5)", scoringWeight: 0.12 },
      { id: "rn-adm-5", label: "Patient/family rights and responsibilities reviewed", required: true, regulatoryRef: "42 CFR §418.52", scoringWeight: 0.1 },
      { id: "rn-adm-6", label: "Election statement signed", required: true, regulatoryRef: "42 CFR §418.24", scoringWeight: 0.12 },
      { id: "rn-adm-7", label: "Initial plan of care established", required: true, regulatoryRef: "42 CFR §418.56", scoringWeight: 0.12 },
      { id: "rn-adm-8", label: "HOPE admission assessment completed", required: true, regulatoryRef: "42 CFR §418.312", scoringWeight: 0.12 },
      { id: "rn-adm-9", label: "Emergency contact and caregiver documented", required: true, scoringWeight: 0.1 },
    ],
  },
  {
    discipline: "RN",
    visitType: "recertification",
    items: [
      { id: "rn-recert-1", label: "Current prognosis supports continued hospice eligibility", required: true, regulatoryRef: "42 CFR §418.22", scoringWeight: 0.2 },
      { id: "rn-recert-2", label: "F2F encounter documented (Period 3+)", required: true, regulatoryRef: "42 CFR §418.22(a)(4)", scoringWeight: 0.2 },
      { id: "rn-recert-3", label: "Updated plan of care reviewed with IDG", required: true, regulatoryRef: "42 CFR §418.56", scoringWeight: 0.15 },
      { id: "rn-recert-4", label: "Benefit period dates accurate", required: true, scoringWeight: 0.15 },
      { id: "rn-recert-5", label: "Physician certification obtained", required: true, regulatoryRef: "42 CFR §418.22", scoringWeight: 0.15 },
      { id: "rn-recert-6", label: "Patient/family understanding of goals reviewed", required: false, scoringWeight: 0.1 },
      { id: "rn-recert-7", label: "Decline trajectory documented if applicable", required: false, scoringWeight: 0.05 },
    ],
  },
  {
    discipline: "SW",
    visitType: "routine_rn",
    items: [
      { id: "sw-routine-1", label: "Psychosocial assessment completed or updated", required: true, regulatoryRef: "42 CFR §418.56(c)(3)", scoringWeight: 0.2 },
      { id: "sw-routine-2", label: "Caregiver coping and support needs assessed", required: true, scoringWeight: 0.2 },
      { id: "sw-routine-3", label: "Community resources/referrals documented if needed", required: false, scoringWeight: 0.15 },
      { id: "sw-routine-4", label: "Advance care planning discussion documented", required: false, scoringWeight: 0.15 },
      { id: "sw-routine-5", label: "Bereavement risk assessment updated", required: true, scoringWeight: 0.15 },
      { id: "sw-routine-6", label: "Goals and interventions tied to care plan", required: true, regulatoryRef: "42 CFR §418.56", scoringWeight: 0.15 },
    ],
  },
  {
    discipline: "CHAPLAIN",
    visitType: "routine_rn",
    items: [
      { id: "chap-routine-1", label: "Spiritual/existential needs assessed", required: true, regulatoryRef: "42 CFR §418.56(c)(4)", scoringWeight: 0.25 },
      { id: "chap-routine-2", label: "Spiritual care plan goals addressed", required: true, scoringWeight: 0.2 },
      { id: "chap-routine-3", label: "Cultural and religious preferences respected", required: true, scoringWeight: 0.2 },
      { id: "chap-routine-4", label: "Patient/family emotional support provided", required: true, scoringWeight: 0.2 },
      { id: "chap-routine-5", label: "Referral to other chaplaincy or community resources if needed", required: false, scoringWeight: 0.15 },
    ],
  },
];

async function seedChecklistTemplates(): Promise<void> {
  for (const tmpl of TEMPLATES) {
    const [existing] = await db
      .select()
      .from(reviewChecklistTemplates)
      .where(
        and(
          eq(reviewChecklistTemplates.discipline, tmpl.discipline),
          eq(reviewChecklistTemplates.visitType, tmpl.visitType),
          isNull(reviewChecklistTemplates.locationId),
          eq(reviewChecklistTemplates.version, 1),
        ),
      )
      .limit(1);

    if (existing) {
      console.log(`Skipping existing template: ${tmpl.discipline} × ${tmpl.visitType}`);
      continue;
    }

    await db.insert(reviewChecklistTemplates).values({
      discipline: tmpl.discipline,
      visitType: tmpl.visitType,
      items: tmpl.items,
      version: 1,
      isActive: true,
    });

    console.log(`Seeded template: ${tmpl.discipline} × ${tmpl.visitType} (${tmpl.items.length} items)`);
  }
}

seedChecklistTemplates()
  .then(() => {
    console.log("Checklist template seed complete.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Seed error:", err);
    process.exit(1);
  });
