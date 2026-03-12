import { date, jsonb, pgEnum, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { locations } from "./locations.table.js";

export const careModelEnum = pgEnum("care_model", ["HOSPICE", "PALLIATIVE", "CCM"]);

export const patients = pgTable("patients", {
	id: uuid("id").primaryKey().defaultRandom(),
	resourceType: varchar("resource_type", { length: 50 }).notNull().default("Patient"),
	locationId: uuid("location_id")
		.references(() => locations.id)
		.notNull(),
	admissionDate: date("admission_date"),
	dischargeDate: date("discharge_date"),
	fhirVersion: varchar("fhir_version", { length: 10 }).notNull().default("4.0"),
	careModel: careModelEnum("care_model").notNull().default("HOSPICE"),
	data: jsonb("data").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
