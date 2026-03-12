// lib/query/keys.ts
// TanStack Query key factory

export const patientKeys = {
  all: () => ["patients"] as const,
  list: (q?: object) => [...patientKeys.all(), "list", q] as const,
  detail: (id: string) => [...patientKeys.all(), "detail", id] as const,
  pain: (id: string) => [...patientKeys.detail(id), "pain"] as const,
  symptoms: (id: string) => [...patientKeys.detail(id), "symptoms"] as const,
  carePlan: (id: string) => [...patientKeys.detail(id), "care-plan"] as const,
  assessments: (id: string) => [...patientKeys.detail(id), "assessments"] as const,
};

export const billingKeys = {
  all: () => ["billing"] as const,
  noe: () => [...billingKeys.all(), "noe"] as const,
  noeDetail: (id: string) => [...billingKeys.noe(), id] as const,
  benefitPeriods: (patientId: string) =>
    [...billingKeys.all(), "benefit-periods", patientId] as const,
  cap: () => [...billingKeys.all(), "cap"] as const,
};

export const schedulingKeys = {
  all: () => ["scheduling"] as const,
  idg: () => [...schedulingKeys.all(), "idg"] as const,
  idgForPatient: (patientId: string) => [...schedulingKeys.idg(), "patient", patientId] as const,
  visits: (patientId: string) => [...schedulingKeys.all(), "visits", patientId] as const,
  aideSupervision: (aideId: string) =>
    [...schedulingKeys.all(), "aide-supervision", aideId] as const,
};
