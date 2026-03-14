-- Migration 0030: Care Team Members
-- Table: care_team_members
-- Enum: care_team_discipline_enum

-- ── care_team_discipline_enum ─────────────────────────────────────────────────
CREATE TYPE care_team_discipline_enum AS ENUM (
  'PHYSICIAN',
  'RN',
  'SW',
  'CHAPLAIN',
  'AIDE',
  'VOLUNTEER',
  'BEREAVEMENT',
  'THERAPIST'
);

-- ── care_team_members ─────────────────────────────────────────────────────────
CREATE TABLE care_team_members (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id           UUID NOT NULL REFERENCES patients(id),
  location_id          UUID NOT NULL REFERENCES locations(id),
  user_id              UUID REFERENCES users(id),
  name                 TEXT NOT NULL,
  discipline           care_team_discipline_enum NOT NULL,
  role                 TEXT NOT NULL,
  phone                TEXT,
  email                TEXT,
  is_primary_contact   BOOLEAN NOT NULL DEFAULT false,
  is_on_call           BOOLEAN NOT NULL DEFAULT false,
  assigned_by_user_id  UUID REFERENCES users(id),
  assigned_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  unassigned_at        TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE care_team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY care_team_members_location_read
  ON care_team_members FOR SELECT
  USING (location_id::text = current_setting('app.current_location_id', true));

CREATE POLICY care_team_members_location_insert
  ON care_team_members FOR INSERT
  WITH CHECK (location_id::text = current_setting('app.current_location_id', true));

CREATE POLICY care_team_members_location_update
  ON care_team_members FOR UPDATE
  USING (location_id::text = current_setting('app.current_location_id', true))
  WITH CHECK (location_id::text = current_setting('app.current_location_id', true));

CREATE INDEX idx_care_team_members_patient_active
  ON care_team_members(patient_id)
  WHERE unassigned_at IS NULL;

-- ── Rollback ──────────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS care_team_members;
-- DROP TYPE IF EXISTS care_team_discipline_enum;
