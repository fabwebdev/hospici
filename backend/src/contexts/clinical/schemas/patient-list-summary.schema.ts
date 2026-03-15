// contexts/clinical/schemas/patient-list-summary.schema.ts
// Bulk enrichment data for the patient list — IDG compliance, NOE status, primary clinician.

import { type Static, Type } from "@sinclair/typebox";

export const PatientEnrichmentSchema = Type.Object(
  {
    idg: Type.Object({
      lastCompletedAt: Type.Union([Type.String(), Type.Null()]),
      daysRemaining: Type.Union([Type.Integer(), Type.Null()]),
      status: Type.Union([
        Type.Literal("ok"),
        Type.Literal("warning"),
        Type.Literal("overdue"),
        Type.Literal("none"),
      ]),
    }),
    noeStatus: Type.Union([Type.String(), Type.Null()]),
    primaryClinician: Type.Union([Type.String(), Type.Null()]),
  },
  { additionalProperties: false },
);

export type PatientEnrichment = Static<typeof PatientEnrichmentSchema>;

export const PatientListSummaryResponseSchema = Type.Object({
  summary: Type.Record(Type.String(), PatientEnrichmentSchema),
});

export type PatientListSummaryResponse = Static<typeof PatientListSummaryResponseSchema>;
