/**
 * CarePlanService — Unified interdisciplinary care plan (T2-5).
 *
 * Business rules enforced here:
 *  1. One care plan per patient — POST is idempotent (returns existing if present).
 *  2. PATCH is role-gated: users may only update the discipline section that
 *     matches their clinical role. Admin/supervisor may patch any discipline.
 *  3. Physician sign-off (POST /care-plan/physician-review) requires role "physician"
 *     or "medical_director". Role "admin" / "supervisor" may also sign.
 *  4. 42 CFR §418.56(b) deadlines tracked via promoted columns:
 *       - Initial review: admissionDate + 2 calendar days
 *       - Ongoing review: lastReviewAt + 14 calendar days
 *  5. Every read/write emits an AuditService entry (PHI contact).
 *  6. version is incremented on every mutating operation.
 *
 * Role → discipline mapping:
 *   rn | admin | supervisor  →  RN
 *   social_worker            →  SW
 *   chaplain                 →  CHAPLAIN
 *   therapist                →  THERAPY
 *   aide                     →  AIDE
 *   volunteer                →  VOLUNTEER
 *   bereavement              →  BEREAVEMENT
 *   physician | medical_director → PHYSICIAN
 */

import { logAudit } from "@/contexts/identity/services/audit.service.js";
import { db } from "@/db/client.js";
import { carePlans } from "@/db/schema/care-plans.table.js";
import { patients } from "@/db/schema/patients.table.js";
import { eq, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import type {
  CarePlanResponse,
  CreateCarePlanBody,
  DisciplineSection,
  DisciplineSections,
  DisciplineType,
  PatchCarePlanBody,
  PhysicianReview,
  PhysicianReviewBody,
  PhysicianReviewEntry,
} from "../schemas/carePlan.schema.js";

/** Add N calendar days to a Date and return YYYY-MM-DD string. */
function addCalendarDays(date: Date, days: number): string {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

type UserCtx = NonNullable<FastifyRequest["user"]>;
type AuditDbCtx = { insert: (typeof db)["insert"] };

async function applyRlsContext(
  tx: { execute: (typeof db)["execute"] },
  user: UserCtx,
): Promise<void> {
  await tx.execute(sql`SELECT set_config('app.current_user_id', ${user.id}, true)`);
  await tx.execute(sql`SELECT set_config('app.current_location_id', ${user.locationId}, true)`);
  await tx.execute(sql`SELECT set_config('app.current_role', ${user.role}, true)`);
}

/** Map clinical role to allowed discipline. */
function disciplineForRole(role: string): DisciplineType {
  switch (role) {
    case "rn":
    case "admin":
    case "supervisor":
      return "RN";
    case "social_worker":
      return "SW";
    case "chaplain":
      return "CHAPLAIN";
    case "therapist":
      return "THERAPY";
    case "aide":
      return "AIDE";
    case "volunteer":
      return "VOLUNTEER";
    case "bereavement":
      return "BEREAVEMENT";
    case "physician":
    case "medical_director":
      return "PHYSICIAN";
    default:
      return "RN";
  }
}

/** True if this role is authorised to complete a physician sign-off. */
function isPhysicianRole(role: string): boolean {
  return ["physician", "medical_director", "admin", "supervisor"].includes(role);
}

/**
 * Build the PhysicianReview summary from promoted columns.
 * `isInitialReviewOverdue` and `isOngoingReviewOverdue` are computed at read
 * time so they always reflect the current clock.
 */
function buildPhysicianReview(row: typeof carePlans.$inferSelect): PhysicianReview {
  const now = new Date();

  const initialDeadline = row.initialReviewDeadline
    ? new Date(row.initialReviewDeadline)
    : null;
  const nextReviewDue = row.nextReviewDue ? new Date(row.nextReviewDue) : null;

  return {
    initialReviewDeadline: row.initialReviewDeadline ?? null,
    initialReviewCompletedAt: row.initialReviewCompletedAt?.toISOString() ?? null,
    initialReviewedBy: row.initialReviewedBy ?? null,
    lastReviewAt: row.lastReviewAt?.toISOString() ?? null,
    nextReviewDue: row.nextReviewDue ?? null,
    reviewHistory: (row.reviewHistory ?? []) as PhysicianReviewEntry[],
    isInitialReviewOverdue:
      initialDeadline !== null &&
      row.initialReviewCompletedAt === null &&
      now > initialDeadline,
    isOngoingReviewOverdue: nextReviewDue !== null && now > nextReviewDue,
  };
}

function toCarePlanResponse(row: typeof carePlans.$inferSelect): CarePlanResponse {
  return {
    id: row.id,
    patientId: row.patientId,
    locationId: row.locationId,
    disciplineSections: (row.disciplineSections ?? {}) as DisciplineSections,
    physicianReview: buildPhysicianReview(row),
    version: row.version,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

// ── POST /patients/:id/care-plan ──────────────────────────────────────────────

export async function createCarePlan(
  patientId: string,
  body: CreateCarePlanBody,
  user: UserCtx,
): Promise<CarePlanResponse> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    // Idempotent: return existing plan if one already exists
    const existing = await tx
      .select()
      .from(carePlans)
      .where(eq(carePlans.patientId, patientId))
      .limit(1);

    if (existing[0]) {
      await logAudit(
        "view",
        user.id,
        patientId,
        {
          userRole: user.role,
          locationId: user.locationId,
          resourceType: "care_plan",
          resourceId: existing[0].id,
          details: { action: "create_idempotent_return" },
        },
        tx as unknown as AuditDbCtx,
      );
      return toCarePlanResponse(existing[0]);
    }

    // Look up patient admissionDate to compute 2-day physician review deadline
    const patientRows = await tx
      .select({ admissionDate: patients.admissionDate })
      .from(patients)
      .where(eq(patients.id, patientId))
      .limit(1);

    const admissionDate = patientRows[0]?.admissionDate
      ? new Date(patientRows[0].admissionDate)
      : null;
    const initialReviewDeadline = admissionDate
      ? addCalendarDays(admissionDate, 2)
      : null;

    // Initialize ALL discipline sections so every slot is present from day one
    const discipline = disciplineForRole(user.role);
    const now = new Date().toISOString();

    const ALL_DISCIPLINES: DisciplineType[] = [
      "RN", "SW", "CHAPLAIN", "THERAPY", "AIDE", "VOLUNTEER", "BEREAVEMENT", "PHYSICIAN",
    ];

    const sections: DisciplineSections = Object.fromEntries(
      ALL_DISCIPLINES.map((d) => [
        d,
        {
          notes: d === discipline ? (body.notes ?? "") : "",
          goals: d === discipline ? (body.goals ?? []) : [],
          lastUpdatedBy: user.id,
          lastUpdatedAt: now,
        } satisfies DisciplineSection,
      ]),
    ) as DisciplineSections;

    const rows = await tx
      .insert(carePlans)
      .values({
        patientId,
        locationId: user.locationId,
        disciplineSections: sections,
        version: 1,
        initialReviewDeadline,
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error("care_plans insert returned no rows");

    await logAudit(
      "create",
      user.id,
      patientId,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "care_plan",
        resourceId: row.id,
        details: {
          discipline,
          goalCount: (sections[discipline]?.goals ?? []).length,
          initialReviewDeadline,
        },
      },
      tx as unknown as AuditDbCtx,
    );

    return toCarePlanResponse(row);
  });
}

// ── GET /patients/:id/care-plan ───────────────────────────────────────────────

export async function getCarePlan(
  patientId: string,
  user: UserCtx,
): Promise<CarePlanResponse | null> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const rows = await tx
      .select()
      .from(carePlans)
      .where(eq(carePlans.patientId, patientId))
      .limit(1);

    const row = rows[0] ?? null;

    if (row) {
      await logAudit(
        "view",
        user.id,
        patientId,
        {
          userRole: user.role,
          locationId: user.locationId,
          resourceType: "care_plan",
          resourceId: row.id,
        },
        tx as unknown as AuditDbCtx,
      );
    }

    return row ? toCarePlanResponse(row) : null;
  });
}

// ── PATCH /patients/:id/care-plan/:discipline ─────────────────────────────────

export async function patchCarePlanDiscipline(
  patientId: string,
  targetDiscipline: DisciplineType,
  body: PatchCarePlanBody,
  user: UserCtx,
): Promise<CarePlanResponse> {
  // Non-admin users may only patch their own discipline
  if (user.role !== "admin" && user.role !== "supervisor") {
    const allowed = disciplineForRole(user.role);
    if (allowed !== targetDiscipline) {
      const err = new Error(`Role '${user.role}' may only update the '${allowed}' section`);
      (err as Error & { code: string }).code = "DISCIPLINE_ROLE_MISMATCH";
      throw err;
    }
  }

  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const rows = await tx
      .select()
      .from(carePlans)
      .where(eq(carePlans.patientId, patientId))
      .limit(1);

    const existing = rows[0];
    if (!existing) {
      const err = new Error("Care plan not found for patient");
      (err as Error & { code: string }).code = "CARE_PLAN_NOT_FOUND";
      throw err;
    }

    const currentSections = (existing.disciplineSections ?? {}) as DisciplineSections;
    const existingSection = currentSections[targetDiscipline] as DisciplineSection | undefined;
    const now = new Date().toISOString();

    const updatedSection: DisciplineSection = {
      notes: body.notes !== undefined ? body.notes : (existingSection?.notes ?? ""),
      goals:
        body.goals !== undefined
          ? body.goals.map((g) => ({ ...g, id: g.id || randomUUID() }))
          : (existingSection?.goals ?? []),
      lastUpdatedBy: user.id,
      lastUpdatedAt: now,
    };

    const mergedSections: DisciplineSections = {
      ...currentSections,
      [targetDiscipline]: updatedSection,
    } as DisciplineSections;

    const updated = await tx
      .update(carePlans)
      .set({
        disciplineSections: mergedSections,
        version: existing.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(carePlans.id, existing.id))
      .returning();

    const row = updated[0];
    if (!row) throw new Error("care_plans update returned no rows");

    await logAudit(
      "update",
      user.id,
      patientId,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "care_plan",
        resourceId: row.id,
        details: {
          discipline: targetDiscipline,
          version: row.version,
          goalCount: updatedSection.goals.length,
        },
      },
      tx as unknown as AuditDbCtx,
    );

    return toCarePlanResponse(row);
  });
}

// ── POST /patients/:id/care-plan/physician-review ─────────────────────────────

/**
 * Physician sign-off — records a formal review of the care plan.
 *
 * Rules:
 *  - Only users with role physician | medical_director | admin | supervisor may call this.
 *  - If type === 'initial' and initialReviewCompletedAt is already set, rejects (already done).
 *  - Updates promoted columns + appends to reviewHistory JSONB.
 *  - nextReviewDue = now + 14 calendar days (updated on every sign-off).
 *  - version incremented.
 */
export async function signPhysicianReview(
  patientId: string,
  body: PhysicianReviewBody,
  user: UserCtx,
): Promise<CarePlanResponse> {
  if (!isPhysicianRole(user.role)) {
    const err = new Error(
      "Only physicians, medical directors, or administrators may complete a physician review",
    );
    (err as Error & { code: string }).code = "PHYSICIAN_ROLE_REQUIRED";
    throw err;
  }

  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const rows = await tx
      .select()
      .from(carePlans)
      .where(eq(carePlans.patientId, patientId))
      .limit(1);

    const existing = rows[0];
    if (!existing) {
      const err = new Error("Care plan not found for patient");
      (err as Error & { code: string }).code = "CARE_PLAN_NOT_FOUND";
      throw err;
    }

    if (body.type === "initial" && existing.initialReviewCompletedAt !== null) {
      const err = new Error(
        "Initial physician review has already been completed for this care plan",
      );
      (err as Error & { code: string }).code = "INITIAL_REVIEW_ALREADY_DONE";
      throw err;
    }

    const now = new Date();
    const nextReviewDue = addCalendarDays(now, 14);

    const newEntry: PhysicianReviewEntry = {
      reviewedBy: user.id,
      reviewedAt: now.toISOString(),
      type: body.type,
      signatureNote: body.signatureNote,
    };

    const existingHistory = (existing.reviewHistory ?? []) as PhysicianReviewEntry[];

    const updateValues: Partial<typeof carePlans.$inferInsert> = {
      lastReviewAt: now,
      nextReviewDue,
      reviewHistory: [...existingHistory, newEntry],
      version: existing.version + 1,
      updatedAt: now,
    };

    if (body.type === "initial") {
      updateValues.initialReviewCompletedAt = now;
      updateValues.initialReviewedBy = user.id;
    }

    // Also update the PHYSICIAN discipline section with the signature note
    const currentSections = (existing.disciplineSections ?? {}) as DisciplineSections;
    const existingPhysicianSection = currentSections.PHYSICIAN;
    updateValues.disciplineSections = {
      ...currentSections,
      PHYSICIAN: {
        notes: existingPhysicianSection?.notes ?? "",
        goals: existingPhysicianSection?.goals ?? [],
        lastUpdatedBy: user.id,
        lastUpdatedAt: now.toISOString(),
      },
    } as DisciplineSections;

    const updated = await tx
      .update(carePlans)
      .set(updateValues)
      .where(eq(carePlans.id, existing.id))
      .returning();

    const row = updated[0];
    if (!row) throw new Error("care_plans update returned no rows");

    await logAudit(
      "update",
      user.id,
      patientId,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "care_plan",
        resourceId: row.id,
        details: {
          action: "PHYSICIAN_REVIEW_SIGNED",
          reviewType: body.type,
          nextReviewDue,
          version: row.version,
        },
      },
      tx as unknown as AuditDbCtx,
    );

    return toCarePlanResponse(row);
  });
}

export const CarePlanService = {
  create: createCarePlan,
  get: getCarePlan,
  patchDiscipline: patchCarePlanDiscipline,
  signPhysicianReview,
};
