// contexts/billing/schemas/benefitPeriod.schema.ts
// CMS Hospice Benefit Periods (90d/90d/60d/60d...)

import { Type, type Static } from "@sinclair/typebox";
import { TypeCompiler } from "@sinclair/typebox/compiler";

export const BenefitPeriodTypeSchema = Type.Enum({
	initial90: "initial_90",
	second90: "second_90",
	subsequent60: "subsequent_60",
	unlimited60: "unlimited_60",
	concurrentCare: "concurrent_care",
});

export const BenefitPeriodStatusSchema = Type.Enum({
	active: "active",
	pending: "pending",
	expired: "expired",
	revoked: "revoked",
	 discharged: "discharged",
});

export const BenefitPeriodSchema = Type.Object(
	{
		id: Type.String({ format: "uuid" }),
		patientId: Type.String({ format: "uuid" }),
		periodNumber: Type.Number({ minimum: 1 }),
		startDate: Type.String({ format: "date" }),
		endDate: Type.String({ format: "date" }),
		type: BenefitPeriodTypeSchema,
		status: BenefitPeriodStatusSchema,
		isActive: Type.Boolean(),
		// F2F requirement for period 3+
		f2fRequired: Type.Boolean(),
		f2fDate: Type.Optional(Type.String({ format: "date" })),
		f2fPhysicianId: Type.Optional(Type.String({ format: "uuid" })),
		// Alert tracking
		alertSentAt: Type.Optional(Type.String({ format: "date-time" })),
		locationId: Type.String({ format: "uuid" }),
		createdAt: Type.String({ format: "date-time" }),
		updatedAt: Type.String({ format: "date-time" }),
	},
	{ additionalProperties: false },
);

// Benefit period rules
export const getBenefitPeriodDuration = (periodNumber: number): number => {
	if (periodNumber === 1 || periodNumber === 2) return 90;
	return 60; // period 3+ is 60 days
};

export const isF2FRequired = (periodNumber: number): boolean => {
	return periodNumber >= 3;
};

// Alert at day 75 (15 days before expiry for 90-day periods)
export const shouldSendExpiryAlert = (
	startDate: string,
	endDate: string,
	alertSentAt?: string,
): boolean => {
	if (alertSentAt) return false; // Already sent

	const now = new Date();
	const end = new Date(endDate);
	const daysUntilExpiry = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

	return daysUntilExpiry <= 15;
};

export const BenefitPeriodValidator = TypeCompiler.Compile(BenefitPeriodSchema);

export type BenefitPeriod = Static<typeof BenefitPeriodSchema>;
export type BenefitPeriodType = Static<typeof BenefitPeriodTypeSchema>;
export type BenefitPeriodStatus = Static<typeof BenefitPeriodStatusSchema>;
