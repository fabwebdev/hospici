/**
 * Drizzle schema barrel.
 * Import individual tables from their own files; re-export here for
 * the drizzle() client and drizzle-kit config.
 */

export * from "./locations.table.js";
export * from "./users.table.js";
export * from "./audit-logs.table.js";
export * from "./patients.table.js";
export * from "./pain-assessments.table.js";
export * from "./noe.table.js";
export * from "./benefit-periods.table.js";
export * from "./idg-meetings.table.js";
export * from "./aide-supervisions.table.js";
