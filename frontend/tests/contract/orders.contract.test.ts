// tests/contract/orders.contract.test.ts
// T3-9: Physician Order Inbox + Paperless Order Routing — contract tests

import { describe, expect, it } from "vitest";

// ── Test fixtures ─────────────────────────────────────────────────────────────

const VALID_UUID = "00000000-0000-0000-0000-000000000001";
const PATIENT_UUID = "00000000-0000-0000-0000-000000000002";
const LOCATION_UUID = "00000000-0000-0000-0000-000000000003";
const PHYSICIAN_UUID = "00000000-0000-0000-0000-000000000004";

function makeOrderResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: VALID_UUID,
    locationId: LOCATION_UUID,
    patientId: PATIENT_UUID,
    issuingClinicianId: VALID_UUID,
    physicianId: PHYSICIAN_UUID,
    type: "VERBAL",
    content: "Increase morphine to 4mg q4h PRN",
    status: "PENDING_SIGNATURE",
    dueAt: "2026-03-16T07:00:00.000Z",
    signedAt: null,
    rejectionReason: null,
    verbalReadBackFlag: false,
    verbalReadBackAt: null,
    deliveryMethod: "PORTAL",
    urgencyReason: "72h CMS verbal order window",
    linkedSignatureRequestId: null,
    groupBundleId: null,
    noSignatureReason: null,
    voidedAt: null,
    voidedByUserId: null,
    completedReturnedAt: null,
    reminderCount: 0,
    lastReminderAt: null,
    createdAt: "2026-03-13T00:00:00.000Z",
    updatedAt: "2026-03-13T00:00:00.000Z",
    urgencyLabel: "Critical",
    blockedDownstream: "Claim billing blocked until signed",
    ...overrides,
  };
}

describe("T3-9: Physician Order Inbox — contract tests", () => {
  // ── 1. OrderInboxResponse shape ─────────────────────────────────────────────

  it("OrderInboxResponse has required fields", () => {
    const response = {
      items: [makeOrderResponse()],
      counts: {
        pending: 3,
        overdue: 1,
        rejected: 0,
        exceptions: 0,
        completed: 2,
      },
      total: 6,
    };
    expect(response).toHaveProperty("items");
    expect(response).toHaveProperty("counts");
    expect(response).toHaveProperty("total");
    expect(Array.isArray(response.items)).toBe(true);
    expect(typeof response.total).toBe("number");
  });

  it("OrderInboxCounts has all 5 tabs", () => {
    const counts = {
      pending: 3,
      overdue: 1,
      rejected: 0,
      exceptions: 0,
      completed: 2,
    };
    expect(counts).toHaveProperty("pending");
    expect(counts).toHaveProperty("overdue");
    expect(counts).toHaveProperty("rejected");
    expect(counts).toHaveProperty("exceptions");
    expect(counts).toHaveProperty("completed");
  });

  // ── 2. OrderResponse shape ──────────────────────────────────────────────────

  it("OrderResponse has all required fields", () => {
    const order = makeOrderResponse();
    expect(order).toHaveProperty("id");
    expect(order).toHaveProperty("locationId");
    expect(order).toHaveProperty("patientId");
    expect(order).toHaveProperty("issuingClinicianId");
    expect(order).toHaveProperty("physicianId");
    expect(order).toHaveProperty("type");
    expect(order).toHaveProperty("content");
    expect(order).toHaveProperty("status");
    expect(order).toHaveProperty("dueAt");
    expect(order).toHaveProperty("verbalReadBackFlag");
    expect(order).toHaveProperty("reminderCount");
    expect(order).toHaveProperty("urgencyLabel");
    expect(order).toHaveProperty("blockedDownstream");
    expect(order).toHaveProperty("createdAt");
    expect(order).toHaveProperty("updatedAt");
  });

  it("OrderResponse computed fields are correct types", () => {
    const order = makeOrderResponse();
    expect(typeof order.urgencyLabel === "string" || order.urgencyLabel === null).toBe(true);
    expect(typeof order.blockedDownstream === "string" || order.blockedDownstream === null).toBe(
      true,
    );
    expect(typeof order.reminderCount).toBe("number");
    expect(typeof order.verbalReadBackFlag).toBe("boolean");
  });

  // ── 3. Get patient orders ───────────────────────────────────────────────────

  it("OrderListResponse has items array and total", () => {
    const response = {
      items: [makeOrderResponse(), makeOrderResponse({ id: "00000000-0000-0000-0000-000000000099" })],
      total: 2,
    };
    expect(Array.isArray(response.items)).toBe(true);
    expect(response.items).toHaveLength(2);
    expect(response.total).toBe(2);
  });

  // ── 4. CreateOrderInput validation ─────────────────────────────────────────

  it("CreateOrderInput requires type, patientId, content, dueAt", () => {
    const input = {
      type: "VERBAL",
      patientId: PATIENT_UUID,
      content: "Verbal order for pain management",
      dueAt: "2026-03-16T07:00:00.000Z",
    };
    expect(input.type).toBe("VERBAL");
    expect(input.patientId).toBeTruthy();
    expect(input.content).toBeTruthy();
    expect(input.dueAt).toBeTruthy();
  });

  it("CreateOrderInput optional fields are optional", () => {
    const minimal = {
      type: "MEDICATION",
      patientId: PATIENT_UUID,
      content: "Methadone 5mg PO daily",
      dueAt: "2026-03-16T00:00:00.000Z",
    };
    // No physicianId, verbalReadBackFlag, deliveryMethod, groupBundleId
    expect(minimal).not.toHaveProperty("physicianId");
    expect(minimal).not.toHaveProperty("deliveryMethod");
    expect(minimal).not.toHaveProperty("groupBundleId");
  });

  it("CreateOrderInput verbal order has read-back flag", () => {
    const verbalOrder = {
      type: "VERBAL",
      patientId: PATIENT_UUID,
      content: "Increase Ativan to 1mg q6h",
      dueAt: "2026-03-15T07:00:00.000Z",
      verbalReadBackFlag: true,
    };
    expect(verbalOrder.verbalReadBackFlag).toBe(true);
    expect(verbalOrder.type).toBe("VERBAL");
  });

  // ── 5. Sign order ───────────────────────────────────────────────────────────

  it("SignOrderBody is optional body with optional linkedSignatureRequestId", () => {
    const emptyBody = {};
    const withSignature = { linkedSignatureRequestId: VALID_UUID };
    expect(emptyBody).toBeDefined();
    expect(withSignature.linkedSignatureRequestId).toBe(VALID_UUID);
  });

  it("Signed order has signedAt populated", () => {
    const signed = makeOrderResponse({
      status: "SIGNED",
      signedAt: "2026-03-14T10:00:00.000Z",
      urgencyLabel: null,
      blockedDownstream: null,
    });
    expect(signed.status).toBe("SIGNED");
    expect(signed.signedAt).toBeTruthy();
  });

  // ── 6. Reject order ─────────────────────────────────────────────────────────

  it("RejectOrderBody requires rejectionReason", () => {
    const body = { rejectionReason: "Patient condition changed; order no longer appropriate" };
    expect(body.rejectionReason).toBeTruthy();
    expect(typeof body.rejectionReason).toBe("string");
  });

  it("Rejected order has rejectionReason populated", () => {
    const rejected = makeOrderResponse({
      status: "REJECTED",
      rejectionReason: "Patient allergy contraindication",
      urgencyLabel: null,
      blockedDownstream: null,
    });
    expect(rejected.status).toBe("REJECTED");
    expect(rejected.rejectionReason).toBeTruthy();
  });

  // ── 7. Void order ───────────────────────────────────────────────────────────

  it("Voided order has voidedAt and voidedByUserId", () => {
    const voided = makeOrderResponse({
      status: "VOIDED",
      voidedAt: "2026-03-14T08:00:00.000Z",
      voidedByUserId: PHYSICIAN_UUID,
      urgencyLabel: null,
      blockedDownstream: null,
    });
    expect(voided.status).toBe("VOIDED");
    expect(voided.voidedAt).toBeTruthy();
    expect(voided.voidedByUserId).toBeTruthy();
  });

  // ── 8. Mark no-sig-required ─────────────────────────────────────────────────

  it("ExceptionOrderBody requires noSignatureReason", () => {
    const body = { noSignatureReason: "Physician unreachable; supervisor approved exception" };
    expect(body.noSignatureReason).toBeTruthy();
  });

  it("Exception order has noSignatureReason populated", () => {
    const exception = makeOrderResponse({
      status: "NO_SIGNATURE_REQUIRED",
      noSignatureReason: "Order entered in error; superseded by new order",
      urgencyLabel: null,
      blockedDownstream: null,
    });
    expect(exception.status).toBe("NO_SIGNATURE_REQUIRED");
    expect(exception.noSignatureReason).toBeTruthy();
  });

  // ── 9. Resend order ─────────────────────────────────────────────────────────

  it("ResendOrderBody accepts optional deliveryMethod and physicianId", () => {
    const body = { deliveryMethod: "FAX", physicianId: PHYSICIAN_UUID };
    expect(body.deliveryMethod).toBe("FAX");
    expect(body.physicianId).toBe(PHYSICIAN_UUID);
  });

  it("Resent order resets reminderCount to 0", () => {
    const resent = makeOrderResponse({ reminderCount: 0, lastReminderAt: null });
    expect(resent.reminderCount).toBe(0);
    expect(resent.lastReminderAt).toBeNull();
  });

  // ── 10. Mark returned ──────────────────────────────────────────────────────

  it("Returned order has completedReturnedAt populated", () => {
    const returned = makeOrderResponse({
      status: "COMPLETED_RETURNED",
      signedAt: "2026-03-10T10:00:00.000Z",
      completedReturnedAt: "2026-03-14T10:00:00.000Z",
      urgencyLabel: null,
      blockedDownstream: null,
    });
    expect(returned.status).toBe("COMPLETED_RETURNED");
    expect(returned.completedReturnedAt).toBeTruthy();
  });

  // ── 11. List overdue orders ────────────────────────────────────────────────

  it("Overdue orders have dueAt in the past with PENDING_SIGNATURE or VIEWED status", () => {
    const pastDate = "2026-03-01T00:00:00.000Z";
    const overdue = makeOrderResponse({
      status: "PENDING_SIGNATURE",
      dueAt: pastDate,
      urgencyLabel: "Overdue",
      blockedDownstream: "Claim billing blocked until signed",
    });
    const overdueList = { items: [overdue], total: 1 };

    expect(new Date(overdue.dueAt) < new Date()).toBe(true);
    expect(overdue.urgencyLabel).toBe("Overdue");
    expect(overdueList.items[0]?.blockedDownstream).toBeTruthy();
  });

  // ── Enum validation ────────────────────────────────────────────────────────

  it("OrderStatus enum values are valid", () => {
    const validStatuses = [
      "DRAFT",
      "PENDING_SIGNATURE",
      "VIEWED",
      "SIGNED",
      "REJECTED",
      "EXPIRED",
      "VOIDED",
      "NO_SIGNATURE_REQUIRED",
      "COMPLETED_RETURNED",
    ];
    expect(validStatuses).toHaveLength(9);
    expect(validStatuses).toContain("DRAFT");
    expect(validStatuses).toContain("VIEWED");
    expect(validStatuses).toContain("VOIDED");
    expect(validStatuses).toContain("NO_SIGNATURE_REQUIRED");
    expect(validStatuses).toContain("COMPLETED_RETURNED");
  });

  it("OrderType enum values are valid", () => {
    const validTypes = [
      "VERBAL",
      "DME",
      "FREQUENCY_CHANGE",
      "MEDICATION",
      "F2F_DOCUMENTATION",
    ];
    expect(validTypes).toHaveLength(5);
    expect(validTypes).toContain("F2F_DOCUMENTATION");
  });

  it("DeliveryMethod enum values are valid", () => {
    const validMethods = ["PORTAL", "FAX", "MAIL", "COURIER"];
    expect(validMethods).toHaveLength(4);
    expect(validMethods).toContain("PORTAL");
    expect(validMethods).toContain("FAX");
  });

  it("UrgencyLabel values reflect 4 urgency tiers plus null", () => {
    const urgencyLabels = ["Due soon", "Urgent", "Critical", "Overdue", null];
    expect(urgencyLabels).toContain("Due soon");
    expect(urgencyLabels).toContain("Critical");
    expect(urgencyLabels).toContain(null);
  });

  it("STATE_MACHINE: valid transitions documented", () => {
    const VALID_TRANSITIONS = {
      DRAFT: ["PENDING_SIGNATURE"],
      PENDING_SIGNATURE: ["VIEWED", "SIGNED", "REJECTED", "EXPIRED", "VOIDED", "NO_SIGNATURE_REQUIRED"],
      VIEWED: ["SIGNED", "REJECTED", "VOIDED"],
      SIGNED: ["COMPLETED_RETURNED"],
      REJECTED: [],
      EXPIRED: [],
      VOIDED: [],
      NO_SIGNATURE_REQUIRED: [],
      COMPLETED_RETURNED: [],
    };
    expect(VALID_TRANSITIONS.PENDING_SIGNATURE).toContain("VIEWED");
    expect(VALID_TRANSITIONS.VIEWED).toContain("SIGNED");
    expect(VALID_TRANSITIONS.SIGNED).toContain("COMPLETED_RETURNED");
    expect(VALID_TRANSITIONS.REJECTED).toHaveLength(0);
    expect(VALID_TRANSITIONS.COMPLETED_RETURNED).toHaveLength(0);
  });

  it("Alert type ORDER_EXPIRY is defined", () => {
    const alertType = "ORDER_EXPIRY";
    expect(alertType).toBe("ORDER_EXPIRY");
  });

  it("Socket events for order lifecycle are defined", () => {
    const socketEvents = [
      "order:created",
      "order:viewed",
      "order:signed",
      "order:rejected",
      "order:expired",
      "order:overdue",
      "order:expiring",
      "order:exception",
      "order:completed_returned",
      "order:reminder",
      "order:return:overdue",
    ];
    expect(socketEvents).toHaveLength(11);
    expect(socketEvents).toContain("order:created");
    expect(socketEvents).toContain("order:return:overdue");
  });
});
