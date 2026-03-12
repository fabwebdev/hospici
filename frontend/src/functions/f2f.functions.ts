// functions/f2f.functions.ts
// F2F Validity Engine — createServerFn wrappers (T3-2b)

import { createServerFn } from "@tanstack/react-start";
import type {
	CreateF2FInput,
	F2FEncounterListResponse,
	F2FEncounterResponse,
	F2FQueueResponse,
	F2FValidityResult,
	PatchF2FInput,
} from "@hospici/shared-types";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3001";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${API_BASE}${path}`, {
		...init,
		headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
		credentials: "include",
	});
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`API error ${res.status}: ${body}`);
	}
	return res.json() as Promise<T>;
}

export const getPatientF2FFn = createServerFn({ method: "GET" })
	.validator((data: unknown) => data as { patientId: string })
	.handler(async ({ data }) =>
		apiFetch<F2FEncounterListResponse>(`/api/v1/patients/${data.patientId}/f2f`),
	);

export const createF2FFn = createServerFn({ method: "POST" })
	.validator((data: unknown) => data as { patientId: string; body: CreateF2FInput })
	.handler(async ({ data }) =>
		apiFetch<F2FEncounterResponse & { validity: F2FValidityResult }>(
			`/api/v1/patients/${data.patientId}/f2f`,
			{ method: "POST", body: JSON.stringify(data.body) },
		),
	);

export const patchF2FFn = createServerFn({ method: "POST" })
	.validator((data: unknown) => data as { id: string; body: PatchF2FInput })
	.handler(async ({ data }) =>
		apiFetch<F2FEncounterResponse & { validity: F2FValidityResult }>(
			`/api/v1/f2f/${data.id}`,
			{ method: "PATCH", body: JSON.stringify(data.body) },
		),
	);

export const validateF2FFn = createServerFn({ method: "POST" })
	.validator((data: unknown) => data as { id: string })
	.handler(async ({ data }) =>
		apiFetch<F2FValidityResult>(`/api/v1/f2f/${data.id}/validate`, { method: "POST" }),
	);

export const getF2FQueueFn = createServerFn({ method: "GET" })
	.validator((data: unknown) => data as Record<string, never>)
	.handler(async () => apiFetch<F2FQueueResponse>("/api/v1/f2f/queue"));
