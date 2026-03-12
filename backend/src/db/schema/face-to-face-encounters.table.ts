import { boolean, date, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { benefitPeriods } from "./benefit-periods.table.js";
import { locations } from "./locations.table.js";
import { orders } from "./orders.table.js";
import { patients } from "./patients.table.js";
import { users } from "./users.table.js";

export const providerRoleEnum = pgEnum("provider_role_enum", ["physician", "np", "pa"]);
export const encounterSettingEnum = pgEnum("encounter_setting_enum", [
	"office",
	"home",
	"telehealth",
	"snf",
	"hospital",
]);

export const faceToFaceEncounters = pgTable("face_to_face_encounters", {
	id: uuid("id").primaryKey().defaultRandom(),
	patientId: uuid("patient_id")
		.references(() => patients.id)
		.notNull(),
	locationId: uuid("location_id")
		.references(() => locations.id)
		.notNull(),
	benefitPeriodId: uuid("benefit_period_id")
		.references(() => benefitPeriods.id)
		.notNull(),
	f2fDate: date("f2f_date").notNull(),
	f2fProviderId: uuid("f2f_provider_id").references(() => users.id),
	f2fProviderNpi: varchar("f2f_provider_npi", { length: 10 }),
	f2fProviderRole: providerRoleEnum("f2f_provider_role").notNull(),
	encounterSetting: encounterSettingEnum("encounter_setting").notNull(),
	clinicalFindings: text("clinical_findings").notNull().default(""),
	isValidForRecert: boolean("is_valid_for_recert").notNull().default(false),
	validatedAt: timestamp("validated_at", { withTimezone: true }),
	invalidationReason: text("invalidation_reason"),
	physicianTaskId: uuid("physician_task_id").references(() => orders.id),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
