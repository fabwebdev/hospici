/**
 * Narrative template schema — defines the typed rule DSL and template structure
 * used by the VantageChart Layer 1 engine.
 *
 * SECURITY: conditions use a typed rule DSL (never raw strings / new Function / eval).
 * All evaluation is done by a deterministic interpreter in narrative-assembler.service.ts.
 */

import { type Static, Type } from "@sinclair/typebox";

// ── Typed Rule DSL ─────────────────────────────────────────────────────────────
// Replaces string conditions to eliminate code injection.
// All conditions are evaluated by a deterministic interpreter.

export const RuleConditionSchema = Type.Recursive(
  (This) =>
    Type.Union([
      // Comparison operators — path is a dot-path into VantageChartInput
      Type.Object({
        op: Type.Literal("eq"),
        path: Type.String(),
        value: Type.Union([Type.String(), Type.Number(), Type.Boolean()]),
      }),
      Type.Object({
        op: Type.Literal("neq"),
        path: Type.String(),
        value: Type.Union([Type.String(), Type.Number(), Type.Boolean()]),
      }),
      Type.Object({ op: Type.Literal("gt"), path: Type.String(), value: Type.Number() }),
      Type.Object({ op: Type.Literal("gte"), path: Type.String(), value: Type.Number() }),
      Type.Object({ op: Type.Literal("lt"), path: Type.String(), value: Type.Number() }),
      Type.Object({ op: Type.Literal("lte"), path: Type.String(), value: Type.Number() }),
      // Presence checks
      Type.Object({ op: Type.Literal("truthy"), path: Type.String() }),
      Type.Object({ op: Type.Literal("falsy"), path: Type.String() }),
      // Array length check
      Type.Object({
        op: Type.Literal("arrayLength"),
        path: Type.String(),
        gt: Type.Optional(Type.Number()),
        gte: Type.Optional(Type.Number()),
        lt: Type.Optional(Type.Number()),
        lte: Type.Optional(Type.Number()),
        eq: Type.Optional(Type.Number()),
      }),
      // Array any/every — recursive condition applied to each element
      Type.Object({ op: Type.Literal("arrayAny"), path: Type.String(), where: This }),
      Type.Object({ op: Type.Literal("arrayEvery"), path: Type.String(), where: This }),
      // Logical combinators
      Type.Object({ op: Type.Literal("and"), conditions: Type.Array(This) }),
      Type.Object({ op: Type.Literal("or"), conditions: Type.Array(This) }),
      Type.Object({ op: Type.Literal("not"), condition: This }),
    ]),
  { $id: "RuleCondition" },
);

export type RuleCondition = Static<typeof RuleConditionSchema>;

// ── Variable mapping schema ────────────────────────────────────────────────────

export const TransformSchema = Type.Enum(
  {
    lowerCase: "lowerCase",
    upperCase: "upperCase",
    capitalize: "capitalize",
    joinWithComma: "joinWithComma",
    joinWithSemicolon: "joinWithSemicolon",
    numericToWord: "numericToWord",
    formatSymptoms: "formatSymptoms",
    worseningSymptomNames: "worseningSymptomNames",
    formatInterventions: "formatInterventions",
    formatSafetyConcerns: "formatSafetyConcerns",
    booleanToNotificationPhrase: "booleanToNotificationPhrase",
  },
  { $id: "Transform" },
);

// ── NarrativeTemplate ─────────────────────────────────────────────────────────

export const NarrativeTemplateSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    name: Type.String(),
    version: Type.Number(),
    visitType: Type.Enum({
      routine_rn: "routine_rn",
      admission: "admission",
      recertification: "recertification",
      supervisory: "supervisory",
      prn: "prn",
      discharge: "discharge",
    }),

    sections: Type.Array(
      Type.Object({
        id: Type.String(),
        title: Type.String(),
        order: Type.Number(),
        condition: Type.Optional(RuleConditionSchema),

        fragments: Type.Array(
          Type.Object({
            id: Type.String(),
            template: Type.String(),
            condition: Type.Optional(RuleConditionSchema),
            priority: Type.Number(),

            variables: Type.Optional(
              Type.Record(
                Type.String(),
                Type.Object({
                  source: Type.String(),
                  transform: Type.Optional(TransformSchema),
                  fallback: Type.Optional(Type.String()),
                }),
              ),
            ),
          }),
        ),
      }),
    ),

    contextRules: Type.Array(
      Type.Object({
        trigger: RuleConditionSchema,
        action: Type.Enum({
          addPhrase: "addPhrase",
          modifyTemplate: "modifyTemplate",
          addSection: "addSection",
        }),
        value: Type.String(),
      }),
    ),

    complianceTags: Type.Array(Type.String()),
    createdBy: Type.String(),
    createdAt: Type.String({ format: "date-time" }),
    lastModified: Type.String({ format: "date-time" }),
  },
  { $id: "NarrativeTemplate" },
);

export type NarrativeTemplate = Static<typeof NarrativeTemplateSchema>;
