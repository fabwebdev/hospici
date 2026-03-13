// orders.ts
// T3-9: Physician Order Inbox + Paperless Order Routing
// Plain TypeScript types shared between backend and frontend.
// No TypeBox here — schemas live in backend/src/contexts/orders/schemas/

// ── Enum types ────────────────────────────────────────────────────────────────

export type OrderStatus =
  | "DRAFT"
  | "PENDING_SIGNATURE"
  | "VIEWED"
  | "SIGNED"
  | "REJECTED"
  | "EXPIRED"
  | "VOIDED"
  | "NO_SIGNATURE_REQUIRED"
  | "COMPLETED_RETURNED";

export type OrderType =
  | "VERBAL"
  | "DME"
  | "FREQUENCY_CHANGE"
  | "MEDICATION"
  | "F2F_DOCUMENTATION";

export type OrderDeliveryMethod = "PORTAL" | "FAX" | "MAIL" | "COURIER";

export type UrgencyLabel = "Due soon" | "Urgent" | "Critical" | "Overdue" | null;

// ── Response types ────────────────────────────────────────────────────────────

export interface OrderResponse {
  id: string;
  locationId: string;
  patientId: string;
  issuingClinicianId: string;
  physicianId: string | null;
  type: OrderType;
  content: string;
  status: OrderStatus;
  dueAt: string;
  signedAt: string | null;
  rejectionReason: string | null;
  verbalReadBackFlag: boolean;
  verbalReadBackAt: string | null;
  deliveryMethod: OrderDeliveryMethod | null;
  urgencyReason: string | null;
  linkedSignatureRequestId: string | null;
  groupBundleId: string | null;
  noSignatureReason: string | null;
  voidedAt: string | null;
  voidedByUserId: string | null;
  completedReturnedAt: string | null;
  reminderCount: number;
  lastReminderAt: string | null;
  createdAt: string;
  updatedAt: string;
  // computed server-side
  urgencyLabel: UrgencyLabel;
  blockedDownstream: string | null;
}

export interface OrderInboxCounts {
  pending: number;
  overdue: number;
  rejected: number;
  exceptions: number;
  completed: number;
}

export interface OrderInboxResponse {
  items: OrderResponse[];
  counts: OrderInboxCounts;
  total: number;
}

export interface OrderListResponse {
  items: OrderResponse[];
  total: number;
}

// ── Input types ───────────────────────────────────────────────────────────────

export interface CreateOrderInput {
  type: OrderType;
  patientId: string;
  physicianId?: string;
  content: string;
  dueAt: string;
  verbalReadBackFlag?: boolean;
  deliveryMethod?: OrderDeliveryMethod;
  groupBundleId?: string;
}

export interface SignOrderBody {
  linkedSignatureRequestId?: string;
}

export interface RejectOrderBody {
  rejectionReason: string;
}

export interface ExceptionOrderBody {
  noSignatureReason: string;
}

export interface ResendOrderBody {
  deliveryMethod?: OrderDeliveryMethod;
  physicianId?: string;
}
