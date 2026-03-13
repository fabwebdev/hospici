-- Migration: 0020_benefit_periods.sql
-- T3-4: Benefit Period Control System
-- Rewrites the stub benefit_periods table with the full CMS-compliant schema.

-- ── Drop old stub columns ─────────────────────────────────────────────────────

ALTER TABLE benefit_periods DROP COLUMN IF EXISTS period_type;
ALTER TABLE benefit_periods DROP COLUMN IF EXISTS is_active;
ALTER TABLE benefit_periods DROP COLUMN IF EXISTS f2f_date;
ALTER TABLE benefit_periods DROP COLUMN IF EXISTS f2f_physician_id;
ALTER TABLE benefit_periods DROP COLUMN IF EXISTS alert_sent_at;
ALTER TABLE benefit_periods DROP COLUMN IF EXISTS status;

-- ── New enums ─────────────────────────────────────────────────────────────────

CREATE TYPE benefit_period_status AS ENUM (
  'current', 'upcoming', 'recert_due', 'at_risk', 'past_due',
  'closed', 'revoked', 'transferred_out', 'concurrent_care', 'discharged'
);

CREATE TYPE benefit_period_recert_status AS ENUM (
  'not_yet_due', 'ready_for_recert', 'pending_physician', 'completed', 'missed'
);

CREATE TYPE benefit_period_f2f_status AS ENUM (
  'not_required', 'not_yet_due', 'due_soon', 'documented', 'invalid', 'missing', 'recert_blocked'
);

CREATE TYPE benefit_period_admission_type AS ENUM (
  'new_admission', 'hospice_to_hospice_transfer', 'revocation_readmission'
);

-- ── Add new columns ───────────────────────────────────────────────────────────

ALTER TABLE benefit_periods
  ADD COLUMN status benefit_period_status NOT NULL DEFAULT 'upcoming',
  ADD COLUMN admission_type benefit_period_admission_type DEFAULT 'new_admission',
  ADD COLUMN is_transfer_derived boolean NOT NULL DEFAULT false,
  ADD COLUMN source_admission_id uuid,
  ADD COLUMN is_reporting_period boolean NOT NULL DEFAULT false,
  ADD COLUMN recert_due_date date,
  ADD COLUMN recert_status benefit_period_recert_status NOT NULL DEFAULT 'not_yet_due',
  ADD COLUMN recert_completed_at timestamptz,
  ADD COLUMN recert_physician_id uuid REFERENCES users(id),
  ADD COLUMN f2f_required boolean NOT NULL DEFAULT false,
  ADD COLUMN f2f_status benefit_period_f2f_status NOT NULL DEFAULT 'not_required',
  ADD COLUMN f2f_documented_at date,
  ADD COLUMN f2f_provider_id uuid REFERENCES users(id),
  ADD COLUMN f2f_window_start date,
  ADD COLUMN f2f_window_end date,
  ADD COLUMN billing_risk boolean NOT NULL DEFAULT false,
  ADD COLUMN billing_risk_reason text,
  ADD COLUMN noe_id uuid REFERENCES notices_of_election(id),
  ADD COLUMN concurrent_care_start date,
  ADD COLUMN concurrent_care_end date,
  ADD COLUMN revocation_date date,
  ADD COLUMN correction_history jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ── Computed column (period length in days) ───────────────────────────────────

ALTER TABLE benefit_periods
  ADD COLUMN period_length_days integer GENERATED ALWAYS AS (end_date - start_date) STORED;

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Partial unique index: at most one reporting period per patient
CREATE UNIQUE INDEX benefit_periods_reporting_period_idx
  ON benefit_periods (patient_id) WHERE is_reporting_period = true;

-- Fast per-patient timeline
CREATE INDEX benefit_periods_patient_period_idx
  ON benefit_periods (patient_id, period_number);

-- Location queries
CREATE INDEX benefit_periods_location_status_idx
  ON benefit_periods (location_id, status);

-- Recert due queue
CREATE INDEX benefit_periods_recert_due_idx
  ON benefit_periods (recert_due_date)
  WHERE status IN ('current', 'recert_due', 'at_risk');

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE benefit_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY benefit_periods_location_read ON benefit_periods
  FOR SELECT
  USING (location_id::text = current_setting('app.location_id', true));

CREATE POLICY benefit_periods_location_insert ON benefit_periods
  FOR INSERT
  WITH CHECK (location_id::text = current_setting('app.location_id', true));

CREATE POLICY benefit_periods_owner_or_admin_update ON benefit_periods
  FOR UPDATE
  USING (
    location_id::text = current_setting('app.location_id', true)
    OR current_setting('app.user_role', true) = 'admin'
  );

-- ── New alert type enum values ────────────────────────────────────────────────

ALTER TYPE alert_type_enum ADD VALUE IF NOT EXISTS 'RECERT_DUE';
ALTER TYPE alert_type_enum ADD VALUE IF NOT EXISTS 'RECERT_AT_RISK';
ALTER TYPE alert_type_enum ADD VALUE IF NOT EXISTS 'RECERT_PAST_DUE';
ALTER TYPE alert_type_enum ADD VALUE IF NOT EXISTS 'F2F_DUE_SOON';
ALTER TYPE alert_type_enum ADD VALUE IF NOT EXISTS 'BENEFIT_PERIOD_BILLING_RISK';

-- ────────────────────────────────────────────────────────────────────────────
-- DOWN MIGRATION (rollback)
-- Run these statements in order to undo this migration:
--
-- DROP INDEX IF EXISTS benefit_periods_recert_due_idx;
-- DROP INDEX IF EXISTS benefit_periods_location_status_idx;
-- DROP INDEX IF EXISTS benefit_periods_patient_period_idx;
-- DROP INDEX IF EXISTS benefit_periods_reporting_period_idx;
--
-- ALTER TABLE benefit_periods
--   DROP COLUMN IF EXISTS period_length_days,
--   DROP COLUMN IF EXISTS correction_history,
--   DROP COLUMN IF EXISTS revocation_date,
--   DROP COLUMN IF EXISTS concurrent_care_end,
--   DROP COLUMN IF EXISTS concurrent_care_start,
--   DROP COLUMN IF EXISTS noe_id,
--   DROP COLUMN IF EXISTS billing_risk_reason,
--   DROP COLUMN IF EXISTS billing_risk,
--   DROP COLUMN IF EXISTS f2f_window_end,
--   DROP COLUMN IF EXISTS f2f_window_start,
--   DROP COLUMN IF EXISTS f2f_provider_id,
--   DROP COLUMN IF EXISTS f2f_documented_at,
--   DROP COLUMN IF EXISTS f2f_status,
--   DROP COLUMN IF EXISTS f2f_required,
--   DROP COLUMN IF EXISTS recert_physician_id,
--   DROP COLUMN IF EXISTS recert_completed_at,
--   DROP COLUMN IF EXISTS recert_status,
--   DROP COLUMN IF EXISTS recert_due_date,
--   DROP COLUMN IF EXISTS is_reporting_period,
--   DROP COLUMN IF EXISTS source_admission_id,
--   DROP COLUMN IF EXISTS is_transfer_derived,
--   DROP COLUMN IF EXISTS admission_type,
--   DROP COLUMN IF EXISTS status;
--
-- DROP TYPE IF EXISTS benefit_period_admission_type;
-- DROP TYPE IF EXISTS benefit_period_f2f_status;
-- DROP TYPE IF EXISTS benefit_period_recert_status;
-- DROP TYPE IF EXISTS benefit_period_status;
--
-- -- Re-add old stub columns:
-- ALTER TABLE benefit_periods
--   ADD COLUMN period_type varchar(50) NOT NULL DEFAULT 'initial_90',
--   ADD COLUMN status varchar(50) NOT NULL DEFAULT 'active',
--   ADD COLUMN is_active boolean DEFAULT true,
--   ADD COLUMN f2f_date date,
--   ADD COLUMN f2f_physician_id uuid REFERENCES users(id),
--   ADD COLUMN alert_sent_at timestamptz;
--
-- Note: alert_type_enum values RECERT_DUE, RECERT_AT_RISK, RECERT_PAST_DUE,
-- F2F_DUE_SOON, BENEFIT_PERIOD_BILLING_RISK cannot be removed once added to
-- a PostgreSQL enum type — they are permanent (acceptable since they are forward-safe).
-- ────────────────────────────────────────────────────────────────────────────
