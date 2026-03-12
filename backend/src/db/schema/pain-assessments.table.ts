import { integer, jsonb, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { locations } from "./locations.table.js";
import { patients } from "./patients.table.js";
import { users } from "./users.table.js";

export const painAssessments = pgTable("pain_assessments", {
	id: uuid("id").primaryKey().defaultRandom(),
	patientId: uuid("patient_id")
		.references(() => patients.id)
		.notNull(),
	locationId: uuid("location_id")
		.references(() => locations.id)
		.notNull(),
	assessmentType: varchar("assessment_type", { length: 50 }).notNull(),
	assessedAt: timestamp("assessed_at", { withTimezone: true }).notNull(),
	assessedBy: uuid("assessed_by")
		.references(() => users.id)
		.notNull(),
	totalScore: integer("total_score"),
	data: jsonb("data").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
