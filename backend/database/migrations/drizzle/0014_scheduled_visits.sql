-- 0014_scheduled_visits.sql
-- Visit scheduling + frequency tracking — T2-10.
-- Adds `visit_status` enum, `scheduled_visits` table, and two new
-- alert types (MISSED_VISIT, VISIT_FREQUENCY_VARIANCE) to alert_type_enum.
--
-- BullMQ `missed-visit-check` worker runs daily at 06:00 UTC to:
--   1. Mark stale 'scheduled' rows as 'missed'.
--   2. Upsert MISSED_VISIT compliance alert.
--   3. Compute weekly frequency variance and upsert VISIT_FREQUENCY_VARIANCE alert.
--
-- Down migration:
--   DROP TABLE IF EXISTS scheduled_visits;
--   DROP TYPE IF EXISTS visit_status;
--   -- Cannot remove enum values from alert_type_enum in Postgres without recreating it.

-- ── visit_status enum ─────────────────────────────────────────────────────────

CREATE TYPE visit_status AS ENUM (
  'scheduled',
  'completed',
  'missed',
  'cancelled'
);

-- ── scheduled_visits table ────────────────────────────────────────────────────

CREATE TABLE scheduled_visits (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id     UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  location_id    UUID        NOT NULL REFERENCES locations(id),
  clinician_id   UUID        REFERENCES users(id) ON DELETE SET NULL,

  -- visit_type reuses the existing `visit_type` enum from encounters
  visit_type     visit_type  NOT NULL,

  -- discipline matches DisciplineType in shared-types: RN|SW|CHAPLAIN|THERAPY|AIDE
  discipline     TEXT        NOT NULL,

  -- Calendar date the visit is scheduled for
  scheduled_date DATE        NOT NULL,

  -- Frequency plan captured from the active care plan at scheduling time
  -- { visitsPerWeek: number, notes?: string }
  frequency_plan JSONB       NOT NULL DEFAULT '{}',

  status         visit_status NOT NULL DEFAULT 'scheduled',

  completed_at   TIMESTAMPTZ,
  cancelled_at   TIMESTAMPTZ,
  missed_reason  TEXT,
  notes          TEXT,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX idx_scheduled_visits_patient_id
  ON scheduled_visits (patient_id);

CREATE INDEX idx_scheduled_visits_location_id
  ON scheduled_visits (location_id);

-- Missed-visit worker scans this index daily
CREATE INDEX idx_scheduled_visits_status_date
  ON scheduled_visits (status, scheduled_date)
  WHERE status = 'scheduled';

CREATE INDEX idx_scheduled_visits_clinician
  ON scheduled_visits (clinician_id, scheduled_date)
  WHERE clinician_id IS NOT NULL;

-- ── Row-Level Security ────────────────────────────────────────────────────────

ALTER TABLE scheduled_visits ENABLE ROW LEVEL SECURITY;

-- Clinicians/admins in the same location can read
CREATE POLICY scheduled_visits_location_read
  ON scheduled_visits
  FOR SELECT
  USING (
    location_id = current_setting('app.current_location_id', true)::UUID
  );

-- Any authenticated user in the location can insert
CREATE POLICY scheduled_visits_location_insert
  ON scheduled_visits
  FOR INSERT
  WITH CHECK (
    location_id = current_setting('app.current_location_id', true)::UUID
  );

-- Only the assigned clinician or admin/super_admin can update
CREATE POLICY scheduled_visits_owner_or_admin_update
  ON scheduled_visits
  FOR UPDATE
  USING (
    location_id = current_setting('app.current_location_id', true)::UUID
    AND (
      clinician_id = current_setting('app.current_user_id', true)::UUID
      OR current_setting('app.current_role', true) IN ('admin', 'super_admin')
    )
  );

-- ── Alert type additions ──────────────────────────────────────────────────────
-- Postgres requires separate ALTER TYPE statements per value.

ALTER TYPE alert_type_enum ADD VALUE IF NOT EXISTS 'MISSED_VISIT';
ALTER TYPE alert_type_enum ADD VALUE IF NOT EXISTS 'VISIT_FREQUENCY_VARIANCE';
