import { boolean, jsonb, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const locations = pgTable("locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  npi: varchar("npi", { length: 10 }).unique(),
  taxId: varchar("taxid", { length: 9 }),
  address: jsonb("address").notNull(),
  phone: varchar("phone", { length: 20 }),
  isActive: boolean("isactive").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
