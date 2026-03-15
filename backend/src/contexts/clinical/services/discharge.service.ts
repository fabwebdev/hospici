/**
 * DischargeService — Patient Discharge Workflow
 *
 * Handles 4 CMS-regulated discharge types:
 *   1. expected_death  — records death details in FHIR JSONB, computes HOPE-D window
 *   2. revocation      — creates NOTR with 5-business-day deadline (42 CFR §418.28)
 *   3. transfer        — creates NOTR linked to receiving agency NPI
 *   4. live_discharge  — flags CAP patient contribution row
 *
 * CMS rules enforced:
 *   - Discharge date cannot be a future date
 *   - Revocation reason must be ≥ 20 characters
 *   - Transfer requires a receiving agency NPI
 *   - NOTR deadline = revocationDate + 5 business days
 *   - HOPE-D window = dischargeDate + 7 calendar days
 *
 * PHI: death details merged into patient FHIR data JSONB with encrypt/decrypt cycle.
 * RLS: all DB writes run inside db.transaction() with applyRlsContext().
 * Audit: every discharge emits an audit log entry (PHI contact).
 */

import { AlertService } from "@/contexts/compliance/services/alert.service.js";
import { logAudit } from "@/contexts/identity/services/audit.service.js";
import { db } from "@/db/client.js";
import { benefitPeriods } from "@/db/schema/benefit-periods.table.js";
import { capPatientContributions } from "@/db/schema/cap-patient-contributions.table.js";
import { noticesOfElection } from "@/db/schema/noe.table.js";
import { noticesOfTerminationRevocation } from "@/db/schema/notr.table.js";
import { patients } from "@/db/schema/patients.table.js";
import {
  decryptPhi,
  encryptPhi,
} from "@/shared-kernel/services/phi-encryption.service.js";
import { addBusinessDays } from "@/utils/business-days.js";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { FastifyBaseLogger, FastifyRequest } from "fastify";
import type { DischargeBody, DischargeResponse } from "../schemas/discharge.schema.js";

type UserCtx = NonNullable<FastifyRequest["user"]>;
type AuditDbCtx = { insert: (typeof db)["insert"] };

// ── Helpers ────────────────────────────────────────────────────────────────────

function addCalendarDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function applyRlsContext(
  tx: { execute: (typeof db)["execute"] },
  user: UserCtx,
): Promise<void> {
  await tx.execute(sql`SELECT set_config('app.current_user_id', ${user.id}, true)`);
  await tx.execute(
    sql`SELECT set_config('app.current_location_id', ${user.locationId}, true)`,
  );
  await tx.execute(sql`SELECT set_config('app.current_role', ${user.role}, true)`);
}

function throwCoded(message: string, code: string): never {
  const err = new Error(message);
  (err as Error & { code: string }).code = code;
  throw err;
}

// ── DischargeService ───────────────────────────────────────────────────────────

export class DischargeService {
  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly alertService: AlertService,
  ) {}

  async discharge(
    patientId: string,
    body: DischargeBody,
    user: UserCtx,
  ): Promise<DischargeResponse> {
    // CMS rule: discharge date cannot be a future date
    const today = new Date().toISOString().slice(0, 10);
    if (body.dischargeDate > today) {
      throwCoded("Discharge date cannot be in the future", "DISCHARGE_DATE_FUTURE");
    }

    switch (body.dischargeType) {
      case "expected_death":
        return this.handleExpectedDeath(patientId, body, user);
      case "revocation":
        return this.handleRevocation(patientId, body, user);
      case "transfer":
        return this.handleTransfer(patientId, body, user);
      case "live_discharge":
        return this.handleLiveDischarge(patientId, body, user);
    }
  }

  // ── expected_death ──────────────────────────────────────────────────────────

  private async handleExpectedDeath(
    patientId: string,
    body: DischargeBody,
    user: UserCtx,
  ): Promise<DischargeResponse> {
    const hopeDWindowDeadline = addCalendarDays(body.dischargeDate, 7);

    await db.transaction(async (tx) => {
      await applyRlsContext(tx, user);

      // Fetch current patient row to merge death details into FHIR data JSONB
      const patientRows = await tx
        .select({ data: patients.data, locationId: patients.locationId })
        .from(patients)
        .where(eq(patients.id, patientId))
        .limit(1);

      const patientRow = patientRows[0];
      if (!patientRow) {
        throwCoded("Patient not found", "PATIENT_NOT_FOUND");
      }

      // Decrypt, parse, merge, re-encrypt the FHIR data JSONB
      const rawData = patientRow.data as Record<string, unknown>;
      const encryptedBlob =
        typeof rawData._encrypted === "string" ? rawData._encrypted : null;

      let fhirData: Record<string, unknown>;
      if (encryptedBlob) {
        const decrypted = await decryptPhi(encryptedBlob);
        fhirData = JSON.parse(decrypted) as Record<string, unknown>;
      } else {
        fhirData = { ...rawData };
      }

      fhirData.deathDetails = {
        timeOfDeath: body.timeOfDeath ?? null,
        pronouncingPhysician: body.pronouncingPhysician ?? null,
        locationAtDeath: body.locationAtDeath ?? null,
        witnessName: body.witnessName ?? null,
        familyNotified: body.familyNotified ?? null,
        physicianNotificationAt: body.physicianNotificationAt ?? null,
        physicianDocumentation: body.physicianDocumentation ?? null,
        recordedAt: new Date().toISOString(),
        recordedBy: user.id,
      };

      const reEncrypted = await encryptPhi(JSON.stringify(fhirData));

      await tx
        .update(patients)
        .set({
          dischargeDate: body.dischargeDate,
          data: { _encrypted: reEncrypted },
          updatedAt: new Date(),
        })
        .where(eq(patients.id, patientId));

      await logAudit(
        "update",
        user.id,
        patientId,
        {
          userRole: user.role,
          locationId: user.locationId,
          resourceType: "patient_discharge",
          resourceId: patientId,
          details: {
            dischargeType: "expected_death",
            dischargeDate: body.dischargeDate,
            hopeDWindowDeadline,
          },
        },
        tx as unknown as AuditDbCtx,
      );
    });

    // Upsert HOPE_WINDOW_CLOSING alert
    const daysRemaining = Math.ceil(
      (new Date(`${hopeDWindowDeadline}T00:00:00Z`).getTime() - Date.now()) /
        (1000 * 60 * 60 * 24),
    );

    await this.alertService
      .upsertAlert({
        type: "HOPE_WINDOW_CLOSING",
        severity: daysRemaining <= 2 ? "critical" : "warning",
        patientId,
        patientName: `Patient:${patientId}`,
        locationId: user.locationId,
        dueDate: hopeDWindowDeadline,
        daysRemaining: Math.max(0, daysRemaining),
        description: `HOPE-D assessment window closes on ${hopeDWindowDeadline}`,
        rootCause: `Patient discharged (expected death) on ${body.dischargeDate}. HOPE-D must be submitted within 7 calendar days.`,
        nextAction: "Complete and submit HOPE-D assessment before window closes",
      })
      .catch((err: unknown) => {
        this.log.error(
          { err, patientId },
          "DischargeService: upsertAlert HOPE_WINDOW_CLOSING failed",
        );
      });

    return {
      patientId,
      dischargeType: "expected_death",
      dischargeDate: body.dischargeDate,
      hopeDWindowDeadline,
    };
  }

  // ── revocation ──────────────────────────────────────────────────────────────

  private async handleRevocation(
    patientId: string,
    body: DischargeBody,
    user: UserCtx,
  ): Promise<DischargeResponse> {
    if (!body.revocationReason || body.revocationReason.length < 20) {
      throwCoded(
        "Revocation reason must be at least 20 characters",
        "REVOCATION_REASON_TOO_SHORT",
      );
    }

    const revocationDate = body.dischargeDate;
    const notrDeadlineDate = addBusinessDays(
      new Date(`${revocationDate}T00:00:00Z`),
      5,
    )
      .toISOString()
      .slice(0, 10);

    let notrId: string | undefined;

    await db.transaction(async (tx) => {
      await applyRlsContext(tx, user);

      // Patch patient discharge date
      const patientRows = await tx
        .select({ locationId: patients.locationId })
        .from(patients)
        .where(eq(patients.id, patientId))
        .limit(1);

      if (!patientRows[0]) {
        throwCoded("Patient not found", "PATIENT_NOT_FOUND");
      }

      await tx
        .update(patients)
        .set({ dischargeDate: body.dischargeDate, updatedAt: new Date() })
        .where(eq(patients.id, patientId));

      // Look up active NOE
      const activeNoeRows = await tx
        .select({ id: noticesOfElection.id })
        .from(noticesOfElection)
        .where(
          and(
            eq(noticesOfElection.patientId, patientId),
            inArray(noticesOfElection.status, ["accepted", "submitted", "draft"]),
          ),
        )
        .limit(1);

      const activeNoe = activeNoeRows[0];
      if (!activeNoe) {
        throwCoded("No active NOE found for patient", "NOE_NOT_FOUND");
      }

      // Close the NOE
      await tx
        .update(noticesOfElection)
        .set({ status: "closed", updatedAt: new Date() })
        .where(eq(noticesOfElection.id, activeNoe.id));

      // Close the active benefit period
      await tx
        .update(benefitPeriods)
        .set({
          status: "revoked",
          revocationDate,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(benefitPeriods.patientId, patientId),
            inArray(benefitPeriods.status, ["current", "upcoming", "recert_due", "at_risk", "past_due"]),
          ),
        );

      // Freeze cap contribution calculation by recording the discharge date
      await tx
        .update(capPatientContributions)
        .set({ dischargeDate: revocationDate })
        .where(
          and(
            eq(capPatientContributions.patientId, patientId),
            eq(capPatientContributions.locationId, user.locationId),
          ),
        );

      // Create NOTR — revocationReason is guaranteed non-empty by the guard above
      const revocationReason = body.revocationReason as string;
      const notrRows = await tx
        .insert(noticesOfTerminationRevocation)
        .values({
          noeId: activeNoe.id,
          patientId,
          locationId: user.locationId,
          status: "draft",
          revocationDate,
          revocationReason,
          deadlineDate: notrDeadlineDate,
          isLate: false,
        })
        .returning({ id: noticesOfTerminationRevocation.id });

      notrId = notrRows[0]?.id;

      await logAudit(
        "create",
        user.id,
        patientId,
        {
          userRole: user.role,
          locationId: user.locationId,
          resourceType: "patient_discharge",
          resourceId: patientId,
          details: {
            dischargeType: "revocation",
            dischargeDate: body.dischargeDate,
            notrId,
            notrDeadline: notrDeadlineDate,
          },
        },
        tx as unknown as AuditDbCtx,
      );
    });

    // Upsert NOTR_DEADLINE alert
    const daysRemaining = Math.ceil(
      (new Date(`${notrDeadlineDate}T00:00:00Z`).getTime() - Date.now()) /
        (1000 * 60 * 60 * 24),
    );

    await this.alertService
      .upsertAlert({
        type: "NOTR_DEADLINE",
        severity: daysRemaining <= 1 ? "critical" : "warning",
        patientId,
        patientName: `Patient:${patientId}`,
        locationId: user.locationId,
        dueDate: notrDeadlineDate,
        daysRemaining: Math.max(0, daysRemaining),
        description: `NOTR must be filed by ${notrDeadlineDate}`,
        rootCause: `Patient revoked hospice election on ${revocationDate}. NOTR deadline is 5 business days from revocation.`,
        nextAction: "Submit NOTR to CMS before the deadline",
      })
      .catch((err: unknown) => {
        this.log.error(
          { err, patientId },
          "DischargeService: upsertAlert NOTR_DEADLINE failed (revocation)",
        );
      });

    return {
      patientId,
      dischargeType: "revocation",
      dischargeDate: body.dischargeDate,
      ...(notrId !== undefined ? { notrId } : {}),
      notrDeadline: notrDeadlineDate,
    };
  }

  // ── transfer ────────────────────────────────────────────────────────────────

  private async handleTransfer(
    patientId: string,
    body: DischargeBody,
    user: UserCtx,
  ): Promise<DischargeResponse> {
    if (!body.receivingAgencyNpi) {
      throwCoded(
        "Receiving agency NPI is required for transfer discharge",
        "RECEIVING_NPI_REQUIRED",
      );
    }

    const transferDate = body.transferDate ?? body.dischargeDate;
    const notrDeadlineDate = addBusinessDays(
      new Date(`${transferDate}T00:00:00Z`),
      5,
    )
      .toISOString()
      .slice(0, 10);

    let notrId: string | undefined;

    await db.transaction(async (tx) => {
      await applyRlsContext(tx, user);

      // Patch patient discharge date
      const patientRows = await tx
        .select({ locationId: patients.locationId })
        .from(patients)
        .where(eq(patients.id, patientId))
        .limit(1);

      if (!patientRows[0]) {
        throwCoded("Patient not found", "PATIENT_NOT_FOUND");
      }

      await tx
        .update(patients)
        .set({ dischargeDate: body.dischargeDate, updatedAt: new Date() })
        .where(eq(patients.id, patientId));

      // Look up active NOE
      const activeNoeRows = await tx
        .select({ id: noticesOfElection.id })
        .from(noticesOfElection)
        .where(
          and(
            eq(noticesOfElection.patientId, patientId),
            inArray(noticesOfElection.status, ["accepted", "submitted", "draft"]),
          ),
        )
        .limit(1);

      const activeNoe = activeNoeRows[0];
      if (!activeNoe) {
        throwCoded("No active NOE found for patient", "NOE_NOT_FOUND");
      }

      // Close the NOE
      await tx
        .update(noticesOfElection)
        .set({ status: "closed", updatedAt: new Date() })
        .where(eq(noticesOfElection.id, activeNoe.id));

      // Close the active benefit period (transferred_out)
      await tx
        .update(benefitPeriods)
        .set({
          status: "transferred_out",
          revocationDate: transferDate,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(benefitPeriods.patientId, patientId),
            inArray(benefitPeriods.status, ["current", "upcoming", "recert_due", "at_risk", "past_due"]),
          ),
        );

      // Freeze cap contribution calculation
      await tx
        .update(capPatientContributions)
        .set({ dischargeDate: transferDate })
        .where(
          and(
            eq(capPatientContributions.patientId, patientId),
            eq(capPatientContributions.locationId, user.locationId),
          ),
        );

      // Create NOTR with receiving hospice NPI
      const notrRows = await tx
        .insert(noticesOfTerminationRevocation)
        .values({
          noeId: activeNoe.id,
          patientId,
          locationId: user.locationId,
          status: "draft",
          revocationDate: transferDate,
          revocationReason: `Transfer to ${body.receivingHospiceName ?? body.receivingAgencyNpi}`,
          deadlineDate: notrDeadlineDate,
          isLate: false,
          receivingHospiceId: body.receivingAgencyNpi,
          receivingHospiceName: body.receivingHospiceName ?? null,
          transferDate: body.transferDate ?? null,
        })
        .returning({ id: noticesOfTerminationRevocation.id });

      notrId = notrRows[0]?.id;

      await logAudit(
        "create",
        user.id,
        patientId,
        {
          userRole: user.role,
          locationId: user.locationId,
          resourceType: "patient_discharge",
          resourceId: patientId,
          details: {
            dischargeType: "transfer",
            dischargeDate: body.dischargeDate,
            receivingAgencyNpi: body.receivingAgencyNpi,
            notrId,
            notrDeadline: notrDeadlineDate,
          },
        },
        tx as unknown as AuditDbCtx,
      );
    });

    // Upsert NOTR_DEADLINE alert
    const daysRemaining = Math.ceil(
      (new Date(`${notrDeadlineDate}T00:00:00Z`).getTime() - Date.now()) /
        (1000 * 60 * 60 * 24),
    );

    await this.alertService
      .upsertAlert({
        type: "NOTR_DEADLINE",
        severity: daysRemaining <= 1 ? "critical" : "warning",
        patientId,
        patientName: `Patient:${patientId}`,
        locationId: user.locationId,
        dueDate: notrDeadlineDate,
        daysRemaining: Math.max(0, daysRemaining),
        description: `NOTR must be filed by ${notrDeadlineDate}`,
        rootCause: `Patient transferred to ${body.receivingHospiceName ?? body.receivingAgencyNpi} on ${transferDate}. NOTR deadline is 5 business days from transfer.`,
        nextAction: "Submit NOTR to CMS before the deadline",
      })
      .catch((err: unknown) => {
        this.log.error(
          { err, patientId },
          "DischargeService: upsertAlert NOTR_DEADLINE failed (transfer)",
        );
      });

    return {
      patientId,
      dischargeType: "transfer",
      dischargeDate: body.dischargeDate,
      ...(notrId !== undefined ? { notrId } : {}),
      notrDeadline: notrDeadlineDate,
    };
  }

  // ── live_discharge ──────────────────────────────────────────────────────────

  private async handleLiveDischarge(
    patientId: string,
    body: DischargeBody,
    user: UserCtx,
  ): Promise<DischargeResponse> {
    await db.transaction(async (tx) => {
      await applyRlsContext(tx, user);

      // Verify patient exists
      const patientRows = await tx
        .select({ locationId: patients.locationId })
        .from(patients)
        .where(eq(patients.id, patientId))
        .limit(1);

      if (!patientRows[0]) {
        throwCoded("Patient not found", "PATIENT_NOT_FOUND");
      }

      // Patch patient discharge date
      await tx
        .update(patients)
        .set({ dischargeDate: body.dischargeDate, updatedAt: new Date() })
        .where(eq(patients.id, patientId));

      // Flag live discharge in CAP patient contributions
      await tx
        .update(capPatientContributions)
        .set({ liveDischargeFlag: true })
        .where(eq(capPatientContributions.patientId, patientId));

      await logAudit(
        "update",
        user.id,
        patientId,
        {
          userRole: user.role,
          locationId: user.locationId,
          resourceType: "patient_discharge",
          resourceId: patientId,
          details: {
            dischargeType: "live_discharge",
            dischargeDate: body.dischargeDate,
            liveDischargeReason: body.liveDischargeReason ?? null,
          },
        },
        tx as unknown as AuditDbCtx,
      );
    });

    return {
      patientId,
      dischargeType: "live_discharge",
      dischargeDate: body.dischargeDate,
    };
  }
}
