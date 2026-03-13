-- Migration: 0022_claim_lifecycle.sql
-- T3-7a: Hospice Claim Lifecycle + 837i Generation
-- Tables: claims, claim_revisions, claim_submissions, claim_rejections, bill_holds
-- All tables have RLS enabled with location_id scoping

-- ── Enums ─────────────────────────────────────────────────────────────────────

CREATE TYPE claim_state AS ENUM (
  'DRAFT',
  'NOT_READY',
  'READY_FOR_AUDIT',
  'AUDIT_FAILED',
  'READY_TO_SUBMIT',
  'QUEUED',
  'SUBMITTED',
  'ACCEPTED',
  'REJECTED',
  'DENIED',
  'PAID',
  'VOIDED'
);

-- UB-04 frequency type codes mapped to bill types
-- 8X1 = original, 8X7 = replacement/corrected, 8X8 = void
CREATE TYPE claim_bill_type AS ENUM (
  'original',
  'replacement',
  'void'
);

-- Hold reason taxonomy
CREATE TYPE bill_hold_reason AS ENUM (
  'MANUAL_REVIEW',
  'COMPLIANCE_BLOCK',
  'MISSING_DOCUMENTATION',
  'PAYER_INQUIRY',
  'INTERNAL_AUDIT',
  'SUPERVISOR_REVIEW'
);

-- ── claims ────────────────────────────────────────────────────────────────────

CREATE TABLE claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  payer_id text NOT NULL,                    -- clearinghouse/payer ID string
  benefit_period_id uuid REFERENCES benefit_periods(id) ON DELETE RESTRICT,
  bill_type claim_bill_type NOT NULL DEFAULT 'original',
  -- UB-04 statement dates
  statement_from_date date NOT NULL,
  statement_to_date date NOT NULL,
  total_charge numeric(12, 2) NOT NULL DEFAULT 0,
  state claim_state NOT NULL DEFAULT 'DRAFT',
  is_on_hold boolean NOT NULL DEFAULT false,
  -- Lineage for replacement/void chains
  corrected_from_id uuid REFERENCES claims(id) ON DELETE RESTRICT,
  -- Claim lines stored as JSONB (revenue codes, units, charges; not independently queried)
  claim_lines jsonb NOT NULL DEFAULT '[]',
  -- Hashes for tamper evidence and dedup
  payload_hash text,       -- SHA-256 of canonical claim JSON before X12 encoding
  x12_hash text,           -- SHA-256 of generated 837i transaction set
  -- Clearinghouse ICN from ACCEPTED/PAID response
  clearinghouse_icn text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── claim_revisions ───────────────────────────────────────────────────────────
-- Append-only snapshot per state transition

CREATE TABLE claim_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES locations(id),
  from_state claim_state NOT NULL,
  to_state claim_state NOT NULL,
  reason text,
  snapshot jsonb NOT NULL DEFAULT '{}',      -- full claim snapshot at transition
  transitioned_by uuid REFERENCES users(id),
  transitioned_at timestamptz NOT NULL DEFAULT now()
);

-- ── claim_submissions ─────────────────────────────────────────────────────────
-- One row per clearinghouse submission attempt

CREATE TABLE claim_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES locations(id),
  batch_id text,                             -- clearinghouse batch/transmission ID
  response_code text,                        -- 999 TA1/AK1 response code
  response_message text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  response_received_at timestamptz,
  -- BullMQ job tracking
  job_id text,
  attempt_number integer NOT NULL DEFAULT 1
);

-- ── claim_rejections ──────────────────────────────────────────────────────────
-- Rejection detail from clearinghouse (loop/segment, error code, description)

CREATE TABLE claim_rejections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  claim_submission_id uuid REFERENCES claim_submissions(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES locations(id),
  loop_id text,                              -- X12 loop where error occurred
  segment_id text,                           -- X12 segment identifier
  error_code text NOT NULL,                  -- 999 AK3/AK4 error code
  error_description text NOT NULL,
  field_position text,                       -- element/component position
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── bill_holds ────────────────────────────────────────────────────────────────
-- One active hold per claim (enforced by partial unique index below)

CREATE TABLE bill_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES locations(id),
  reason bill_hold_reason NOT NULL,
  hold_note text,
  placed_by uuid NOT NULL REFERENCES users(id),
  placed_at timestamptz NOT NULL DEFAULT now(),
  released_by uuid REFERENCES users(id),
  released_at timestamptz
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX claims_patient_id_idx ON claims (patient_id);
CREATE INDEX claims_location_id_state_idx ON claims (location_id, state);
CREATE INDEX claims_benefit_period_id_idx ON claims (benefit_period_id);
CREATE INDEX claims_payer_id_idx ON claims (payer_id);
CREATE INDEX claims_statement_dates_idx ON claims (statement_from_date, statement_to_date);
CREATE INDEX claims_corrected_from_id_idx ON claims (corrected_from_id) WHERE corrected_from_id IS NOT NULL;

CREATE INDEX claim_revisions_claim_id_idx ON claim_revisions (claim_id);
CREATE INDEX claim_submissions_claim_id_idx ON claim_submissions (claim_id);
CREATE INDEX claim_rejections_claim_id_idx ON claim_rejections (claim_id);
CREATE INDEX bill_holds_claim_id_idx ON bill_holds (claim_id);

-- One active hold per claim: enforces "single active hold" rule
CREATE UNIQUE INDEX bill_holds_one_active_per_claim
  ON bill_holds (claim_id)
  WHERE released_at IS NULL;

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_rejections ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_holds ENABLE ROW LEVEL SECURITY;

-- claims: read/write scoped to current_location_id
CREATE POLICY claims_location_read ON claims
  FOR SELECT
  USING (location_id::text = current_setting('app.current_location_id', true));

CREATE POLICY claims_location_write ON claims
  FOR INSERT
  WITH CHECK (location_id::text = current_setting('app.current_location_id', true));

CREATE POLICY claims_location_update ON claims
  FOR UPDATE
  USING (location_id::text = current_setting('app.current_location_id', true));

-- claim_revisions: append-only, read by location
CREATE POLICY claim_revisions_location_read ON claim_revisions
  FOR SELECT
  USING (location_id::text = current_setting('app.current_location_id', true));

CREATE POLICY claim_revisions_location_insert ON claim_revisions
  FOR INSERT
  WITH CHECK (location_id::text = current_setting('app.current_location_id', true));

-- claim_submissions: read by location, insert only
CREATE POLICY claim_submissions_location_read ON claim_submissions
  FOR SELECT
  USING (location_id::text = current_setting('app.current_location_id', true));

CREATE POLICY claim_submissions_location_insert ON claim_submissions
  FOR INSERT
  WITH CHECK (location_id::text = current_setting('app.current_location_id', true));

CREATE POLICY claim_submissions_location_update ON claim_submissions
  FOR UPDATE
  USING (location_id::text = current_setting('app.current_location_id', true));

-- claim_rejections: read by location
CREATE POLICY claim_rejections_location_read ON claim_rejections
  FOR SELECT
  USING (location_id::text = current_setting('app.current_location_id', true));

CREATE POLICY claim_rejections_location_insert ON claim_rejections
  FOR INSERT
  WITH CHECK (location_id::text = current_setting('app.current_location_id', true));

-- bill_holds: read/write by location
CREATE POLICY bill_holds_location_read ON bill_holds
  FOR SELECT
  USING (location_id::text = current_setting('app.current_location_id', true));

CREATE POLICY bill_holds_location_insert ON bill_holds
  FOR INSERT
  WITH CHECK (location_id::text = current_setting('app.current_location_id', true));

CREATE POLICY bill_holds_location_update ON bill_holds
  FOR UPDATE
  USING (location_id::text = current_setting('app.current_location_id', true));

-- ── Down migration ────────────────────────────────────────────────────────────
-- To rollback:
--   DROP TABLE IF EXISTS bill_holds CASCADE;
--   DROP TABLE IF EXISTS claim_rejections CASCADE;
--   DROP TABLE IF EXISTS claim_submissions CASCADE;
--   DROP TABLE IF EXISTS claim_revisions CASCADE;
--   DROP TABLE IF EXISTS claims CASCADE;
--   DROP TYPE IF EXISTS bill_hold_reason;
--   DROP TYPE IF EXISTS claim_bill_type;
--   DROP TYPE IF EXISTS claim_state;
