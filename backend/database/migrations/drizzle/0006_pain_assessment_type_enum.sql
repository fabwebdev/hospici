-- Migration: 0006_pain_assessment_type_enum.sql
-- Description: Add assessment_scale_type enum, migrate pain_assessments column, add trajectory index

-- ── Up ────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE assessment_scale_type AS ENUM ('FLACC', 'PAINAD', 'NRS', 'WONG_BAKER', 'ESAS');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE pain_assessments
  ALTER COLUMN assessment_type TYPE assessment_scale_type
  USING assessment_type::assessment_scale_type;

-- Composite index for trajectory time-series queries (patient + chronological order)
CREATE INDEX IF NOT EXISTS idx_pain_assessments_patient_time
  ON pain_assessments(patient_id, assessed_at ASC);

-- ── Down ──────────────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS idx_pain_assessments_patient_time;
-- ALTER TABLE pain_assessments ALTER COLUMN assessment_type TYPE VARCHAR(50) USING assessment_type::VARCHAR;
-- DROP TYPE IF EXISTS assessment_scale_type;
