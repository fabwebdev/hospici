-- 0013_note_review.sql
-- Note review system — T2-9.
-- Adds `note_review_status` enum, review metadata columns to encounters,
-- and three new note-specific alert types to alert_type_enum.
--
-- State machine:
--   PENDING → IN_REVIEW → REVISION_REQUESTED → RESUBMITTED → IN_REVIEW → APPROVED
--   IN_REVIEW or REVISION_REQUESTED → ESCALATED
--   LOCKED is set by T3-5 (electronic signatures); not reachable from T2-9.
--
-- Down migration:
--   ALTER TABLE encounters
--     DROP COLUMN IF EXISTS review_status,
--     DROP COLUMN IF EXISTS reviewer_id,
--     DROP COLUMN IF EXISTS reviewed_at,
--     DROP COLUMN IF EXISTS escalated_at,
--     DROP COLUMN IF EXISTS escalation_reason,
--     DROP COLUMN IF EXISTS revision_requests,
--     DROP COLUMN IF EXISTS review_priority,
--     DROP COLUMN IF EXISTS assigned_reviewer_id,
--     DROP COLUMN IF EXISTS due_by,
--     DROP COLUMN IF EXISTS billing_impact,
--     DROP COLUMN IF EXISTS compliance_impact,
--     DROP COLUMN IF EXISTS first_pass_approved,
--     DROP COLUMN IF EXISTS revision_count;
--   DROP TYPE IF EXISTS note_review_status;
--   -- Cannot remove enum values from alert_type_enum in Postgres without recreating it.

-- ── Note review status enum ────────────────────────────────────────────────────

CREATE TYPE note_review_status AS ENUM (
  'PENDING',
  'IN_REVIEW',
  'REVISION_REQUESTED',
  'RESUBMITTED',
  'APPROVED',
  'LOCKED',
  'ESCALATED'
);

-- ── Encounters — review metadata columns ──────────────────────────────────────

ALTER TABLE encounters
  ADD COLUMN review_status         note_review_status NOT NULL DEFAULT 'PENDING',
  ADD COLUMN reviewer_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN reviewed_at           TIMESTAMPTZ,
  ADD COLUMN escalated_at          TIMESTAMPTZ,
  ADD COLUMN escalation_reason     TEXT,
  ADD COLUMN revision_requests     JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN review_priority       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN assigned_reviewer_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN due_by                TIMESTAMPTZ,
  ADD COLUMN billing_impact        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN compliance_impact     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN first_pass_approved   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN revision_count        INTEGER NOT NULL DEFAULT 0;

-- Review queue indexes
CREATE INDEX idx_encounters_review_status
  ON encounters (review_status)
  WHERE review_status NOT IN ('APPROVED', 'LOCKED');

CREATE INDEX idx_encounters_assigned_reviewer
  ON encounters (assigned_reviewer_id, review_status)
  WHERE assigned_reviewer_id IS NOT NULL;

CREATE INDEX idx_encounters_review_due_by
  ON encounters (due_by, review_status)
  WHERE due_by IS NOT NULL AND review_status NOT IN ('APPROVED', 'LOCKED');

CREATE INDEX idx_encounters_billing_impact
  ON encounters (location_id, billing_impact, review_status)
  WHERE billing_impact = TRUE;

-- ── Alert type additions ──────────────────────────────────────────────────────
-- Postgres requires separate ALTER TYPE statements per value.

ALTER TYPE alert_type_enum ADD VALUE IF NOT EXISTS 'NOTE_REVIEW_REQUIRED';
ALTER TYPE alert_type_enum ADD VALUE IF NOT EXISTS 'NOTE_INCOMPLETE';
ALTER TYPE alert_type_enum ADD VALUE IF NOT EXISTS 'NOTE_OVERDUE_REVIEW';
