/**
 * HOPEService — HOPE Assessment and iQIES Submission Service
 *
 * Responsibilities:
 *   - Create and manage HOPE-A, HOPE-UV, HOPE-D assessments
 *   - Validate 7-day completion windows
 *   - Submit assessments to iQIES (CMS quality reporting system)
 *   - Calculate HQRP quality measures
 *   - Track HQRP reporting periods and deadlines
 *
 * iQIES submission is handled asynchronously via BullMQ (hope-submission queue).
 * Direct DB access follows RLS — location_id must be set in session context.
 */

import type { FastifyBaseLogger } from "fastify";
import type { HOPEAdmission, HOPEUpdateVisit, HOPEDischargeAssessment } from "@/contexts/analytics/schemas/hope.schema";
import {
	validateHOPEAdmissionWindow,
	validateHOPEDischargeWindow,
	daysUntilHQRPDeadline,
} from "@/contexts/analytics/schemas";

// ---------------------------------------------------------------------------
// Validation errors
// ---------------------------------------------------------------------------

export class HOPEWindowViolationError extends Error {
	constructor(
		public readonly assessmentType: "HOPE-A" | "HOPE-D",
		public readonly daysFromEvent: number,
		public readonly deadline: string,
	) {
		super(
			`${assessmentType} must be completed within 7 calendar days. ` +
				`Assessment is ${daysFromEvent} days after the triggering event (deadline: ${deadline}).`,
		);
		this.name = "HOPEWindowViolationError";
	}
}

export class HOPESubmissionError extends Error {
	constructor(
		public readonly iqiesErrors: Array<{ errorCode: string; errorMessage: string }>,
	) {
		super(`iQIES rejected HOPE submission with ${iqiesErrors.length} error(s).`);
		this.name = "HOPESubmissionError";
	}
}

// ---------------------------------------------------------------------------
// Service interface (implemented in Phase 3)
// ---------------------------------------------------------------------------

export interface HOPEServiceDeps {
	db: unknown; // Drizzle client — typed when tables exist
	valkey: unknown; // iovalkey — for BullMQ queue access
	log: FastifyBaseLogger;
}

export class HOPEService {
	constructor(private readonly deps: HOPEServiceDeps) {}

	// -------------------------------------------------------------------------
	// HOPE-A (Admission) — must complete within 7 calendar days of election
	// -------------------------------------------------------------------------

	/**
	 * Create a HOPE-A assessment.
	 * Validates that assessmentDate is within 7 days of electionDate.
	 * Emits a BullMQ job to queue the iQIES submission.
	 *
	 * TODO (Phase 3): Implement DB insert via Drizzle once hope_assessments table exists.
	 */
	async createAdmissionAssessment(
		input: Omit<HOPEAdmission, "id" | "createdAt" | "updatedAt" | "status" | "assessmentType">,
	): Promise<HOPEAdmission> {
		const windowCheck = validateHOPEAdmissionWindow(input.electionDate, input.assessmentDate);

		if (!windowCheck.valid) {
			throw new HOPEWindowViolationError(
				"HOPE-A",
				windowCheck.daysFromElection,
				windowCheck.deadline,
			);
		}

		// TODO (Phase 3): db.insert(hopeAssessments).values({ ...input, assessmentType: "01", status: "draft" })
		this.deps.log.info(
			{ patientId: input.patientId, daysFromElection: windowCheck.daysFromElection },
			"hope.service: HOPE-A created",
		);

		throw new Error("HOPEService.createAdmissionAssessment: not yet implemented (Phase 3)");
	}

	// -------------------------------------------------------------------------
	// HOPE-UV (Update Visit)
	// -------------------------------------------------------------------------

	/**
	 * Create a HOPE-UV assessment for a qualifying visit.
	 *
	 * TODO (Phase 3): Implement DB insert.
	 */
	async createUpdateVisitAssessment(
		input: Omit<HOPEUpdateVisit, "id" | "createdAt" | "updatedAt" | "status" | "assessmentType">,
	): Promise<HOPEUpdateVisit> {
		this.deps.log.info({ patientId: input.patientId }, "hope.service: HOPE-UV created");
		throw new Error("HOPEService.createUpdateVisitAssessment: not yet implemented (Phase 3)");
	}

	// -------------------------------------------------------------------------
	// HOPE-D (Discharge) — must complete within 7 calendar days of discharge
	// -------------------------------------------------------------------------

	/**
	 * Create a HOPE-D assessment.
	 * Validates that assessmentDate is within 7 days of dischargeDate.
	 *
	 * TODO (Phase 3): Implement DB insert.
	 */
	async createDischargeAssessment(
		input: Omit<HOPEDischargeAssessment, "id" | "createdAt" | "updatedAt" | "status" | "assessmentType">,
	): Promise<HOPEDischargeAssessment> {
		const windowCheck = validateHOPEDischargeWindow(input.dischargeDate, input.assessmentDate);

		if (!windowCheck.valid) {
			throw new HOPEWindowViolationError(
				"HOPE-D",
				windowCheck.daysFromDischarge,
				windowCheck.deadline,
			);
		}

		this.deps.log.info(
			{ patientId: input.patientId, daysFromDischarge: windowCheck.daysFromDischarge },
			"hope.service: HOPE-D created",
		);

		throw new Error("HOPEService.createDischargeAssessment: not yet implemented (Phase 3)");
	}

	// -------------------------------------------------------------------------
	// iQIES Submission
	// -------------------------------------------------------------------------

	/**
	 * Queue an assessment for iQIES submission via BullMQ.
	 * The hope-submission worker handles the actual HTTP call to iQIES gateway.
	 *
	 * TODO (Phase 3): Enqueue via BullMQ hope-submission queue.
	 */
	async queueForSubmission(assessmentId: string, assessmentType: "01" | "02" | "03"): Promise<void> {
		this.deps.log.info(
			{ assessmentId, assessmentType },
			"hope.service: queued for iQIES submission",
		);
		throw new Error("HOPEService.queueForSubmission: not yet implemented (Phase 3)");
	}

	// -------------------------------------------------------------------------
	// HQRP Reporting Period
	// -------------------------------------------------------------------------

	/**
	 * Get HQRP submission deadline status for the current quarter.
	 * Returns days until deadline and penalty risk flag.
	 */
	getDeadlineStatus(submissionDeadline: string): {
		daysRemaining: number;
		atRisk: boolean;
		penaltyImminent: boolean;
	} {
		const daysRemaining = daysUntilHQRPDeadline(submissionDeadline);
		return {
			daysRemaining,
			atRisk: daysRemaining <= 30,
			penaltyImminent: daysRemaining <= 7,
		};
	}

	// -------------------------------------------------------------------------
	// Quality Measure Calculation
	// -------------------------------------------------------------------------

	/**
	 * Calculate all HQRP measures for a reporting period.
	 * Reads from hope_assessments table and computes measure numerators/denominators.
	 *
	 * TODO (Phase 3): Implement with real DB queries.
	 */
	async calculateMeasuresForPeriod(
		locationId: string,
		periodStart: string,
		periodEnd: string,
	): Promise<{
		nqf3235Rate: number;
		nqf3633Rate: number;
		nqf3634PartARate: number;
		nqf3634PartBRate: number;
		hciCompositeScore: number;
	}> {
		this.deps.log.info(
			{ locationId, periodStart, periodEnd },
			"hope.service: calculating HQRP measures",
		);
		throw new Error("HOPEService.calculateMeasuresForPeriod: not yet implemented (Phase 3)");
	}
}
