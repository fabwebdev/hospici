// contexts/scheduling/schemas/aideSupervision.schema.ts
// HHA Aide Supervision - CMS 42 CFR §418.76 (14-day requirement)

import { Type, type Static } from "@sinclair/typebox";
import { TypeCompiler } from "@sinclair/typebox/compiler";

export const SupervisionMethodSchema = Type.Enum({
	inPerson: "in_person",
	virtual: "virtual",
	observation: "observation",
});

export const AideSupervisionSchema = Type.Object(
	{
		id: Type.String({ format: "uuid" }),
		patientId: Type.String({ format: "uuid" }),
		aideId: Type.String({ format: "uuid" }),
		aideName: Type.String(),
		supervisorId: Type.String({ format: "uuid" }), // RN or supervising clinician
		supervisorName: Type.String(),
		supervisionDate: Type.String({ format: "date" }),
		nextSupervisionDue: Type.String({ format: "date" }), // supervisionDate + 14 days
		method: SupervisionMethodSchema,
		findings: Type.String({ minLength: 10 }),
		actionRequired: Type.Boolean(),
		actionTaken: Type.Optional(Type.String()),
		actionCompletedAt: Type.Optional(Type.String({ format: "date-time" })),
		// Compliance tracking
		daysUntilDue: Type.Number(),
		isOverdue: Type.Boolean(),
		locationId: Type.String({ format: "uuid" }),
		createdAt: Type.String({ format: "date-time" }),
		updatedAt: Type.String({ format: "date-time" }),
	},
	{ additionalProperties: false },
);

// Calculate next supervision due date (14 days from supervision date)
export const calculateNextSupervisionDue = (supervisionDate: string): string => {
	const date = new Date(supervisionDate);
	date.setDate(date.getDate() + 14);
	return date.toISOString().split("T")[0] ?? "";
};

// Check if supervision is overdue
export const checkSupervisionOverdue = (
	nextDueDate: string,
	currentDate: string = new Date().toISOString(),
): { isOverdue: boolean; daysOverdue: number } => {
	const due = new Date(nextDueDate);
	const current = new Date(currentDate);
	const diff = Math.floor((current.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));

	return {
		isOverdue: diff > 0,
		daysOverdue: Math.max(0, diff),
	};
};

// Alert threshold: 2 days before due date
export const shouldSendSupervisionAlert = (
	nextDueDate: string,
	alertSentAt?: string,
): boolean => {
	if (alertSentAt) return false;

	const now = new Date();
	const due = new Date(nextDueDate);
	const daysUntilDue = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

	return daysUntilDue <= 2;
};

export const AideSupervisionValidator = TypeCompiler.Compile(AideSupervisionSchema);

export type AideSupervision = Static<typeof AideSupervisionSchema>;
export type SupervisionMethod = Static<typeof SupervisionMethodSchema>;
