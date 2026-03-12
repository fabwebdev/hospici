// contexts/billing/schemas/hospiceCap.schema.ts
// Hospice Cap Calculation - Aggregate and Proportional methodologies

import { Type, type Static } from "@sinclair/typebox";
import { TypeCompiler } from "@sinclair/typebox/compiler";

export const CapMethodologySchema = Type.Enum({
	aggregate: "aggregate",
	proportional: "proportional",
});

export const CapCalculationSchema = Type.Object(
	{
		id: Type.String({ format: "uuid" }),
		hospiceId: Type.String({ format: "uuid" }),
		capYear: Type.Number(),
		methodology: CapMethodologySchema,
		// Cap year boundaries: Nov 1 (capYear-1) to Oct 31 (capYear)
		capYearStart: Type.String({ format: "date" }),
		capYearEnd: Type.String({ format: "date" }),
		// Calculation inputs
		aggregateCapAmount: Type.Number(),
		actualReimbursement: Type.Number(),
		beneficiaryYears: Type.Number(),
		// Results
		liability: Type.Number(),
		status: Type.Enum({
			under_cap: "under_cap",
			overage: "overage",
			at_threshold: "at_threshold",
		}),
		alertThreshold: Type.Number({ default: 0.8 }),
		alertSentAt: Type.Optional(Type.String({ format: "date-time" })),
		calculatedAt: Type.String({ format: "date-time" }),
		locationId: Type.String({ format: "uuid" }),
	},
	{ additionalProperties: false },
);

// Cap calculation logic
export const calculateCapLiability = (data: {
	actualReimbursement: number;
	aggregateCapAmount: number;
	alertThreshold: number;
}): {
	liability: number;
	status: "under_cap" | "overage" | "at_threshold";
	utilizationPercent: number;
} => {
	const liability = Math.max(0, data.actualReimbursement - data.aggregateCapAmount);
	const utilizationPercent = data.actualReimbursement / data.aggregateCapAmount;

	let status: "under_cap" | "overage" | "at_threshold" = "under_cap";
	if (liability > 0) {
		status = "overage";
	} else if (utilizationPercent >= data.alertThreshold) {
		status = "at_threshold";
	}

	return { liability, status, utilizationPercent };
};

// Cap year runs Nov 1 - Oct 31
export const getCapYearDates = (capYear: number): { start: string; end: string } => {
	return {
		start: `${capYear - 1}-11-01`,
		end: `${capYear}-10-31`,
	};
};

export const CapCalculationValidator = TypeCompiler.Compile(CapCalculationSchema);

export type CapCalculation = Static<typeof CapCalculationSchema>;
export type CapMethodology = Static<typeof CapMethodologySchema>;
