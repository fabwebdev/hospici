/**
 * ContextResolverService — enriches VantageChart input with prior visit data.
 *
 * - Fetches last 5 encounters + 5 pain assessments from DB
 * - Computes pain trend (improving / worsening / stable) using ±2 threshold
 * - Results cached in Valkey at vantage:context:{patientId} for 300s
 * - Returns pre-population suggestions and IDG-relevant topics
 *
 * PHI: patient identifiers are NEVER included in the output sent to Layer 2 LLM.
 */

import { db } from "@/db/client.js";
import { encounters } from "@/db/schema/encounters.table.js";
import { painAssessments } from "@/db/schema/pain-assessments.table.js";
import type Iovalkey from "iovalkey";
import { desc, eq } from "drizzle-orm";

const CACHE_TTL_SECONDS = 300;
const CACHE_KEY_PREFIX = "vantage:context:";

export interface ContextResolutionResult {
  suggestions: Record<string, unknown>;
  trends: {
    painTrend: "improving" | "worsening" | "stable" | "insufficient_data";
    symptomBurdenScore: number;
    functionalDeclineRate: number;
  };
  alerts: Array<{
    type: "warning" | "info" | "critical";
    message: string;
    sourceData: string;
  }>;
  idgRelevance: {
    significantChanges: boolean;
    topicsForDiscussion: string[];
  };
  /** Last accepted vantage chart draft — used for similarity check */
  lastAcceptedDraft: string | null;
  /** JSON-serialised VantageChartInput from last accepted visit */
  lastAcceptedInput: string | null;
}

export class ContextResolverService {
  constructor(private readonly valkey: Iovalkey) {}

  async resolveContext(patientId: string): Promise<ContextResolutionResult> {
    const cacheKey = `${CACHE_KEY_PREFIX}${patientId}`;

    // Check Valkey cache
    const cached = await this.valkey.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as ContextResolutionResult;
    }

    const result = await this.buildContext(patientId);

    // Cache result
    await this.valkey.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(result));

    return result;
  }

  /** Invalidate context cache after a new encounter is accepted */
  async invalidate(patientId: string): Promise<void> {
    await this.valkey.del(`${CACHE_KEY_PREFIX}${patientId}`);
  }

  private async buildContext(patientId: string): Promise<ContextResolutionResult> {
    const result: ContextResolutionResult = {
      suggestions: {},
      trends: {
        painTrend: "insufficient_data",
        symptomBurdenScore: 0,
        functionalDeclineRate: 0,
      },
      alerts: [],
      idgRelevance: {
        significantChanges: false,
        topicsForDiscussion: [],
      },
      lastAcceptedDraft: null,
      lastAcceptedInput: null,
    };

    // Fetch prior encounters (most recent first)
    const priorEncounters = await db
      .select()
      .from(encounters)
      .where(eq(encounters.patientId, patientId))
      .orderBy(desc(encounters.visitedAt))
      .limit(5);

    // Fetch prior pain assessments
    const priorPainAssessments = await db
      .select()
      .from(painAssessments)
      .where(eq(painAssessments.patientId, patientId))
      .orderBy(desc(painAssessments.assessedAt))
      .limit(5);

    // ── Pain trend analysis ────────────────────────────────────────────────────
    const painScores = priorPainAssessments
      .map((p) => p.totalScore)
      .filter((s): s is number => s !== null);

    if (painScores.length >= 2) {
      const score0 = painScores[0] ?? 0;
      const score1 = painScores[1] ?? score0;
      const scoreLast = painScores[painScores.length - 1] ?? 0;
      const scoreSecondLast = painScores[painScores.length - 2] ?? scoreLast;
      const recentAvg = (score0 + score1) / 2;
      const olderAvg = (scoreLast + scoreSecondLast) / 2;

      if (recentAvg > olderAvg + 2) {
        result.trends.painTrend = "worsening";
        result.alerts.push({
          type: "warning",
          message: `Pain trend worsening: ${olderAvg.toFixed(1)} → ${recentAvg.toFixed(1)}`,
          sourceData: "prior_pain_assessments",
        });
        result.idgRelevance.topicsForDiscussion.push("Pain management review");
      } else if (recentAvg < olderAvg - 2) {
        result.trends.painTrend = "improving";
      } else {
        result.trends.painTrend = "stable";
      }
    }

    // ── Prior encounter analysis ───────────────────────────────────────────────
    const lastEncounter = priorEncounters[0];
    if (lastEncounter) {
      const daysSince = Math.floor(
        (Date.now() - new Date(lastEncounter.visitedAt).getTime()) / 86_400_000,
      );

      // Suggest caregiver coping if < 7 days since last visit
      if (daysSince < 7) {
        const data = lastEncounter.data as Record<string, unknown> | null;
        const caregiverCoping = (data?.psychosocial as Record<string, unknown>)
          ?.caregiverCoping;
        if (caregiverCoping) {
          result.suggestions["psychosocial.caregiverCoping"] = caregiverCoping;
        }
      }

      if (daysSince > 7) {
        result.alerts.push({
          type: "info",
          message: `${daysSince} days since last RN visit — verify visit frequency orders`,
          sourceData: "encounter_history",
        });
      }

      // Last accepted draft + input for similarity check
      if (lastEncounter.vantageChartAcceptedAt) {
        result.lastAcceptedDraft = lastEncounter.vantageChartDraft ?? null;
        const inputData = lastEncounter.data;
        result.lastAcceptedInput = inputData ? JSON.stringify(inputData) : null;
      }
    }

    // ── Symptom burden score ───────────────────────────────────────────────────
    const allSymptoms = priorEncounters.flatMap((e) => {
      const data = e.data as Record<string, unknown> | null;
      return Array.isArray(data?.symptoms) ? (data.symptoms as Array<{ severity?: number }>) : [];
    });

    if (allSymptoms.length > 0) {
      const avgSeverity =
        allSymptoms.reduce((sum, s) => sum + (s.severity ?? 0), 0) / allSymptoms.length;
      result.trends.symptomBurdenScore = Math.round(avgSeverity * 10) / 10;
    }

    result.idgRelevance.significantChanges = result.alerts.some(
      (a) => a.type === "warning" || a.type === "critical",
    );

    return result;
  }
}
