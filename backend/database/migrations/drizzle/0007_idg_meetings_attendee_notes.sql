-- Migration: 0007_idg_meetings_attendee_notes.sql
-- Description: Add attendee_notes JSONB + assembled_note TEXT for No-Prep IDG (T2-4)

-- ── Up ────────────────────────────────────────────────────────────────────────

ALTER TABLE idg_meetings
  ADD COLUMN IF NOT EXISTS attendee_notes JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS assembled_note TEXT;

-- Index for fast compliance queries (latest completed meeting per patient)
CREATE INDEX IF NOT EXISTS idx_idg_meetings_patient_status
  ON idg_meetings(patient_id, status, completed_at DESC NULLS LAST);

-- ── Down ──────────────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS idx_idg_meetings_patient_status;
-- ALTER TABLE idg_meetings DROP COLUMN IF EXISTS assembled_note;
-- ALTER TABLE idg_meetings DROP COLUMN IF EXISTS attendee_notes;
