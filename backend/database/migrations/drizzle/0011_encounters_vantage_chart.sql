-- Migration 0011 — encounters table + VantageChart fields
-- Every hospice visit (encounter) is recorded here.
-- VantageChart narrative fields are included from day 1.
-- Note-review fields (review_status, reviewer_id, etc.) are added in T2-9.

-- ── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE visit_type AS ENUM (
  'routine_rn',
  'admission',
  'recertification',
  'supervisory',
  'prn',
  'discharge'
);

CREATE TYPE encounter_status AS ENUM (
  'DRAFT',
  'COMPLETED',
  'SIGNED'
);

CREATE TYPE vantage_chart_method AS ENUM (
  'TEMPLATE',
  'LLM'
);

-- ── encounters ────────────────────────────────────────────────────────────────

CREATE TABLE encounters (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id                   UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  location_id                  UUID NOT NULL REFERENCES locations(id),
  clinician_id                 UUID NOT NULL REFERENCES users(id),
  visit_type                   visit_type NOT NULL,
  status                       encounter_status NOT NULL DEFAULT 'DRAFT',

  -- Structured input captured via VantageChart steps (JSONB)
  data                         JSONB,

  -- VantageChart narrative fields
  vantage_chart_draft          TEXT,
  vantage_chart_method         vantage_chart_method,
  vantage_chart_accepted_at    TIMESTAMPTZ,
  vantage_chart_traceability   JSONB,

  visited_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX idx_encounters_patient_id     ON encounters(patient_id);
CREATE INDEX idx_encounters_location_id    ON encounters(location_id);
CREATE INDEX idx_encounters_clinician_id   ON encounters(clinician_id);
CREATE INDEX idx_encounters_visited_at     ON encounters(visited_at DESC);
CREATE INDEX idx_encounters_status         ON encounters(status);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE encounters ENABLE ROW LEVEL SECURITY;

-- Read: same location
CREATE POLICY encounters_location_read ON encounters
  FOR SELECT
  USING (location_id = current_setting('app.current_location_id', true)::uuid);

-- Insert: same location
CREATE POLICY encounters_location_insert ON encounters
  FOR INSERT
  WITH CHECK (location_id = current_setting('app.current_location_id', true)::uuid);

-- Update: clinician owns it OR admin/supervisor/don role
CREATE POLICY encounters_owner_or_admin_update ON encounters
  FOR UPDATE
  USING (
    location_id = current_setting('app.current_location_id', true)::uuid
    AND (
      clinician_id = current_setting('app.current_user_id', true)::uuid
      OR current_setting('app.current_role', true) IN ('admin', 'supervisor', 'don')
    )
  );

-- ── Down Migration ────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS encounters;
-- DROP TYPE IF EXISTS vantage_chart_method;
-- DROP TYPE IF EXISTS encounter_status;
-- DROP TYPE IF EXISTS visit_type;
