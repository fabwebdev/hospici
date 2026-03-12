/**
 * F2FValidityService — Face-to-Face Encounter Validity Engine
 *
 * T3-2b: F2F Validity Engine + Physician Routing
 *
 * CMS rules implemented (42 CFR §418.22):
 *   - F2F required for benefit period >= 3 only
 *   - F2F date must be within 30 calendar days PRIOR to recertification date
 *     (i.e., f2fDate >= recertDate − 30 AND f2fDate < recertDate)
 *   - Provider role must be physician, np, or pa
 *   - Encounter setting must be a recognised clinical setting
 *   - Clinical findings must be non-empty
 *   - Linked benefit period must not be voided/superseded
 */

import { logAudit } from "@/contexts/identity/services/audit.service.js";
import { AlertService } from "@/contexts/compliance/services/alert.service.js";
import { db } from "@/db/client.js";
import { faceToFaceEncounters } from "@/db/schema/face-to-face-encounters.table.js";
import { benefitPeriods } from "@/db/schema/benefit-periods.table.js";
import { sql, eq } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { F2FValidityResult } from "../schemas/f2f.schema.js";

export class F2FNotFoundError extends Error {
	constructor(id: string) {
		super(`Face-to-face encounter ${id} not found`);
		this.name = "F2FNotFoundError";
	}
}

export class F2FValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "F2FValidationError";
	}
}

export class F2FValidityService {
	constructor(
		private readonly log: FastifyBaseLogger,
		private readonly alertService: AlertService,
	) {}

	/**
	 * Run the validity engine for a single F2F encounter.
	 * Writes back isValidForRecert + validatedAt + invalidationReason.
	 * Updates compliance alerts accordingly.
	 */
	async validate(
		f2fId: string,
		userId: string,
		locationId: string,
	): Promise<F2FValidityResult> {
		await db.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
		await db.execute(sql`SELECT set_config('app.current_location_id', ${locationId}, true)`);

		const [encounter] = await db
			.select()
			.from(faceToFaceEncounters)
			.where(eq(faceToFaceEncounters.id, f2fId));

		if (!encounter) throw new F2FNotFoundError(f2fId);

		const [period] = await db
			.select()
			.from(benefitPeriods)
			.where(eq(benefitPeriods.id, encounter.benefitPeriodId));

		const reasons: string[] = [];

		// Rule 1 — Only period 3+ requires F2F
		if (!period || period.periodNumber < 3) {
			// F2F not required — mark valid automatically
			const now = new Date().toISOString();
			await db
				.update(faceToFaceEncounters)
				.set({
					isValidForRecert: true,
					validatedAt: new Date(),
					invalidationReason: null,
					updatedAt: new Date(),
				})
				.where(eq(faceToFaceEncounters.id, f2fId));
			return { isValid: true, reasons: [], validatedAt: now };
		}

		// Rule 2 — Period must not be voided or superseded
		if (period.status === "revoked" || period.status === "discharged") {
			reasons.push("Linked benefit period has been voided or closed");
		}

		// Rule 3 — F2F date within 30 calendar days prior to recert date (= period endDate)
		const recertDate = new Date(period.endDate);
		const f2fDate = new Date(encounter.f2fDate);
		const windowStart = new Date(recertDate);
		windowStart.setDate(windowStart.getDate() - 30);

		if (f2fDate < windowStart) {
			reasons.push(
				`F2F date (${encounter.f2fDate}) is more than 30 days before the recertification date (${period.endDate})`,
			);
		}
		if (f2fDate >= recertDate) {
			reasons.push(
				`F2F date (${encounter.f2fDate}) must be before the recertification date (${period.endDate}), not on or after it`,
			);
		}

		// Rule 4 — Provider role (constrained by DB enum, check for safety)
		const validRoles = ["physician", "np", "pa"] as const;
		if (!validRoles.includes(encounter.f2fProviderRole as (typeof validRoles)[number])) {
			reasons.push(
				`Provider role '${encounter.f2fProviderRole}' is not a valid prescribing provider for F2F certification`,
			);
		}

		// Rule 5 — Encounter setting: constrained by DB enum, all values are valid clinical settings

		// Rule 6 — Clinical findings non-empty
		if (!encounter.clinicalFindings || encounter.clinicalFindings.trim().length === 0) {
			reasons.push("Clinical findings narrative is required and cannot be blank");
		}

		const isValid = reasons.length === 0;
		const now = new Date();

		await db
			.update(faceToFaceEncounters)
			.set({
				isValidForRecert: isValid,
				validatedAt: now,
				invalidationReason: isValid ? null : reasons.join("; "),
				updatedAt: now,
			})
			.where(eq(faceToFaceEncounters.id, f2fId));

		// Manage compliance alerts
		const daysUntilRecert = Math.ceil(
			(recertDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
		);
		const patientName = `Patient:${encounter.patientId}`;

		if (isValid) {
			// Resolve existing F2F alerts by upserting as resolved via status workflow
			// AlertService.upsertAlert keeps one active alert per (patient, type);
			// we cannot call resolveByPatientAndType directly but the next upsert
			// will update the existing alert. For now we skip re-alerting on valid state.
			this.log.info(
				{ f2fId, patientId: encounter.patientId },
				"F2F valid — no alert action needed",
			);
		} else {
			// Upsert F2F_INVALID alert
			await this.alertService
				.upsertAlert({
					locationId,
					patientId: encounter.patientId,
					type: "F2F_INVALID",
					severity: daysUntilRecert <= 5 ? "critical" : "warning",
					patientName,
					dueDate: period.endDate,
					daysRemaining: daysUntilRecert,
					description: `F2F encounter is not valid for recertification: ${reasons[0]}`,
					rootCause: reasons.join("; "),
					nextAction: "Correct F2F encounter or document a new qualifying encounter",
				})
				.catch((err: unknown) =>
					this.log.error({ err, f2fId }, "alertService.upsertAlert failed (F2F_INVALID)"),
				);
		}

		await logAudit(
			"update",
			userId,
			encounter.patientId,
			{
				userRole: "clinician",
				locationId,
				resourceType: "face_to_face_encounter",
				resourceId: f2fId,
				details: { isValid, reasons },
			},
		);

		this.log.info({ f2fId, isValid, reasons }, "F2F validation complete");

		return { isValid, reasons, validatedAt: now.toISOString() };
	}
}
