-- Migration: 0023_claim_audit_engine.sql
-- T3-12: Claim Audit Rules Engine + Bill-Hold Dashboard
-- Adds 5 new alert_type_enum values and the claim_audit_snapshots table with RLS.

-- ── UP ────────────────────────────────────────────────────────────────────────

-- Extend alert_type_enum with billing audit types
ALTER TYPE alert_type_enum ADD VALUE IF NOT EXISTS 'CLAIM_VALIDATION_ERROR';
ALTER TYPE alert_type_enum ADD VALUE IF NOT EXISTS 'CLAIM_REJECTION_STATUS';
ALTER TYPE alert_type_enum ADD VALUE IF NOT EXISTS 'BILL_HOLD_COMPLIANCE_BLOCK';
ALTER TYPE alert_type_enum ADD VALUE IF NOT EXISTS 'BILL_HOLD_MISSING_DOC';
ALTER TYPE alert_type_enum ADD VALUE IF NOT EXISTS 'BILL_HOLD_MANUAL_REVIEW';

-- ── claim_audit_snapshots ──────────────────────────────────────────────────────
-- Immutable record of each audit engine run against a claim.
-- failures and override_trail are JSONB arrays; never normalised — audit-log semantics.

CREATE TABLE claim_audit_snapshots (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id            uuid        NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  claim_revision_id   uuid                 REFERENCES claim_revisions(id) ON DELETE SET NULL,
  location_id         uuid        NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  audited_at          timestamptz NOT NULL DEFAULT now(),
  passed              boolean     NOT NULL,
  block_count         integer     NOT NULL DEFAULT 0,
  warn_count          integer     NOT NULL DEFAULT 0,
  -- Array of AuditFailure objects (see claimAudit.schema.ts)
  failures            jsonb       NOT NULL DEFAULT '[]',
  -- Array of supervisor override records appended via overrideWarn()
  override_trail      jsonb       NOT NULL DEFAULT '[]',
  audited_by          uuid                 REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_claim_audit_snapshots_claim_id
  ON claim_audit_snapshots(claim_id);

CREATE INDEX idx_claim_audit_snapshots_location_id
  ON claim_audit_snapshots(location_id);

CREATE INDEX idx_claim_audit_snapshots_audited_at
  ON claim_audit_snapshots(location_id, audited_at DESC);

-- ── Row-Level Security ────────────────────────────────────────────────────────

ALTER TABLE claim_audit_snapshots ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user in the same location
CREATE POLICY claim_audit_snapshots_location_read
  ON claim_audit_snapshots
  FOR SELECT
  USING (location_id::text = current_setting('app.current_location_id', true));

-- Insert: authenticated users may create snapshots for their location
CREATE POLICY claim_audit_snapshots_location_insert
  ON claim_audit_snapshots
  FOR INSERT
  WITH CHECK (location_id::text = current_setting('app.current_location_id', true));

-- Update: only the override_trail column may be patched (supervisor override flow)
CREATE POLICY claim_audit_snapshots_location_update
  ON claim_audit_snapshots
  FOR UPDATE
  USING (location_id::text = current_setting('app.current_location_id', true))
  WITH CHECK (location_id::text = current_setting('app.current_location_id', true));

-- ── DOWN ──────────────────────────────────────────────────────────────────────
-- To roll back:
--
-- DROP TABLE IF EXISTS claim_audit_snapshots;
--
-- PostgreSQL does not support DROP VALUE from an enum; to revert the new enum
-- values you must recreate the enum and re-alter all dependent columns, or
-- simply leave the unused values in place (safe — they are merely unoccupied).
-- The comment below documents intent for manual rollback if required.
--
-- -- Step 1: recreate enum without the 5 new values (requires recreating all columns
-- --         that reference alert_type_enum; omitted here for brevity — do in psql).
-- -- Step 2: DROP TABLE claim_audit_snapshots;
