-- Migration 0032 — extend visit_type enum + add encounters.addenda column
-- Adds discipline-based visit types required by Clinical Notes UI (42 CFR §418.76, §418.78)
-- and an addenda JSONB column for post-sign addendum history.
--
-- NOTE: ALTER TYPE ... ADD VALUE cannot be executed inside a transaction block in PG < 12.
-- This migration runs outside BEGIN/COMMIT intentionally.

ALTER TYPE visit_type ADD VALUE IF NOT EXISTS 'social_work';
ALTER TYPE visit_type ADD VALUE IF NOT EXISTS 'chaplain';
ALTER TYPE visit_type ADD VALUE IF NOT EXISTS 'physician_attestation';
ALTER TYPE visit_type ADD VALUE IF NOT EXISTS 'progress_note';

ALTER TABLE encounters
  ADD COLUMN IF NOT EXISTS addenda JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ── Down migration ─────────────────────────────────────────────────────────────
-- PostgreSQL does not support removing enum values directly.
-- To roll back: recreate visit_type without the new values and cast the column.
-- ALTER TABLE encounters DROP COLUMN IF EXISTS addenda;
-- (enum rollback requires a full type recreation — see docs/runbooks/enum-rollback.md)
