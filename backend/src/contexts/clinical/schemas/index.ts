// contexts/clinical/schemas/index.ts

export {
  PatientSchema,
  HumanNameSchema,
  AddressSchema,
  IdentifierSchema,
  PatientValidator,
  CareModelSchema,
  CreatePatientBodySchema,
  PatchPatientBodySchema,
  PatientListQuerySchema,
  PatientResponseSchema,
  PatientListResponseSchema,
  type Patient,
  type HumanName,
  type Address,
  type Identifier,
  type CareModel,
  type CreatePatientBody,
  type PatchPatientBody,
  type PatientResponse,
  type PatientListQuery,
} from "./patient.schema";

export {
  FlaccScaleSchema,
  FlaccScaleValidator,
  type FlaccScale,
} from "./flaccScale.schema";
