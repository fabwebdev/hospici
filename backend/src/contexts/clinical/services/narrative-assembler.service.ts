/**
 * NarrativeAssemblerService — Layer 1 deterministic narrative assembly.
 *
 * Uses pre-compiled Handlebars templates (from vantagechart-compiler.ts).
 * Conditions evaluated via a typed rule DSL — no eval(), no new Function().
 * Dot-path resolution only for variable sources.
 *
 * Security guarantees:
 *  - Template strings compiled at module load, never at request time
 *  - Condition evaluation is a pure switch/case interpreter
 *  - Variable sources must be dot-paths — no expression evaluation
 */

import Handlebars from "handlebars";
import type { RuleCondition } from "../schemas/narrative-template.schema.js";
import type { NarrativeTemplate } from "../schemas/narrative-template.schema.js";
import type { VantageChartInput } from "../schemas/vantagechart-input.schema.js";

export interface AssemblyResult {
  narrative: string;
  metadata: {
    sectionCount: number;
    fragmentCount: number;
    wordCount: number;
    estimatedReadingTime: number;
    /** UI progress indicator only — not a regulatory compliance claim */
    completenessPercent: number;
  };
  traceability: Array<{
    narrativeSegment: string;
    sourceFragment: string;
    inputData: string;
  }>;
}

export class NarrativeAssemblerService {
  private readonly hbs: typeof Handlebars;
  /** Pre-compiled template cache: templateId:sectionId:fragmentId → compiled fn */
  // biome-ignore lint/suspicious/noExplicitAny: Handlebars compiled template type
  private readonly compiledCache = new Map<string, (ctx: any) => string>();

  constructor() {
    this.hbs = Handlebars.create();
    this.registerHelpers();
  }

  // ── Handlebars Helpers ─────────────────────────────────────────────────────

  private registerHelpers(): void {
    // formatSymptoms: [{symptom, severity}] → "pain (7/10), dyspnea (5/10)"
    this.hbs.registerHelper(
      "formatSymptoms",
      (symptoms: Array<{ symptom: string; severity: number }>) => {
        if (!Array.isArray(symptoms) || symptoms.length === 0) {
          return "no significant symptoms";
        }
        return symptoms
          .filter((s) => s.severity > 0)
          .map((s) => `${s.symptom} (${s.severity}/10)`)
          .join(", ");
      },
    );

    // worseningSymptomNames: [{symptom, isWorsening}] → "pain, dyspnea"
    this.hbs.registerHelper(
      "worseningSymptomNames",
      (symptoms: Array<{ symptom: string; isWorsening: boolean }>) => {
        if (!Array.isArray(symptoms)) return "";
        return symptoms
          .filter((s) => s.isWorsening)
          .map((s) => s.symptom)
          .join(", ");
      },
    );

    // formatInterventions: [{description}] → "wound care; medication education"
    this.hbs.registerHelper(
      "formatInterventions",
      (interventions: Array<{ description: string }>) => {
        if (!Array.isArray(interventions)) return "";
        return interventions.map((i) => i.description).join("; ");
      },
    );

    // formatSafetyConcerns: {fallRisk, environmentConcerns} → "high fall risk; cluttered entryway"
    this.hbs.registerHelper(
      "formatSafetyConcerns",
      (safety: {
        fallRisk: string;
        environmentConcerns?: string[];
      }) => {
        const parts: string[] = [];
        if (safety.fallRisk === "high") parts.push("high fall risk");
        if (safety.environmentConcerns?.length) {
          parts.push(...safety.environmentConcerns);
        }
        return parts.join("; ") || "none";
      },
    );

    // formatPlanChanges: [{description, requiresPhysician}] → list
    this.hbs.registerHelper(
      "formatPlanChanges",
      (
        changes: Array<{
          description: string;
          requiresPhysician: boolean;
        }>,
      ) => {
        if (!Array.isArray(changes)) return "";
        return changes
          .map(
            (c) =>
              `${c.description}${c.requiresPhysician ? " (physician notification required)" : ""}`,
          )
          .join("; ");
      },
    );
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  assembleNarrative(template: NarrativeTemplate, input: VantageChartInput): AssemblyResult {
    const result: AssemblyResult = {
      narrative: "",
      metadata: {
        sectionCount: 0,
        fragmentCount: 0,
        wordCount: 0,
        estimatedReadingTime: 0,
        completenessPercent: 0,
      },
      traceability: [],
    };

    const assembledSections: string[] = [];

    // Sort sections by order
    const sortedSections = [...template.sections].sort((a, b) => a.order - b.order);

    for (const section of sortedSections) {
      if (section.condition && !this.evaluateCondition(section.condition, input)) {
        continue;
      }

      const sectionFragments: string[] = [];
      const sortedFragments = [...section.fragments].sort((a, b) => a.priority - b.priority);

      for (const fragment of sortedFragments) {
        if (fragment.condition && !this.evaluateCondition(fragment.condition, input)) {
          continue;
        }

        // Resolve variables from dot-paths only
        const vars: Record<string, unknown> = {};
        for (const [varName, varConfig] of Object.entries(fragment.variables ?? {})) {
          let value = this.resolvePath(input, varConfig.source);

          if (varConfig.transform !== undefined && value !== undefined) {
            value = this.applyTransform(value, varConfig.transform);
          }

          if (value === undefined || value === null || value === "") {
            value = varConfig.fallback ?? "";
          }

          vars[varName] = value;
        }

        // Get or compile Handlebars template
        const cacheKey = `${template.id}:${section.id}:${fragment.id}`;
        let compiled = this.compiledCache.get(cacheKey);
        if (!compiled) {
          // biome-ignore lint/suspicious/noExplicitAny: Handlebars compile return
          compiled = this.hbs.compile(fragment.template) as (ctx: any) => string;
          this.compiledCache.set(cacheKey, compiled);
        }

        // Pass both vars and the raw input so block helpers can access arrays
        const rendered = (compiled as (ctx: unknown) => string)({ ...vars, ...input }).trim();

        if (rendered) {
          sectionFragments.push(rendered);
          result.traceability.push({
            narrativeSegment: rendered,
            sourceFragment: fragment.id,
            inputData: JSON.stringify(vars),
          });
          result.metadata.fragmentCount++;
        }
      }

      if (sectionFragments.length > 0) {
        const sectionText = sectionFragments.join("");
        assembledSections.push(sectionText);
        result.metadata.sectionCount++;
      }
    }

    // Apply context rules (addPhrase only; addSection deferred)
    for (const rule of template.contextRules ?? []) {
      if (this.evaluateCondition(rule.trigger, input)) {
        if (rule.action === "addPhrase") {
          assembledSections.push(rule.value);
        }
      }
    }

    result.narrative = assembledSections.join("\n\n");
    result.metadata.wordCount = result.narrative.split(/\s+/).filter(Boolean).length;
    result.metadata.estimatedReadingTime = Math.ceil(result.metadata.wordCount / 200);
    result.metadata.completenessPercent = this.calculateCompletenessPercent(template, input);

    return result;
  }

  // ── Condition Evaluator ────────────────────────────────────────────────────
  // Pure switch/case — no dynamic code execution.

  evaluateCondition(condition: RuleCondition, input: unknown): boolean {
    switch (condition.op) {
      case "eq":
        return this.resolvePath(input, condition.path) === condition.value;
      case "neq":
        return this.resolvePath(input, condition.path) !== condition.value;
      case "gt":
        return (this.resolvePath(input, condition.path) as number) > condition.value;
      case "gte":
        return (this.resolvePath(input, condition.path) as number) >= condition.value;
      case "lt":
        return (this.resolvePath(input, condition.path) as number) < condition.value;
      case "lte":
        return (this.resolvePath(input, condition.path) as number) <= condition.value;
      case "truthy":
        return Boolean(this.resolvePath(input, condition.path));
      case "falsy":
        return !this.resolvePath(input, condition.path);
      case "arrayLength": {
        const arr = this.resolvePath(input, condition.path);
        const len = Array.isArray(arr) ? arr.length : 0;
        if (condition.gt !== undefined && !(len > condition.gt)) return false;
        if (condition.gte !== undefined && !(len >= condition.gte)) return false;
        if (condition.lt !== undefined && !(len < condition.lt)) return false;
        if (condition.lte !== undefined && !(len <= condition.lte)) return false;
        if (condition.eq !== undefined && len !== condition.eq) return false;
        return true;
      }
      case "arrayAny": {
        const arr = this.resolvePath(input, condition.path);
        return (
          Array.isArray(arr) && arr.some((item) => this.evaluateCondition(condition.where, item))
        );
      }
      case "arrayEvery": {
        const arr = this.resolvePath(input, condition.path);
        return (
          Array.isArray(arr) && arr.every((item) => this.evaluateCondition(condition.where, item))
        );
      }
      case "and":
        return condition.conditions.every((c) => this.evaluateCondition(c, input));
      case "or":
        return condition.conditions.some((c) => this.evaluateCondition(c, input));
      case "not":
        return !this.evaluateCondition(condition.condition, input);
    }
  }

  // ── Private Utilities ──────────────────────────────────────────────────────

  /** Dot-path traversal only — never evaluates expressions. */
  private resolvePath(obj: unknown, path: string): unknown {
    return path.split(".").reduce((acc, key) => {
      if (acc === null || acc === undefined) return undefined;
      return (acc as Record<string, unknown>)[key];
    }, obj);
  }

  private applyTransform(value: unknown, transform: string): unknown {
    switch (transform) {
      case "lowerCase":
        return String(value).toLowerCase();
      case "upperCase":
        return String(value).toUpperCase();
      case "capitalize": {
        const s = String(value);
        return s.charAt(0).toUpperCase() + s.slice(1);
      }
      case "joinWithComma":
        return Array.isArray(value) ? value.join(", ") : value;
      case "joinWithSemicolon":
        return Array.isArray(value) ? value.join("; ") : value;
      case "numericToWord": {
        const words = [
          "zero",
          "one",
          "two",
          "three",
          "four",
          "five",
          "six",
          "seven",
          "eight",
          "nine",
          "ten",
        ];
        const n = Number(value);
        return Number.isNaN(n) ? String(value) : (words[n] ?? String(value));
      }
      case "booleanToNotificationPhrase":
        return value ? "physician notification required" : "no physician notification needed";
      default:
        return value;
    }
  }

  /** Returns a 0–100 UI progress indicator — NOT a regulatory compliance score. */
  private calculateCompletenessPercent(
    template: NarrativeTemplate,
    input: VantageChartInput,
  ): number {
    let present = 0;
    const total = template.sections.length;
    for (const section of template.sections) {
      if (!section.condition || this.evaluateCondition(section.condition, input)) {
        present++;
      }
    }
    return total === 0 ? 0 : Math.round((present / total) * 100);
  }
}

/** Singleton — shared across requests (Handlebars instance is stateless after registration) */
export const narrativeAssembler = new NarrativeAssemblerService();
