// contexts/orders/schemas/order.schema.ts
// T3-9: Physician Order Inbox + Paperless Order Routing — TypeBox schemas (backend)
// Schemas exported here are imported by typebox-compiler.ts for AOT compilation.
// Do NOT call TypeCompiler.Compile() here — only in typebox-compiler.ts.

import { type Static, Type } from "@sinclair/typebox";

// ── Enum schemas ──────────────────────────────────────────────────────────────

export const OrderStatusSchema = Type.Union([
  Type.Literal("DRAFT"),
  Type.Literal("PENDING_SIGNATURE"),
  Type.Literal("VIEWED"),
  Type.Literal("SIGNED"),
  Type.Literal("REJECTED"),
  Type.Literal("EXPIRED"),
  Type.Literal("VOIDED"),
  Type.Literal("NO_SIGNATURE_REQUIRED"),
  Type.Literal("COMPLETED_RETURNED"),
]);

export const OrderTypeSchema = Type.Union([
  Type.Literal("VERBAL"),
  Type.Literal("DME"),
  Type.Literal("FREQUENCY_CHANGE"),
  Type.Literal("MEDICATION"),
  Type.Literal("F2F_DOCUMENTATION"),
]);

export const DeliveryMethodSchema = Type.Union([
  Type.Literal("PORTAL"),
  Type.Literal("FAX"),
  Type.Literal("MAIL"),
  Type.Literal("COURIER"),
]);

// ── Request body schemas ──────────────────────────────────────────────────────

export const CreateOrderBodySchema = Type.Object({
  type: OrderTypeSchema,
  patientId: Type.String({ format: "uuid" }),
  physicianId: Type.Optional(Type.String({ format: "uuid" })),
  content: Type.String({ minLength: 1 }),
  dueAt: Type.String({ format: "date-time" }),
  verbalReadBackFlag: Type.Optional(Type.Boolean()),
  deliveryMethod: Type.Optional(DeliveryMethodSchema),
  groupBundleId: Type.Optional(Type.String({ format: "uuid" })),
});

export const SignOrderBodySchema = Type.Object({
  linkedSignatureRequestId: Type.Optional(Type.String({ format: "uuid" })),
});

export const RejectOrderBodySchema = Type.Object({
  rejectionReason: Type.String({ minLength: 1 }),
});

export const ExceptionOrderBodySchema = Type.Object({
  noSignatureReason: Type.String({ minLength: 1 }),
});

export const ResendOrderBodySchema = Type.Object({
  deliveryMethod: Type.Optional(DeliveryMethodSchema),
  physicianId: Type.Optional(Type.String({ format: "uuid" })),
});

// ── Response schemas ──────────────────────────────────────────────────────────

export const OrderResponseSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  locationId: Type.String({ format: "uuid" }),
  patientId: Type.String({ format: "uuid" }),
  issuingClinicianId: Type.String({ format: "uuid" }),
  physicianId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
  type: OrderTypeSchema,
  content: Type.String(),
  status: OrderStatusSchema,
  dueAt: Type.String(),
  signedAt: Type.Union([Type.String(), Type.Null()]),
  rejectionReason: Type.Union([Type.String(), Type.Null()]),
  verbalReadBackFlag: Type.Boolean(),
  verbalReadBackAt: Type.Union([Type.String(), Type.Null()]),
  deliveryMethod: Type.Union([DeliveryMethodSchema, Type.Null()]),
  urgencyReason: Type.Union([Type.String(), Type.Null()]),
  linkedSignatureRequestId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
  groupBundleId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
  noSignatureReason: Type.Union([Type.String(), Type.Null()]),
  voidedAt: Type.Union([Type.String(), Type.Null()]),
  voidedByUserId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
  completedReturnedAt: Type.Union([Type.String(), Type.Null()]),
  reminderCount: Type.Integer({ minimum: 0 }),
  lastReminderAt: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String(),
  updatedAt: Type.String(),
  urgencyLabel: Type.Union([
    Type.Literal("Due soon"),
    Type.Literal("Urgent"),
    Type.Literal("Critical"),
    Type.Literal("Overdue"),
    Type.Null(),
  ]),
  blockedDownstream: Type.Union([Type.String(), Type.Null()]),
});

export const OrderInboxCountsSchema = Type.Object({
  pending: Type.Integer({ minimum: 0 }),
  overdue: Type.Integer({ minimum: 0 }),
  rejected: Type.Integer({ minimum: 0 }),
  exceptions: Type.Integer({ minimum: 0 }),
  completed: Type.Integer({ minimum: 0 }),
});

export const OrderInboxResponseSchema = Type.Object({
  items: Type.Array(OrderResponseSchema),
  counts: OrderInboxCountsSchema,
  total: Type.Integer({ minimum: 0 }),
});

export const OrderListResponseSchema = Type.Object({
  items: Type.Array(OrderResponseSchema),
  total: Type.Integer({ minimum: 0 }),
});

// ── Inferred TypeScript types ─────────────────────────────────────────────────

export type OrderStatus = Static<typeof OrderStatusSchema>;
export type OrderType = Static<typeof OrderTypeSchema>;
export type DeliveryMethod = Static<typeof DeliveryMethodSchema>;
export type CreateOrderBody = Static<typeof CreateOrderBodySchema>;
export type SignOrderBody = Static<typeof SignOrderBodySchema>;
export type RejectOrderBody = Static<typeof RejectOrderBodySchema>;
export type ExceptionOrderBody = Static<typeof ExceptionOrderBodySchema>;
export type ResendOrderBody = Static<typeof ResendOrderBodySchema>;
export type OrderResponse = Static<typeof OrderResponseSchema>;
export type OrderInboxResponse = Static<typeof OrderInboxResponseSchema>;
export type OrderListResponse = Static<typeof OrderListResponseSchema>;
