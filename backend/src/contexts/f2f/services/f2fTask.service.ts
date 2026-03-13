/**
 * F2FTaskService — Physician task routing for F2F documentation.
 *
 * T3-2b: When a patient enters benefit period 3 (or later) and no valid F2F
 * exists, auto-creates an orders row of type F2F_DOCUMENTATION and links it
 * to the face_to_face_encounters draft row.
 *
 * Emits order:f2f:required Socket.IO event to physician session.
 */

import { logAudit } from "@/contexts/identity/services/audit.service.js";
import { db } from "@/db/client.js";
import { benefitPeriods } from "@/db/schema/benefit-periods.table.js";
import { faceToFaceEncounters } from "@/db/schema/face-to-face-encounters.table.js";
import { orders } from "@/db/schema/orders.table.js";
import { addBusinessDays } from "@/utils/business-days.js";
import { eq, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type Valkey from "iovalkey";

export class F2FTaskService {
  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly valkey: Valkey,
  ) {}

  /**
   * Create a physician task for F2F documentation when period >= 3 and no valid F2F exists.
   * Creates a draft face_to_face_encounters stub + orders row in a single transaction.
   *
   * @returns The created orders.id (physicianTaskId)
   */
  async createPhysicianTask(
    patientId: string,
    benefitPeriodId: string,
    issuingClinicianId: string,
    locationId: string,
    userId: string,
  ): Promise<string> {
    await db.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
    await db.execute(sql`SELECT set_config('app.current_location_id', ${locationId}, true)`);

    const [period] = await db
      .select()
      .from(benefitPeriods)
      .where(eq(benefitPeriods.id, benefitPeriodId));

    if (!period) throw new Error(`Benefit period ${benefitPeriodId} not found`);

    // dueAt = recertDate - 5 business days (gives physician 5 days before blocking window)
    // addBusinessDays takes a Date — use negative days to go backwards
    const recertDate = new Date(period.endDate);
    const dueAt = addBusinessDays(recertDate, -5);

    const physicianId = period.f2fProviderId ?? null;

    const result = await db.transaction(async (tx) => {
      // Create orders row
      const [order] = await tx
        .insert(orders)
        .values({
          locationId,
          patientId,
          issuingClinicianId,
          physicianId: physicianId ?? undefined,
          type: "F2F_DOCUMENTATION",
          content: `Face-to-face encounter documentation required for benefit period ${period.periodNumber} recertification (due ${period.endDate})`,
          status: "PENDING_SIGNATURE",
          dueAt,
        })
        .returning({ id: orders.id });

      if (!order) throw new Error("Failed to insert F2F order");

      // Create draft F2F stub linked to this task
      await tx.insert(faceToFaceEncounters).values({
        patientId,
        locationId,
        benefitPeriodId,
        f2fDate: period.endDate, // placeholder — clinician will update
        f2fProviderRole: "physician",
        encounterSetting: "office",
        clinicalFindings: "",
        isValidForRecert: false,
        physicianTaskId: order.id,
      });

      return order.id;
    });

    // Emit Socket.IO event to physician session (best-effort)
    if (physicianId) {
      try {
        await this.valkey.publish(
          "socket:emit:physician",
          JSON.stringify({
            event: "order:f2f:required",
            physicianId,
            data: {
              patientId,
              benefitPeriodId,
              periodNumber: period.periodNumber,
              recertDate: period.endDate,
              taskId: result,
            },
          }),
        );
      } catch (err) {
        this.log.warn({ err }, "Failed to emit order:f2f:required — physician may not be online");
      }
    }

    await logAudit("create", userId, patientId, {
      userRole: "clinician",
      locationId,
      resourceType: "orders",
      resourceId: result,
      details: { patientId, benefitPeriodId, physicianId },
    });

    this.log.info({ patientId, benefitPeriodId, orderId: result }, "F2F physician task created");

    return result;
  }

  /**
   * Mark the physician task as SIGNED (satisfied) when F2F is submitted.
   */
  async markTaskSigned(physicianTaskId: string, userId: string, locationId: string): Promise<void> {
    await db.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
    await db.execute(sql`SELECT set_config('app.current_location_id', ${locationId}, true)`);

    await db
      .update(orders)
      .set({ status: "SIGNED", signedAt: new Date(), updatedAt: new Date() })
      .where(eq(orders.id, physicianTaskId));
  }
}
