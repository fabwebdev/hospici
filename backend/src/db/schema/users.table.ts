import { boolean, jsonb, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
	id: uuid("id").primaryKey().defaultRandom(),
	email: varchar("email", { length: 255 }).notNull().unique(),
	emailVerified: boolean("emailverified").default(false),
	abacAttributes: jsonb("abac_attributes")
		.notNull()
		.default({ locationIds: [], role: "clinician", permissions: [] }),
	passwordHash: varchar("password_hash", { length: 255 }),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
