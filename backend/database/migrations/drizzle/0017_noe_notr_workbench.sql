-- T3-2a: NOE/NOTR Filing Workbench
-- Creates notice_filing_status enum, rebuilds notices_of_election with full spec,
-- adds notices_of_termination_revocation, adds NOE_LATE/NOTR_LATE alert types.

-- 1. Create notice_filing_status enum
CREATE TYPE notice_filing_status AS ENUM (
  'draft', 'ready_for_submission', 'submitted', 'accepted', 'rejected',
  'needs_correction', 'late_pending_override', 'voided', 'closed'
);

-- 2. Drop and recreate notices_of_election (old table: notice_of_election)
DROP TABLE IF EXISTS notice_of_election CASCADE;

CREATE TABLE notices_of_election (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  status notice_filing_status NOT NULL DEFAULT 'draft',
  election_date DATE NOT NULL,
  deadline_date DATE NOT NULL,
  is_late BOOLEAN NOT NULL DEFAULT false,
  late_reason TEXT,
  override_approved_by UUID REFERENCES users(id),
  override_approved_at TIMESTAMPTZ,
  override_reason TEXT,
  submitted_at TIMESTAMPTZ,
  submitted_by_user_id UUID REFERENCES users(id),
  response_code VARCHAR(20),
  response_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  corrected_from_id UUID REFERENCES notices_of_election(id),
  prior_payload_snapshot JSONB,
  is_claim_blocking BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_noe_patient ON notices_of_election(patient_id);
CREATE INDEX idx_noe_location ON notices_of_election(location_id);
CREATE INDEX idx_noe_status ON notices_of_election(status);
CREATE INDEX idx_noe_deadline ON notices_of_election(deadline_date);

ALTER TABLE notices_of_election ENABLE ROW LEVEL SECURITY;

CREATE POLICY noe_location_read ON notices_of_election FOR SELECT
  USING (location_id::text = current_setting('app.current_location_id', true));
CREATE POLICY noe_location_insert ON notices_of_election FOR INSERT
  WITH CHECK (location_id::text = current_setting('app.current_location_id', true));
CREATE POLICY noe_location_update ON notices_of_election FOR UPDATE
  USING (location_id::text = current_setting('app.current_location_id', true));

-- 3. Create notices_of_termination_revocation
CREATE TABLE notices_of_termination_revocation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  noe_id UUID NOT NULL REFERENCES notices_of_election(id),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  status notice_filing_status NOT NULL DEFAULT 'draft',
  revocation_date DATE NOT NULL,
  revocation_reason TEXT NOT NULL,
  deadline_date DATE NOT NULL,
  is_late BOOLEAN NOT NULL DEFAULT false,
  late_reason TEXT,
  override_approved_by UUID REFERENCES users(id),
  override_approved_at TIMESTAMPTZ,
  override_reason TEXT,
  receiving_hospice_id VARCHAR(20),
  receiving_hospice_name TEXT,
  transfer_date DATE,
  submitted_at TIMESTAMPTZ,
  submitted_by_user_id UUID REFERENCES users(id),
  response_code VARCHAR(20),
  response_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  corrected_from_id UUID REFERENCES notices_of_termination_revocation(id),
  prior_payload_snapshot JSONB,
  is_claim_blocking BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notr_noe ON notices_of_termination_revocation(noe_id);
CREATE INDEX idx_notr_patient ON notices_of_termination_revocation(patient_id);
CREATE INDEX idx_notr_location ON notices_of_termination_revocation(location_id);
CREATE INDEX idx_notr_status ON notices_of_termination_revocation(status);
CREATE INDEX idx_notr_deadline ON notices_of_termination_revocation(deadline_date);

ALTER TABLE notices_of_termination_revocation ENABLE ROW LEVEL SECURITY;

CREATE POLICY notr_location_read ON notices_of_termination_revocation FOR SELECT
  USING (location_id::text = current_setting('app.current_location_id', true));
CREATE POLICY notr_location_insert ON notices_of_termination_revocation FOR INSERT
  WITH CHECK (location_id::text = current_setting('app.current_location_id', true));
CREATE POLICY notr_location_update ON notices_of_termination_revocation FOR UPDATE
  USING (location_id::text = current_setting('app.current_location_id', true));

-- 4. Add new alert types
ALTER TYPE alert_type_enum ADD VALUE IF NOT EXISTS 'NOE_LATE';
ALTER TYPE alert_type_enum ADD VALUE IF NOT EXISTS 'NOTR_LATE';

-- Down: not provided (dev environment)
