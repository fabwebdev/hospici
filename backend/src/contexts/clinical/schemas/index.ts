// contexts/clinical/schemas/index.ts

export {
	PatientSchema,
	HumanNameSchema,
	AddressSchema,
	IdentifierSchema,
	PatientValidator,
	type Patient,
	type HumanName,
	type Address,
	type Identifier,
} from "./patient.schema";

export {
	FlaccScaleSchema,
	FlaccScaleValidator,
	type FlaccScale,
} from "./flaccScale.schema";
