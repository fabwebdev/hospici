// shared-kernel/value-objects/money.schema.ts
// CMS-compliant monetary value object

import { Type, Static } from "@sinclair/typebox";

export const MoneySchema = Type.Object(
	{
		currency: Type.Literal("USD"),
		amount: Type.Number({ minimum: 0, multipleOf: 0.01 }),
	},
	{ description: "CMS-compliant monetary value" },
);

export const DateRangeSchema = Type.Object(
	{
		start: Type.String({ format: "date" }),
		end: Type.Optional(Type.String({ format: "date" })),
	},
	{ description: "Inclusive benefit period date range" },
);

export type Money = Static<typeof MoneySchema>;
export type DateRange = Static<typeof DateRangeSchema>;
