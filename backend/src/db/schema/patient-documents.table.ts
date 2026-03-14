/**
 * Drizzle table definition — patient_documents
 *
 * Stores document metadata for each patient. The actual file content lives in
 * object storage (S3/R2); only the storage_key is persisted here.
 *
 * RLS: location_id column — policies in migration 0029.
 */

import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { locations } from "./locations.table.js";
import { patients } from "./patients.table.js";
import { users } from "./users.table.js";

export const documentCategoryEnum = pgEnum("document_category_enum", [
  "CERTIFICATION",
  "CONSENT",
  "CLINICAL_NOTE",
  "ORDER",
  "CARE_PLAN",
  "ADVANCE_DIRECTIVE",
  "OTHER",
]);

export const documentStatusEnum = pgEnum("document_status_enum", ["ACTIVE", "ARCHIVED"]);

export const patientDocuments = pgTable(
  "patient_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    name: text("name").notNull(),
    category: documentCategoryEnum("category").notNull(),
    storageKey: text("storage_key"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    status: documentStatusEnum("status").notNull().default("ACTIVE"),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id),
    signed: boolean("signed").notNull().default(false),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    signedByUserId: uuid("signed_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_patient_documents_patient_status").on(t.patientId, t.status),
    index("idx_patient_documents_patient_category").on(t.patientId, t.category),
  ],
);
