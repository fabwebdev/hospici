-- 0015_hope_tables.sql
-- HOPE Infrastructure + Validation Engine (T3-1a)
-- Creates 4 tables for CMS quality reporting: hope_assessments,
-- hope_iqies_submissions, hope_reporting_periods, hope_quality_measures.
-- All tables have RLS policies enforced by location_id.
--
-- 42 CFR §418.312 — Non-submission = 2% Medicare payment reduction (HQRP penalty)
-- Replaces HIS effective October 1, 2025.

-- ── Enums ─────────────────────────────────────────────────────────────────────

CREATE TYPE hope_assessment_status AS ENUM (
  'draft',
  'in_progress',
  'ready_for_review',
  'approved_for_submission',
  'submitted',
  'accepted',
  'rejected',
  'needs_correction'
);

CREATE TYPE hope_submission_status AS ENUM (
  'pending',
  'accepted',
  'rejected',
  'correction_pending'
);

CREATE TYPE hope_correction_type AS ENUM (
  'none',
  'modification',
  'inactivation'
);

CREATE TYPE hope_measure_code AS ENUM (
  'NQF3235',
  'NQF3633',
  'NQF3634A',
  'NQF3634B',
  'HCI'
);

-- ── hope_assessments ──────────────────────────────────────────────────────────

CREATE TABLE hope_assessments (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id               UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  location_id              UUID NOT NULL REFERENCES locations(id),
  assessment_type          VARCHAR(2) NOT NULL CHECK (assessment_type IN ('01', '02', '03')),
  assessment_date          DATE NOT NULL,
  election_date            DATE NOT NULL,
  -- window_start: electionDate for A/D; visitDate for UV (stored as assessmentDate for UV)
  window_start             DATE NOT NULL,
  -- window_deadline: window_start + 7 days for A and D; same-day for UV
  window_deadline          DATE NOT NULL,
  assigned_clinician_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  status                   hope_assessment_status NOT NULL DEFAULT 'draft',
  completeness_score       INTEGER NOT NULL DEFAULT 0 CHECK (completeness_score BETWEEN 0 AND 100),
  fatal_error_count        INTEGER NOT NULL DEFAULT 0 CHECK (fatal_error_count >= 0),
  warning_count            INTEGER NOT NULL DEFAULT 0 CHECK (warning_count >= 0),
  symptom_follow_up_required BOOLEAN NOT NULL DEFAULT FALSE,
  symptom_follow_up_due_at DATE,
  -- Full TypeBox-validated HOPE clinical payload (HOPE-A / UV / D sections)
  data                     JSONB NOT NULL DEFAULT '{}',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE hope_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY hope_assessments_location_read ON hope_assessments
  FOR SELECT USING (location_id = current_setting('app.current_location_id', TRUE)::uuid);

CREATE POLICY hope_assessments_location_insert ON hope_assessments
  FOR INSERT WITH CHECK (location_id = current_setting('app.current_location_id', TRUE)::uuid);

CREATE POLICY hope_assessments_location_update ON hope_assessments
  FOR UPDATE USING (location_id = current_setting('app.current_location_id', TRUE)::uuid);

CREATE INDEX idx_hope_assessments_patient_id    ON hope_assessments (patient_id);
CREATE INDEX idx_hope_assessments_location_id   ON hope_assessments (location_id);
CREATE INDEX idx_hope_assessments_status        ON hope_assessments (status, assessment_type);
CREATE INDEX idx_hope_assessments_clinician     ON hope_assessments (assigned_clinician_id);
CREATE INDEX idx_hope_assessments_window        ON hope_assessments (window_deadline, status)
  WHERE status IN ('draft', 'in_progress', 'ready_for_review');

-- ── hope_iqies_submissions ────────────────────────────────────────────────────

CREATE TABLE hope_iqies_submissions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id          UUID NOT NULL REFERENCES hope_assessments(id) ON DELETE CASCADE,
  location_id            UUID NOT NULL REFERENCES locations(id),
  -- 1-indexed; >1 means retry or correction attempt
  attempt_number         INTEGER NOT NULL DEFAULT 1 CHECK (attempt_number >= 1),
  submitted_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  response_received_at   TIMESTAMPTZ,
  -- iQIES-assigned tracking identifier
  tracking_id            VARCHAR(100),
  submitted_by_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  submission_status      hope_submission_status NOT NULL DEFAULT 'pending',
  correction_type        hope_correction_type NOT NULL DEFAULT 'none',
  -- iQIES error codes: A0310A_INVALID, WINDOW_VIOLATION, DUPLICATE_SUBMISSION, etc.
  rejection_codes        TEXT[] NOT NULL DEFAULT '{}',
  rejection_details      TEXT,
  -- SHA-256 of submitted XML — tamper-evident audit trail
  payload_hash           VARCHAR(64) NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE hope_iqies_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY hope_iqies_submissions_location_read ON hope_iqies_submissions
  FOR SELECT USING (location_id = current_setting('app.current_location_id', TRUE)::uuid);

CREATE POLICY hope_iqies_submissions_location_insert ON hope_iqies_submissions
  FOR INSERT WITH CHECK (location_id = current_setting('app.current_location_id', TRUE)::uuid);

CREATE POLICY hope_iqies_submissions_location_update ON hope_iqies_submissions
  FOR UPDATE USING (location_id = current_setting('app.current_location_id', TRUE)::uuid);

CREATE INDEX idx_hope_submissions_assessment ON hope_iqies_submissions (assessment_id);
CREATE INDEX idx_hope_submissions_location   ON hope_iqies_submissions (location_id, submission_status);
CREATE INDEX idx_hope_submissions_status     ON hope_iqies_submissions (submission_status, submitted_at);

-- ── hope_reporting_periods ────────────────────────────────────────────────────

CREATE TABLE hope_reporting_periods (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id          UUID NOT NULL REFERENCES locations(id),
  calendar_year        INTEGER NOT NULL CHECK (calendar_year >= 2025),
  quarter              INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  period_start         DATE NOT NULL,
  period_end           DATE NOT NULL,
  submission_deadline  DATE NOT NULL,
  status               VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'submitted', 'closed')),
  penalty_applied      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (location_id, calendar_year, quarter)
);

ALTER TABLE hope_reporting_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY hope_reporting_periods_location_read ON hope_reporting_periods
  FOR SELECT USING (location_id = current_setting('app.current_location_id', TRUE)::uuid);

CREATE POLICY hope_reporting_periods_location_insert ON hope_reporting_periods
  FOR INSERT WITH CHECK (location_id = current_setting('app.current_location_id', TRUE)::uuid);

CREATE POLICY hope_reporting_periods_location_update ON hope_reporting_periods
  FOR UPDATE USING (location_id = current_setting('app.current_location_id', TRUE)::uuid);

CREATE INDEX idx_hope_periods_location ON hope_reporting_periods (location_id, calendar_year, quarter);

-- ── hope_quality_measures ─────────────────────────────────────────────────────

CREATE TABLE hope_quality_measures (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id          UUID NOT NULL REFERENCES locations(id),
  reporting_period_id  UUID NOT NULL REFERENCES hope_reporting_periods(id) ON DELETE CASCADE,
  measure_code         hope_measure_code NOT NULL,
  numerator            INTEGER NOT NULL DEFAULT 0 CHECK (numerator >= 0),
  denominator          INTEGER NOT NULL DEFAULT 0 CHECK (denominator >= 0),
  -- rate = numerator / denominator * 100 (stored as 0-100 percent)
  rate                 NUMERIC(5, 2),
  -- CMS national average for benchmarking (seeded static, updated quarterly)
  national_average     NUMERIC(5, 2),
  target_rate          NUMERIC(5, 2),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (reporting_period_id, measure_code)
);

ALTER TABLE hope_quality_measures ENABLE ROW LEVEL SECURITY;

CREATE POLICY hope_quality_measures_location_read ON hope_quality_measures
  FOR SELECT USING (location_id = current_setting('app.current_location_id', TRUE)::uuid);

CREATE POLICY hope_quality_measures_location_insert ON hope_quality_measures
  FOR INSERT WITH CHECK (location_id = current_setting('app.current_location_id', TRUE)::uuid);

CREATE POLICY hope_quality_measures_location_update ON hope_quality_measures
  FOR UPDATE USING (location_id = current_setting('app.current_location_id', TRUE)::uuid);

CREATE INDEX idx_hope_measures_period   ON hope_quality_measures (reporting_period_id);
CREATE INDEX idx_hope_measures_location ON hope_quality_measures (location_id, measure_code);

-- ── Down migration ─────────────────────────────────────────────────────────────
-- To rollback:
-- DROP TABLE IF EXISTS hope_quality_measures CASCADE;
-- DROP TABLE IF EXISTS hope_reporting_periods CASCADE;
-- DROP TABLE IF EXISTS hope_iqies_submissions CASCADE;
-- DROP TABLE IF EXISTS hope_assessments CASCADE;
-- DROP TYPE IF EXISTS hope_measure_code;
-- DROP TYPE IF EXISTS hope_correction_type;
-- DROP TYPE IF EXISTS hope_submission_status;
-- DROP TYPE IF EXISTS hope_assessment_status;
