-- Migration 0033: Patient Insurance and Conditions
-- Tables: patient_conditions, patient_insurance
-- Advance directives and emergency contacts are stored in the patients.data JSONB blob
-- (FHIR R4 Patient.contact and extension fields — no separate table needed).

-- ── patient_conditions ────────────────────────────────────────────────────────

CREATE TYPE condition_clinical_status AS ENUM ('ACTIVE', 'RESOLVED', 'REMISSION');
CREATE TYPE condition_severity AS ENUM ('MILD', 'MODERATE', 'SEVERE');

CREATE TABLE patient_conditions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id       UUID NOT NULL REFERENCES patients(id),
  location_id      UUID NOT NULL REFERENCES locations(id),
  icd10_code       VARCHAR(20) NOT NULL,
  description      TEXT NOT NULL,
  is_terminal      BOOLEAN NOT NULL DEFAULT false,
  is_related       BOOLEAN NOT NULL DEFAULT false,
  clinical_status  condition_clinical_status NOT NULL DEFAULT 'ACTIVE',
  severity         condition_severity,
  onset_date       DATE,
  confirmed_date   DATE,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  documented_by    UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE patient_conditions ENABLE ROW LEVEL SECURITY;

CREATE POLICY patient_conditions_location_read
  ON patient_conditions FOR SELECT
  USING (location_id::text = current_setting('app.current_location_id', true));

CREATE POLICY patient_conditions_location_insert
  ON patient_conditions FOR INSERT
  WITH CHECK (location_id::text = current_setting('app.current_location_id', true));

CREATE POLICY patient_conditions_location_update
  ON patient_conditions FOR UPDATE
  USING (location_id::text = current_setting('app.current_location_id', true))
  WITH CHECK (location_id::text = current_setting('app.current_location_id', true));

CREATE INDEX idx_patient_conditions_patient_active ON patient_conditions(patient_id, is_active);
CREATE INDEX idx_patient_conditions_terminal ON patient_conditions(patient_id, is_terminal);
CREATE INDEX idx_patient_conditions_icd10 ON patient_conditions(patient_id, icd10_code);

-- ── patient_insurance ─────────────────────────────────────────────────────────

CREATE TYPE insurance_coverage_type AS ENUM (
  'MEDICARE_PART_A', 'MEDICARE_ADVANTAGE', 'MEDICAID', 'MEDICAID_WAIVER', 'PRIVATE', 'VA', 'OTHER'
);

CREATE TYPE subscriber_relationship AS ENUM ('SELF', 'SPOUSE', 'CHILD', 'OTHER');

CREATE TABLE patient_insurance (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id              UUID NOT NULL REFERENCES patients(id),
  location_id             UUID NOT NULL REFERENCES locations(id),
  coverage_type           insurance_coverage_type NOT NULL,
  is_primary              BOOLEAN NOT NULL DEFAULT false,
  payer_name              TEXT NOT NULL,
  payer_id                VARCHAR(50),
  plan_name               TEXT,
  policy_number           VARCHAR(50),
  group_number            VARCHAR(50),
  subscriber_id           VARCHAR(50) NOT NULL,
  subscriber_first_name   VARCHAR(100),
  subscriber_last_name    VARCHAR(100),
  subscriber_dob          DATE,
  relationship_to_patient subscriber_relationship NOT NULL,
  effective_date          DATE,
  termination_date        DATE,
  prior_auth_number       VARCHAR(50),
  is_active               BOOLEAN NOT NULL DEFAULT true,
  documented_by           UUID NOT NULL REFERENCES users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE patient_insurance ENABLE ROW LEVEL SECURITY;

CREATE POLICY patient_insurance_location_read
  ON patient_insurance FOR SELECT
  USING (location_id::text = current_setting('app.current_location_id', true));

CREATE POLICY patient_insurance_location_insert
  ON patient_insurance FOR INSERT
  WITH CHECK (location_id::text = current_setting('app.current_location_id', true));

CREATE POLICY patient_insurance_location_update
  ON patient_insurance FOR UPDATE
  USING (location_id::text = current_setting('app.current_location_id', true))
  WITH CHECK (location_id::text = current_setting('app.current_location_id', true));

CREATE INDEX idx_patient_insurance_patient_active ON patient_insurance(patient_id, is_active);
CREATE INDEX idx_patient_insurance_primary ON patient_insurance(patient_id, is_primary);
CREATE INDEX idx_patient_insurance_coverage_type ON patient_insurance(patient_id, coverage_type);

-- ── Rollback ──────────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS patient_insurance;
-- DROP TABLE IF EXISTS patient_conditions;
-- DROP TYPE IF EXISTS subscriber_relationship;
-- DROP TYPE IF EXISTS insurance_coverage_type;
-- DROP TYPE IF EXISTS condition_severity;
-- DROP TYPE IF EXISTS condition_clinical_status;
