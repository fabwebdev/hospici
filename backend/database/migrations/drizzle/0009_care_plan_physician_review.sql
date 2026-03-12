-- Migration 0009 — care_plans physician review columns
-- 42 CFR §418.56(b): attending physician + medical director/designee must review
-- the initial plan within 2 calendar days; then medical director/designee + IDG
-- must review and revise at least every 14 calendar days.
--
-- Promoted columns allow BullMQ deadline jobs to query without JSONB parsing.

-- ── Up ────────────────────────────────────────────────────────────────────────

ALTER TABLE "care_plans"
  ADD COLUMN "initial_review_deadline"     DATE,
  ADD COLUMN "initial_review_completed_at" TIMESTAMPTZ,
  ADD COLUMN "initial_reviewed_by"         UUID,
  ADD COLUMN "last_review_at"              TIMESTAMPTZ,
  ADD COLUMN "next_review_due"             DATE,
  ADD COLUMN "review_history"              JSONB NOT NULL DEFAULT '[]';

-- Index for BullMQ job: find care plans where initial 2-day review is overdue
CREATE INDEX "care_plans_initial_review_idx"
  ON "care_plans" ("initial_review_deadline", "initial_review_completed_at")
  WHERE "initial_review_completed_at" IS NULL;

-- Index for BullMQ job: find care plans where 14-day ongoing review is overdue
CREATE INDEX "care_plans_next_review_idx"
  ON "care_plans" ("next_review_due")
  WHERE "next_review_due" IS NOT NULL;

-- ── Down ──────────────────────────────────────────────────────────────────────

-- DROP INDEX IF EXISTS "care_plans_next_review_idx";
-- DROP INDEX IF EXISTS "care_plans_initial_review_idx";
-- ALTER TABLE "care_plans"
--   DROP COLUMN "review_history",
--   DROP COLUMN "next_review_due",
--   DROP COLUMN "last_review_at",
--   DROP COLUMN "initial_reviewed_by",
--   DROP COLUMN "initial_review_completed_at",
--   DROP COLUMN "initial_review_deadline";
