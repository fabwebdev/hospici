-- Migration: 0005_add_care_model_to_patients.sql
-- Description: Add care_model enum and column to patients table

-- ── Up ────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE care_model AS ENUM ('HOSPICE', 'PALLIATIVE', 'CCM');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS care_model care_model NOT NULL DEFAULT 'HOSPICE';

-- ── Down ──────────────────────────────────────────────────────────────────────
-- ALTER TABLE patients DROP COLUMN IF EXISTS care_model;
-- DROP TYPE IF EXISTS care_model;
