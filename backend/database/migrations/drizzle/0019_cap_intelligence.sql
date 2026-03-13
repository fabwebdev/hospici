-- Migration 0019 — Hospice Cap Intelligence Module (T3-3)
-- UP

-- Add cap threshold alert enum values
ALTER TYPE alert_type_enum ADD VALUE IF NOT EXISTS 'CAP_THRESHOLD_70';
ALTER TYPE alert_type_enum ADD VALUE IF NOT EXISTS 'CAP_THRESHOLD_80';
ALTER TYPE alert_type_enum ADD VALUE IF NOT EXISTS 'CAP_THRESHOLD_90';
ALTER TYPE alert_type_enum ADD VALUE IF NOT EXISTS 'CAP_PROJECTED_OVERAGE';

-- cap_snapshots: one row per location per calculation run
CREATE TABLE IF NOT EXISTS cap_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations(id),
  cap_year INTEGER NOT NULL,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  utilization_percent NUMERIC(6,3) NOT NULL DEFAULT 0,
  projected_year_end_percent NUMERIC(6,3) NOT NULL DEFAULT 0,
  estimated_liability NUMERIC(12,2) NOT NULL DEFAULT 0,
  patient_count INTEGER NOT NULL DEFAULT 0,
  formula_version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
  input_hash VARCHAR(64) NOT NULL,
  triggered_by VARCHAR(20) NOT NULL DEFAULT 'scheduled',
  triggered_by_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cap_snapshots_location_year_idx
  ON cap_snapshots(location_id, cap_year, calculated_at DESC);

ALTER TABLE cap_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY cap_snapshots_location_read ON cap_snapshots
  FOR SELECT USING (
    location_id = current_setting('app.current_location_id', true)::uuid
    OR current_setting('app.current_role', true) = 'super_admin'
  );

CREATE POLICY cap_snapshots_location_insert ON cap_snapshots
  FOR INSERT WITH CHECK (
    location_id = current_setting('app.current_location_id', true)::uuid
    OR current_setting('app.current_role', true) IN ('super_admin', 'admin')
  );

-- cap_patient_contributions: one row per patient per snapshot
CREATE TABLE IF NOT EXISTS cap_patient_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES cap_snapshots(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id),
  location_id UUID NOT NULL REFERENCES locations(id),
  cap_contribution_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  routine_days INTEGER NOT NULL DEFAULT 0,
  continuous_home_care_days INTEGER NOT NULL DEFAULT 0,
  inpatient_days INTEGER NOT NULL DEFAULT 0,
  live_discharge_flag BOOLEAN NOT NULL DEFAULT false,
  admission_date DATE NOT NULL,
  discharge_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cap_patient_contributions_snapshot_idx
  ON cap_patient_contributions(snapshot_id);

CREATE INDEX IF NOT EXISTS cap_patient_contributions_patient_location_idx
  ON cap_patient_contributions(patient_id, location_id);

ALTER TABLE cap_patient_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY cap_patient_contributions_location_read ON cap_patient_contributions
  FOR SELECT USING (
    location_id = current_setting('app.current_location_id', true)::uuid
    OR current_setting('app.current_role', true) = 'super_admin'
  );

CREATE POLICY cap_patient_contributions_location_insert ON cap_patient_contributions
  FOR INSERT WITH CHECK (
    location_id = current_setting('app.current_location_id', true)::uuid
    OR current_setting('app.current_role', true) IN ('super_admin', 'admin')
  );

-- DOWN
DROP TABLE IF EXISTS cap_patient_contributions;
DROP TABLE IF EXISTS cap_snapshots;
