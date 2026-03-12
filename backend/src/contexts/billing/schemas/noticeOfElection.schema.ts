// contexts/billing/schemas/noticeOfElection.schema.ts
// CMS NOE (Notice of Election) - 5-day filing rule with Friday edge case

import { Type, Static } from "@sinclair/typebox";
import { TypeCompiler } from "@sinclair/typebox/compiler";

export const NOEStatusSchema = Type.Enum({
	draft: "draft",
	submitted: "submitted",
	acknowledged: "acknowledged",
	rejected: "rejected",
	corrected: "corrected",
});

export const NOESchema = Type.Object(
	{
		id: Type.String({ format: "uuid" }),
		patientId: Type.String({ format: "uuid" }),
		benefitPeriodId: Type.String({ format: "uuid" }),
		status: NOEStatusSchema,
		electionDate: Type.String({ format: "date" }),
		filedDate: Type.String({ format: "date" }),
		filingDeadline: Type.String({ format: "date" }),
		submittedAt: Type.Optional(Type.String({ format: "date-time" })),
		lateFilingReason: Type.Optional(Type.String({ minLength: 20 })),
		locationId: Type.String({ format: "uuid" }),
		createdAt: Type.String({ format: "date-time" }),
		updatedAt: Type.String({ format: "date-time" }),
	},
	{ additionalProperties: false },
);

// NOE 5-day rule validation
export const validateNOEDeadline = (
	noe: Pick<Static<typeof NOESchema>, "electionDate" | "filedDate" | "lateFilingReason">,
): { valid: boolean; error?: string } => {
	const electionDate = new Date(noe.electionDate);
	const filedDate = new Date(noe.filedDate);

	// Calculate 5 business days (excluding weekends and federal holidays)
	// This is a simplified version - full implementation in business-days.ts
	const deadline = new Date(electionDate);
	let businessDays = 0;
	while (businessDays < 5) {
		deadline.setDate(deadline.getDate() + 1);
		const day = deadline.getDay();
		if (day !== 0 && day !== 6) {
			// Skip weekends (0=Sunday, 6=Saturday)
			businessDays++;
		}
	}

	const isLate = filedDate > deadline;
	if (isLate && !noe.lateFilingReason) {
		return {
			valid: false,
			error: "Late NOE filing requires a justification of at least 20 characters.",
		};
	}

	return { valid: true };
};

export const NOEValidator = TypeCompiler.Compile(NOESchema);

export type NOE = Static<typeof NOESchema>;
export type NOEStatus = Static<typeof NOEStatusSchema>;
