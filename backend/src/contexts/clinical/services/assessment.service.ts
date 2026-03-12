/**
 * AssessmentService — CRUD + trajectory for pain/symptom assessments.
 *
 * Supports 5 scale types: FLACC, PAINAD, NRS, WONG_BAKER, ESAS.
 *
 * Scale data is stored in JSONB (`data` column) and validated at the route layer.
 * The `totalScore` promoted column is populated from scale-specific fields:
 *   - FLACC/PAINAD: data.totalScore
 *   - NRS/WONG_BAKER: data.score
 *   - ESAS: null (no single total)
 *
 * Trajectory extraction for sparklines:
 *   - pain:   ESAS → data.pain; others → totalScore
 *   - dyspnea:  ESAS → data.dyspnea; others → null
 *   - nausea:   ESAS → data.nausea; others → null
 *   - functionalStatus: null (future functional assessment scales)
 *
 * HIPAA: audit log emitted on every read/write via AuditService.
 */

import { logAudit } from "@/contexts/identity/services/audit.service.js";
import { db } from "@/db/client.js";
import { painAssessments } from "@/db/schema/pain-assessments.table.js";
import { asc, count, eq, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type {
  AssessmentListResponse,
  AssessmentResponse,
  AssessmentType,
  CreateAssessmentBody,
  TrajectoryDataPoint,
  TrajectoryResponse,
} from "../schemas/assessment.schema.js";

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

/** Extract totalScore from scale-specific data for the promoted column. */
function extractTotalScore(
  assessmentType: AssessmentType,
  data: Record<string, unknown>,
): number | null {
  switch (assessmentType) {
    case "FLACC":
    case "PAINAD":
      return typeof data.totalScore === "number" ? data.totalScore : null;
    case "NRS":
    case "WONG_BAKER":
      return typeof data.score === "number" ? data.score : null;
    case "ESAS":
      return null; // ESAS has no single composite score
  }
}

/** Extract sparkline dimensions for the trajectory endpoint. */
function extractTrajectoryScores(
  assessmentType: string,
  totalScore: number | null,
  data: Record<string, unknown>,
): {
  pain: number | null;
  dyspnea: number | null;
  nausea: number | null;
  functionalStatus: number | null;
} {
  if (assessmentType === "ESAS") {
    return {
      pain: typeof data.pain === "number" ? data.pain : null,
      dyspnea: typeof data.dyspnea === "number" ? data.dyspnea : null,
      nausea: typeof data.nausea === "number" ? data.nausea : null,
      functionalStatus: null,
    };
  }
  // FLACC, PAINAD, NRS, WONG_BAKER — totalScore is the pain score
  return {
    pain: totalScore,
    dyspnea: null,
    nausea: null,
    functionalStatus: null,
  };
}

function toAssessmentResponse(row: typeof painAssessments.$inferSelect): AssessmentResponse {
  return {
    id: row.id,
    patientId: row.patientId,
    assessmentType: row.assessmentType as AssessmentType,
    assessedAt: row.assessedAt.toISOString(),
    assessedBy: row.assessedBy,
    totalScore: row.totalScore,
    data: row.data as Record<string, unknown>,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

export async function createAssessment(
  patientId: string,
  body: CreateAssessmentBody,
  user: UserCtx,
): Promise<AssessmentResponse> {
  const data = body.data as Record<string, unknown>;
  const totalScore = extractTotalScore(body.assessmentType, data);

  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const rows = await tx
      .insert(painAssessments)
      .values({
        patientId,
        locationId: user.locationId,
        assessmentType: body.assessmentType,
        assessedAt: new Date(body.assessedAt),
        assessedBy: user.id,
        totalScore,
        data: body.data,
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Insert returned no rows");

    await logAudit(
      "create",
      user.id,
      patientId,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "pain_assessment",
        resourceId: row.id,
        details: { assessmentType: body.assessmentType, totalScore },
      },
      tx as unknown as AuditDbCtx,
    );

    return toAssessmentResponse(row);
  });
}

export async function listAssessments(
  patientId: string,
  user: UserCtx,
): Promise<AssessmentListResponse> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const [rows, countRows] = await Promise.all([
      tx
        .select()
        .from(painAssessments)
        .where(eq(painAssessments.patientId, patientId))
        .orderBy(asc(painAssessments.assessedAt)),
      tx
        .select({ value: count() })
        .from(painAssessments)
        .where(eq(painAssessments.patientId, patientId)),
    ]);

    await logAudit(
      "view",
      user.id,
      patientId,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "pain_assessment",
        details: { action: "list", count: rows.length },
      },
      tx as unknown as AuditDbCtx,
    );

    return {
      assessments: rows.map(toAssessmentResponse),
      total: Number(countRows[0]?.value ?? 0),
    };
  });
}

export async function getTrajectory(
  patientId: string,
  user: UserCtx,
): Promise<TrajectoryResponse> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const rows = await tx
      .select()
      .from(painAssessments)
      .where(eq(painAssessments.patientId, patientId))
      .orderBy(asc(painAssessments.assessedAt));

    await logAudit(
      "view",
      user.id,
      patientId,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "pain_assessment_trajectory",
        details: { action: "trajectory", dataPoints: rows.length },
      },
      tx as unknown as AuditDbCtx,
    );

    const dataPoints: TrajectoryDataPoint[] = rows.map((row) => {
      const data = row.data as Record<string, unknown>;
      const scores = extractTrajectoryScores(row.assessmentType, row.totalScore, data);
      return {
        id: row.id,
        assessedAt: row.assessedAt.toISOString(),
        assessmentType: row.assessmentType as AssessmentType,
        ...scores,
      };
    });

    return { patientId, dataPoints };
  });
}

export const AssessmentService = {
  create: createAssessment,
  list: listAssessments,
  trajectory: getTrajectory,
};
