/**
 * VantageChartService — orchestrates Layer 1 assembly + encounter CRUD.
 *
 * Layer 1: deterministic narrative from structured input via templates.
 * Layer 2: optional LLM enhancement — delegated to vantageChart.llm.ts.
 *
 * Similarity warning: if current input is >90% identical to last accepted
 * input (by JSON string length similarity), a warning flag is returned.
 * This is a clinical quality check, not a hard block.
 *
 * CMS audit: every generate/enhance call logged to audit_logs.
 */

import { logAudit } from "@/contexts/identity/services/audit.service.js";
import { db } from "@/db/client.js";
import { encounters } from "@/db/schema/encounters.table.js";
import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type Iovalkey from "iovalkey";
import type {
  CreateEncounterBody,
  EncounterListResponse,
  EncounterResponse,
  PatchEncounterBody,
} from "../schemas/encounter.schema.js";
import type { VantageChartInput } from "../schemas/vantagechart-input.schema.js";
import { ContextResolverService } from "./context-resolver.service.js";
import { narrativeAssembler } from "./narrative-assembler.service.js";
import { getTemplate } from "./vantageChart.templates.js";

type UserCtx = NonNullable<FastifyRequest["user"]>;

async function applyRlsContext(
  tx: { execute: (typeof db)["execute"] },
  user: UserCtx,
): Promise<void> {
  await tx.execute(sql`SELECT set_config('app.current_user_id', ${user.id}, true)`);
  await tx.execute(sql`SELECT set_config('app.current_location_id', ${user.locationId}, true)`);
  await tx.execute(sql`SELECT set_config('app.current_role', ${user.role}, true)`);
}

function toResponse(row: typeof encounters.$inferSelect): EncounterResponse {
  const result: EncounterResponse = {
    id: row.id,
    patientId: row.patientId,
    locationId: row.locationId,
    clinicianId: row.clinicianId,
    visitType: row.visitType,
    status: row.status,
    addenda: Array.isArray(row.addenda) ? (row.addenda as EncounterResponse["addenda"]) : [],
    visitedAt: row.visitedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  if (row.data !== null) result.data = row.data;
  if (row.vantageChartDraft !== null) result.vantageChartDraft = row.vantageChartDraft;
  if (row.vantageChartMethod !== null) result.vantageChartMethod = row.vantageChartMethod;
  if (row.vantageChartAcceptedAt !== null)
    result.vantageChartAcceptedAt = row.vantageChartAcceptedAt.toISOString();
  if (row.vantageChartTraceability !== null)
    result.vantageChartTraceability = row.vantageChartTraceability as Array<{
      narrativeSegment: string;
      sourceFragment: string;
      inputData: string;
    }>;
  return result;
}

/** Jaccard-style similarity: characters in common / max length */
function inputSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  let same = 0;
  const minLen = Math.min(a.length, b.length);
  for (let i = 0; i < minLen; i++) {
    if (a[i] === b[i]) same++;
  }
  return same / maxLen;
}

export class VantageChartService {
  private readonly contextResolver: ContextResolverService;

  constructor(valkey: Iovalkey) {
    this.contextResolver = new ContextResolverService(valkey);
  }

  // ── Encounter CRUD ─────────────────────────────────────────────────────────

  async createEncounter(
    patientId: string,
    body: CreateEncounterBody,
    user: UserCtx,
  ): Promise<EncounterResponse> {
    return db.transaction(async (tx) => {
      await applyRlsContext(tx, user);

      const [row] = await tx
        .insert(encounters)
        .values({
          patientId,
          locationId: user.locationId,
          clinicianId: user.id,
          visitType: body.visitType,
          visitedAt: body.visitedAt ? new Date(body.visitedAt) : new Date(),
        })
        .returning();

      if (!row) throw new Error("Failed to create encounter");

      await logAudit("create", user.id, patientId, {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "encounter",
        resourceId: row.id,
        details: { encounterId: row.id, visitType: body.visitType },
      });

      return toResponse(row);
    });
  }

  async listEncounters(patientId: string, user: UserCtx): Promise<EncounterListResponse> {
    return db.transaction(async (tx) => {
      await applyRlsContext(tx, user);

      const rows = await tx
        .select()
        .from(encounters)
        .where(and(eq(encounters.patientId, patientId), eq(encounters.locationId, user.locationId)))
        .orderBy(desc(encounters.visitedAt))
        .limit(50);

      await logAudit("view", user.id, patientId, {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "encounter",
        details: { count: rows.length },
      });

      return { encounters: rows.map(toResponse), total: rows.length };
    });
  }

  async getEncounter(
    patientId: string,
    encounterId: string,
    user: UserCtx,
  ): Promise<EncounterResponse | null> {
    return db.transaction(async (tx) => {
      await applyRlsContext(tx, user);

      const [row] = await tx
        .select()
        .from(encounters)
        .where(and(eq(encounters.id, encounterId), eq(encounters.patientId, patientId)));

      if (!row) return null;

      await logAudit("view", user.id, patientId, {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "encounter",
        resourceId: row.id,
      });

      return toResponse(row);
    });
  }

  async patchEncounter(
    patientId: string,
    encounterId: string,
    body: PatchEncounterBody,
    user: UserCtx,
  ): Promise<EncounterResponse | null> {
    return db.transaction(async (tx) => {
      await applyRlsContext(tx, user);

      const updates: Partial<typeof encounters.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (body.status !== undefined) updates.status = body.status;
      if (body.data !== undefined) updates.data = body.data;
      if (body.vantageChartDraft !== undefined) updates.vantageChartDraft = body.vantageChartDraft;
      if (body.vantageChartMethod !== undefined)
        updates.vantageChartMethod = body.vantageChartMethod;
      if (body.vantageChartAcceptedAt !== undefined)
        updates.vantageChartAcceptedAt = new Date(body.vantageChartAcceptedAt);
      if (body.vantageChartTraceability !== undefined)
        updates.vantageChartTraceability = body.vantageChartTraceability;

      let row: typeof encounters.$inferSelect | undefined;

      if (body.addendum !== undefined) {
        // Append addendum via JSONB array concat — never overwrites existing entries
        const [addendumRow] = await tx
          .update(encounters)
          .set({ ...updates, addenda: sql`addenda || ${JSON.stringify([body.addendum])}::jsonb` })
          .where(and(eq(encounters.id, encounterId), eq(encounters.patientId, patientId)))
          .returning();
        row = addendumRow;
      } else {
        const [updatedRow] = await tx
          .update(encounters)
          .set(updates)
          .where(and(eq(encounters.id, encounterId), eq(encounters.patientId, patientId)))
          .returning();
        row = updatedRow;
      }

      if (!row) return null;

      await logAudit("update", user.id, patientId, {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "encounter",
        resourceId: encounterId,
        details: { fields: Object.keys(updates) },
      });

      // Invalidate context cache when note is accepted
      if (body.vantageChartAcceptedAt) {
        await this.contextResolver.invalidate(patientId);
      }

      return toResponse(row);
    });
  }

  // ── Layer 1 — Generate ─────────────────────────────────────────────────────

  async generateNarrative(
    patientId: string,
    encounterId: string,
    input: VantageChartInput,
    user: UserCtx,
  ) {
    // Resolve patient context (cached)
    const context = await this.contextResolver.resolveContext(patientId);

    // Assemble narrative
    const template = getTemplate(input.visitType);
    const result = narrativeAssembler.assembleNarrative(template, input);

    // Similarity check vs last accepted visit
    const similarityWarning =
      context.lastAcceptedInput !== null &&
      inputSimilarity(JSON.stringify(input), context.lastAcceptedInput) > 0.9;

    // Audit — never log draft text or PHI
    await logAudit("create", user.id, patientId, {
      userRole: user.role,
      locationId: user.locationId,
      resourceType: "vantage_chart",
      resourceId: encounterId,
      details: {
        method: "TEMPLATE",
        visitType: input.visitType,
        sectionCount: result.metadata.sectionCount,
        fragmentCount: result.metadata.fragmentCount,
        similarityWarning,
      },
    });

    return {
      draft: result.narrative,
      method: "TEMPLATE" as const,
      metadata: result.metadata,
      traceability: result.traceability,
      similarityWarning,
    };
  }

  // ── Context resolver (exposed for routes) ──────────────────────────────────

  async getPatientContext(patientId: string) {
    return this.contextResolver.resolveContext(patientId);
  }
}
