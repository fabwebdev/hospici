-- Migration 0010 — medication management
-- Tables: medications, medication_administrations, patient_allergies
-- RLS policies on all three tables (42 CFR §418 — PHI access control)

-- ── Up ────────────────────────────────────────────────────────────────────────

-- Enums

DO $$ BEGIN
  CREATE TYPE medication_status AS ENUM ('ACTIVE', 'DISCONTINUED', 'ON_HOLD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE medication_frequency_type AS ENUM ('SCHEDULED', 'PRN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE dea_schedule AS ENUM ('I', 'II', 'III', 'IV', 'V');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE medicare_coverage_type AS ENUM ('PART_A_RELATED', 'PART_D', 'NOT_COVERED', 'OTC');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE medication_administration_type AS ENUM ('GIVEN', 'OMITTED', 'REFUSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE allergy_severity AS ENUM ('MILD', 'MODERATE', 'SEVERE', 'LIFE_THREATENING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE allergen_type AS ENUM ('DRUG', 'FOOD', 'ENVIRONMENTAL', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── medications ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "medications" (
  "id"                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "patient_id"              UUID NOT NULL REFERENCES patients(id),
  "location_id"             UUID NOT NULL REFERENCES locations(id),
  -- Drug identity
  "name"                    TEXT NOT NULL,
  "generic_name"            TEXT,
  "brand_name"              TEXT,
  -- Dosing
  "dosage"                  TEXT NOT NULL,
  "route"                   TEXT NOT NULL,
  "frequency"               TEXT NOT NULL,
  "frequency_type"          medication_frequency_type NOT NULL DEFAULT 'SCHEDULED',
  "prn_reason"              TEXT,
  "prn_max_doses_per_day"   TEXT,
  -- Hospice-specific
  "is_comfort_kit"          BOOLEAN NOT NULL DEFAULT FALSE,
  "indication"              TEXT NOT NULL,
  -- Dates
  "start_date"              DATE NOT NULL,
  "end_date"                DATE,
  -- Prescriber + physician order
  "prescriber_id"           UUID REFERENCES users(id),
  "physician_order_id"      UUID,
  -- Status
  "status"                  medication_status NOT NULL DEFAULT 'ACTIVE',
  "discontinued_reason"     TEXT,
  "discontinued_at"         TIMESTAMPTZ,
  "discontinued_by"         UUID REFERENCES users(id),
  -- Controlled substance
  "is_controlled_substance" BOOLEAN NOT NULL DEFAULT FALSE,
  "dea_schedule"            dea_schedule,
  -- Billing
  "medicare_coverage_type"  medicare_coverage_type NOT NULL DEFAULT 'PART_A_RELATED',
  -- Pharmacy coordination
  "pharmacy_name"           TEXT,
  "pharmacy_phone"          TEXT,
  "pharmacy_fax"            TEXT,
  -- Caregiver teaching
  "patient_instructions"    TEXT,
  "teaching_completed"      BOOLEAN NOT NULL DEFAULT FALSE,
  "teaching_completed_at"   TIMESTAMPTZ,
  "teaching_completed_by"   UUID REFERENCES users(id),
  -- Reconciliation
  "reconciled_at"           TIMESTAMPTZ,
  "reconciled_by"           UUID REFERENCES users(id),
  "reconciliation_notes"    TEXT,
  -- Timestamps
  "created_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "medications" ENABLE ROW LEVEL SECURITY;

CREATE POLICY medications_location_read ON "medications"
  FOR SELECT
  USING (location_id = (current_setting('app.current_location_id', TRUE))::UUID);

CREATE POLICY medications_location_write ON "medications"
  FOR INSERT
  WITH CHECK (location_id = (current_setting('app.current_location_id', TRUE))::UUID);

CREATE POLICY medications_location_update ON "medications"
  FOR UPDATE
  USING (location_id = (current_setting('app.current_location_id', TRUE))::UUID);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_medications_patient_status
  ON medications(patient_id, status);
CREATE INDEX IF NOT EXISTS idx_medications_comfort_kit
  ON medications(patient_id, is_comfort_kit);
CREATE INDEX IF NOT EXISTS idx_medications_controlled
  ON medications(patient_id, is_controlled_substance);

-- ── medication_administrations (MAR) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "medication_administrations" (
  "id"                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "medication_id"               UUID NOT NULL REFERENCES medications(id),
  "patient_id"                  UUID NOT NULL REFERENCES patients(id),
  "location_id"                 UUID NOT NULL REFERENCES locations(id),
  "administered_at"             TIMESTAMPTZ NOT NULL,
  "administered_by"             UUID NOT NULL REFERENCES users(id),
  "administration_type"         medication_administration_type NOT NULL,
  "dose_given"                  TEXT,
  "route_given"                 TEXT,
  "omission_reason"             TEXT,
  "effectiveness_rating"        INTEGER CHECK (effectiveness_rating BETWEEN 1 AND 5),
  "adverse_effect_noted"        BOOLEAN NOT NULL DEFAULT FALSE,
  "adverse_effect_description"  TEXT,
  "notes"                       TEXT,
  "created_at"                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "medication_administrations" ENABLE ROW LEVEL SECURITY;

CREATE POLICY med_admin_location_read ON "medication_administrations"
  FOR SELECT
  USING (location_id = (current_setting('app.current_location_id', TRUE))::UUID);

CREATE POLICY med_admin_location_write ON "medication_administrations"
  FOR INSERT
  WITH CHECK (location_id = (current_setting('app.current_location_id', TRUE))::UUID);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_med_admin_medication
  ON medication_administrations(medication_id, administered_at DESC);
CREATE INDEX IF NOT EXISTS idx_med_admin_patient
  ON medication_administrations(patient_id, administered_at DESC);

-- ── patient_allergies ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "patient_allergies" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "patient_id"     UUID NOT NULL REFERENCES patients(id),
  "location_id"    UUID NOT NULL REFERENCES locations(id),
  "allergen"       TEXT NOT NULL,
  "allergen_type"  allergen_type NOT NULL,
  "reaction"       TEXT NOT NULL,
  "severity"       allergy_severity NOT NULL,
  "onset_date"     DATE,
  "documented_by"  UUID NOT NULL REFERENCES users(id),
  "documented_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "is_active"      BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "patient_allergies" ENABLE ROW LEVEL SECURITY;

CREATE POLICY allergies_location_read ON "patient_allergies"
  FOR SELECT
  USING (location_id = (current_setting('app.current_location_id', TRUE))::UUID);

CREATE POLICY allergies_location_write ON "patient_allergies"
  FOR INSERT
  WITH CHECK (location_id = (current_setting('app.current_location_id', TRUE))::UUID);

CREATE POLICY allergies_location_update ON "patient_allergies"
  FOR UPDATE
  USING (location_id = (current_setting('app.current_location_id', TRUE))::UUID);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_patient_allergies_patient_active
  ON patient_allergies(patient_id, is_active);
CREATE INDEX IF NOT EXISTS idx_patient_allergies_drug
  ON patient_allergies(patient_id, allergen_type);

-- ── Down ──────────────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS patient_allergies;
-- DROP TABLE IF EXISTS medication_administrations;
-- DROP TABLE IF EXISTS medications;
-- DROP TYPE IF EXISTS allergen_type;
-- DROP TYPE IF EXISTS allergy_severity;
-- DROP TYPE IF EXISTS medication_administration_type;
-- DROP TYPE IF EXISTS medicare_coverage_type;
-- DROP TYPE IF EXISTS dea_schedule;
-- DROP TYPE IF EXISTS medication_frequency_type;
-- DROP TYPE IF EXISTS medication_status;
