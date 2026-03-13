import { relations } from "drizzle-orm";
import {
  boolean,
  inet,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { locations } from "./locations.table.js";
import { patients } from "./patients.table.js";
import { users } from "./users.table.js";

export const signatureDocumentTypeEnum = pgEnum("signature_document_type", [
  "encounter",
  "order",
  "recertification",
  "f2f",
  "idg_record",
  "consent",
  "care_plan",
]);

export const signatureRequestStatusEnum = pgEnum("signature_request_status", [
  "DRAFT",
  "READY_FOR_SIGNATURE",
  "SENT_FOR_SIGNATURE",
  "VIEWED",
  "PARTIALLY_SIGNED",
  "SIGNED",
  "REJECTED",
  "VOIDED",
  "NO_SIGNATURE_REQUIRED",
  "EXPIRED",
]);

export const signerTypeEnum = pgEnum("signer_type", [
  "CLINICIAN",
  "PHYSICIAN",
  "PATIENT",
  "REPRESENTATIVE",
  "AGENCY_REP",
]);

export const signatureExceptionTypeEnum = pgEnum("signature_exception_type", [
  "NO_SIGNATURE_REQUIRED",
  "PATIENT_UNABLE_TO_SIGN",
  "PHYSICIAN_UNAVAILABLE",
]);

export const signatureRequests = pgTable("signature_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  locationId: uuid("location_id")
    .references(() => locations.id)
    .notNull(),
  patientId: uuid("patient_id")
    .references(() => patients.id)
    .notNull(),

  // Document being signed
  documentType: signatureDocumentTypeEnum("document_type").notNull(),
  documentId: uuid("document_id").notNull(),

  // Status machine
  status: signatureRequestStatusEnum("status").notNull().default("DRAFT"),

  // Signature policy configuration
  requireCountersign: boolean("require_countersign").notNull().default(false),
  requirePatientSignature: boolean("require_patient_signature").notNull().default(false),
  requireSignatureTime: boolean("require_signature_time").notNull().default(false),
  allowGrouping: boolean("allow_grouping").notNull().default(false),

  // Routing/delivery preferences
  deliveryMethod: varchar("delivery_method", { length: 20 }).default("portal"),

  // Timestamps
  documentedSignedAt: timestamp("documented_signed_at", { withTimezone: true }),
  sentForSignatureAt: timestamp("sent_for_signature_at", { withTimezone: true }),
  viewedAt: timestamp("viewed_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),

  // Content hash for tamper evidence
  contentHash: varchar("content_hash", { length: 64 }).notNull(),
  priorRevisionHash: varchar("prior_revision_hash", { length: 64 }),

  // Exception handling
  exceptionType: signatureExceptionTypeEnum("exception_type"),
  exceptionReason: text("exception_reason"),
  exceptionApprovedBy: uuid("exception_approved_by").references(() => users.id),
  exceptionApprovedAt: timestamp("exception_approved_at", { withTimezone: true }),

  // Rejection tracking
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  rejectedBy: uuid("rejected_by").references(() => users.id),
  rejectionReason: text("rejection_reason"),

  // Void tracking
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  voidedBy: uuid("voided_by").references(() => users.id),
  voidReason: text("void_reason"),

  // Request metadata
  requestedBy: uuid("requested_by")
    .references(() => users.id)
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const signatureRequestsRelations = relations(signatureRequests, ({ one, many }) => ({
  location: one(locations, {
    fields: [signatureRequests.locationId],
    references: [locations.id],
  }),
  patient: one(patients, {
    fields: [signatureRequests.patientId],
    references: [patients.id],
  }),
  requestedByUser: one(users, {
    fields: [signatureRequests.requestedBy],
    references: [users.id],
    relationName: "requestedBy",
  }),
  exceptionApprovedByUser: one(users, {
    fields: [signatureRequests.exceptionApprovedBy],
    references: [users.id],
    relationName: "exceptionApprovedBy",
  }),
  rejectedByUser: one(users, {
    fields: [signatureRequests.rejectedBy],
    references: [users.id],
    relationName: "rejectedBy",
  }),
  voidedByUser: one(users, {
    fields: [signatureRequests.voidedBy],
    references: [users.id],
    relationName: "voidedBy",
  }),
  signatures: many(electronicSignatures),
  events: many(signatureEvents),
}));

export const electronicSignatures = pgTable("electronic_signatures", {
  id: uuid("id").primaryKey().defaultRandom(),
  signatureRequestId: uuid("signature_request_id")
    .references(() => signatureRequests.id, { onDelete: "cascade" })
    .notNull(),
  locationId: uuid("location_id")
    .references(() => locations.id)
    .notNull(),

  // Signer info
  signerType: signerTypeEnum("signer_type").notNull(),
  signerUserId: uuid("signer_user_id").references(() => users.id),
  signerName: text("signer_name").notNull(),
  signerLegalName: text("signer_legal_name"),
  signerNpi: varchar("signer_npi", { length: 10 }),

  // Attestation
  attestationAccepted: boolean("attestation_accepted").notNull().default(false),
  attestationText: text("attestation_text").notNull(),

  // Timestamps
  documentedSignedAt: timestamp("documented_signed_at", { withTimezone: true }),
  signedAt: timestamp("signed_at", { withTimezone: true }).defaultNow().notNull(),

  // Audit trail
  ipAddress: inet("ip_address"),
  userAgent: text("user_agent"),

  // Signature artifact
  signatureData: text("signature_data"), // base64 signature image
  typedName: text("typed_name"),

  // Tamper evidence
  contentHashAtSign: varchar("content_hash_at_sign", { length: 64 }).notNull(),
  signatureHash: varchar("signature_hash", { length: 64 }).notNull(),

  // Patient representative specific
  representativeRelationship: text("representative_relationship"),
  patientUnableReason: text("patient_unable_reason"),

  // Countersign chain
  countersignsSignatureId: uuid("countersigns_signature_id").references(
    () => electronicSignatures.id,
  ),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const electronicSignaturesRelations = relations(electronicSignatures, ({ one }) => ({
  signatureRequest: one(signatureRequests, {
    fields: [electronicSignatures.signatureRequestId],
    references: [signatureRequests.id],
  }),
  location: one(locations, {
    fields: [electronicSignatures.locationId],
    references: [locations.id],
  }),
  signerUser: one(users, {
    fields: [electronicSignatures.signerUserId],
    references: [users.id],
  }),
  countersignsSignature: one(electronicSignatures, {
    fields: [electronicSignatures.countersignsSignatureId],
    references: [electronicSignatures.id],
    relationName: "countersigns",
  }),
}));

export const signatureEvents = pgTable("signature_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  signatureRequestId: uuid("signature_request_id")
    .references(() => signatureRequests.id, { onDelete: "cascade" })
    .notNull(),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  eventData: jsonb("event_data").notNull().default({}),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  actorName: text("actor_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const signatureEventsRelations = relations(signatureEvents, ({ one }) => ({
  signatureRequest: one(signatureRequests, {
    fields: [signatureEvents.signatureRequestId],
    references: [signatureRequests.id],
  }),
  actorUser: one(users, {
    fields: [signatureEvents.actorUserId],
    references: [users.id],
  }),
}));
