// contexts/clinical/schemas/patient.schema.ts
// Patient demographics and FHIR R4 Patient resource

import { Type, type Static } from "@sinclair/typebox";
import { TypeCompiler } from "@sinclair/typebox/compiler";

export const HumanNameSchema = Type.Object({
	use: Type.Optional(
		Type.Enum({
			usual: "usual",
			official: "official",
			temp: "temp",
			nickname: "nickname",
			old: "old",
			maiden: "maiden",
		}),
	),
	family: Type.String(),
	given: Type.Array(Type.String()),
});

export const AddressSchema = Type.Object({
	use: Type.Optional(
		Type.Enum({ home: "home", work: "work", temp: "temp", old: "old", billing: "billing" }),
	),
	line: Type.Array(Type.String()),
	city: Type.String(),
	state: Type.String(),
	postalCode: Type.String(),
	country: Type.String({ default: "US" }),
});

export const IdentifierSchema = Type.Object({
	system: Type.String(),
	value: Type.String(),
});

export const PatientSchema = Type.Object(
	{
		id: Type.String({ format: "uuid" }),
		resourceType: Type.Literal("Patient"),
		identifier: Type.Array(IdentifierSchema),
		name: Type.Array(HumanNameSchema),
		gender: Type.Optional(
			Type.Enum({
				male: "male",
				female: "female",
				other: "other",
				unknown: "unknown",
			}),
		),
		birthDate: Type.String({ format: "date" }),
		address: Type.Optional(Type.Array(AddressSchema)),
		hospiceLocationId: Type.String({ format: "uuid" }),
		admissionDate: Type.Optional(Type.String({ format: "date" })),
		dischargeDate: Type.Optional(Type.String({ format: "date" })),
		// Extension point for R6 migration
		_gender: Type.Optional(Type.Object({ id: Type.Optional(Type.String()) })),
	},
	{
		additionalProperties: false,
		description: "Hospici Patient Resource (FHIR R4 compatible)",
	},
);

export const PatientValidator = TypeCompiler.Compile(PatientSchema);

export type Patient = Static<typeof PatientSchema>;
export type HumanName = Static<typeof HumanNameSchema>;
export type Address = Static<typeof AddressSchema>;
export type Identifier = Static<typeof IdentifierSchema>;
