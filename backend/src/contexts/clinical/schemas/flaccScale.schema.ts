// contexts/clinical/schemas/flaccScale.schema.ts
// FLACC Pain Scale for pediatric patients (0-2 years)

import { Type, type Static } from "@sinclair/typebox";
import { TypeCompiler } from "@sinclair/typebox/compiler";

export const FlaccScaleSchema = Type.Object(
	{
		id: Type.String({ format: "uuid" }),
		patientId: Type.String({ format: "uuid" }),
		assessedAt: Type.String({ format: "date-time" }),
		// Face (0-2)
		face: Type.Number({ minimum: 0, maximum: 2 }),
		// Legs (0-2)
		legs: Type.Number({ minimum: 0, maximum: 2 }),
		// Activity (0-2)
		activity: Type.Number({ minimum: 0, maximum: 2 }),
		// Cry (0-2)
		cry: Type.Number({ minimum: 0, maximum: 2 }),
		// Consolability (0-2)
		consolability: Type.Number({ minimum: 0, maximum: 2 }),
		// Total score (0-10)
		totalScore: Type.Number({ minimum: 0, maximum: 10 }),
		assessedBy: Type.String({ format: "uuid" }),
		locationId: Type.String({ format: "uuid" }),
	},
	{ additionalProperties: false },
);

export const FlaccScaleValidator = TypeCompiler.Compile(FlaccScaleSchema);

export type FlaccScale = Static<typeof FlaccScaleSchema>;
