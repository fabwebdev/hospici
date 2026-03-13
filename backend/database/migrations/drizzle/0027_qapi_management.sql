-- Migration 0027: T3-11 QAPI Management + Clinician Quality Scorecards
-- Tables: qapi_events, qapi_action_items
-- Alert types: QAPI_ACTION_OVERDUE, FIRST_PASS_DECLINE, BILLING_DEFICIENCY_RISING, COMPLIANCE_DEFICIENCY_RISING

-- ── New alert type enum values ────────────────────────────────────────────────
ALTER TYPE alert_type_enum ADD VALUE IF NOT EXISTS 'QAPI_ACTION_OVERDUE';
ALTER TYPE alert_type_enum ADD VALUE IF NOT EXISTS 'FIRST_PASS_DECLINE';
ALTER TYPE alert_type_enum ADD VALUE IF NOT EXISTS 'BILLING_DEFICIENCY_RISING';
ALTER TYPE alert_type_enum ADD VALUE IF NOT EXISTS 'COMPLIANCE_DEFICIENCY_RISING';

-- ── QAPI event type enum ──────────────────────────────────────────────────────
CREATE TYPE qapi_event_type_enum AS ENUM (
  'ADVERSE_EVENT',
  'NEAR_MISS',
  'COMPLAINT',
  'GRIEVANCE',
  'QUALITY_TREND'
);

-- ── QAPI event status enum ────────────────────────────────────────────────────
CREATE TYPE qapi_event_status_enum AS ENUM (
  'OPEN',
  'IN_PROGRESS',
  'CLOSED'
);

-- ── qapi_events ───────────────────────────────────────────────────────────────
CREATE TABLE qapi_events (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id          UUID NOT NULL REFERENCES locations(id),
  event_type           qapi_event_type_enum NOT NULL,
  patient_id           UUID REFERENCES patients(id),
  reported_by_id       UUID NOT NULL REFERENCES users(id),
  occurred_at          TIMESTAMPTZ NOT NULL,
  description          TEXT NOT NULL,
  root_cause_analysis  TEXT,
  linked_trend_context JSONB,
  status               qapi_event_status_enum NOT NULL DEFAULT 'OPEN',
  closed_at            TIMESTAMPTZ,
  closed_by_id         UUID REFERENCES users(id),
  closure_evidence     TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE qapi_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY qapi_events_location_read
  ON qapi_events FOR SELECT
  USING (location_id::text = current_setting('app.current_location_id', true));

CREATE POLICY qapi_events_location_insert
  ON qapi_events FOR INSERT
  WITH CHECK (location_id::text = current_setting('app.current_location_id', true));

-- Immutability: closed events cannot be updated
CREATE POLICY qapi_events_location_update
  ON qapi_events FOR UPDATE
  USING (
    location_id::text = current_setting('app.current_location_id', true)
    AND status != 'CLOSED'
  )
  WITH CHECK (
    location_id::text = current_setting('app.current_location_id', true)
  );

CREATE INDEX idx_qapi_events_location_id    ON qapi_events(location_id);
CREATE INDEX idx_qapi_events_status         ON qapi_events(status);
CREATE INDEX idx_qapi_events_patient_id     ON qapi_events(patient_id);
CREATE INDEX idx_qapi_events_reported_by_id ON qapi_events(reported_by_id);
CREATE INDEX idx_qapi_events_occurred_at    ON qapi_events(occurred_at);

-- ── qapi_action_items ─────────────────────────────────────────────────────────
CREATE TABLE qapi_action_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         UUID NOT NULL REFERENCES qapi_events(id) ON DELETE CASCADE,
  location_id      UUID NOT NULL REFERENCES locations(id),
  action           TEXT NOT NULL,
  assigned_to_id   UUID NOT NULL REFERENCES users(id),
  due_date         DATE NOT NULL,
  completed_at     TIMESTAMPTZ,
  completed_by_id  UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE qapi_action_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY qapi_action_items_location_read
  ON qapi_action_items FOR SELECT
  USING (location_id::text = current_setting('app.current_location_id', true));

CREATE POLICY qapi_action_items_location_insert
  ON qapi_action_items FOR INSERT
  WITH CHECK (location_id::text = current_setting('app.current_location_id', true));

CREATE POLICY qapi_action_items_location_update
  ON qapi_action_items FOR UPDATE
  USING (location_id::text = current_setting('app.current_location_id', true))
  WITH CHECK (location_id::text = current_setting('app.current_location_id', true));

CREATE INDEX idx_qapi_action_items_event_id    ON qapi_action_items(event_id);
CREATE INDEX idx_qapi_action_items_location_id ON qapi_action_items(location_id);
CREATE INDEX idx_qapi_action_items_due_date    ON qapi_action_items(due_date);
CREATE INDEX idx_qapi_action_items_assigned_to ON qapi_action_items(assigned_to_id);

-- ── Rollback ──────────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS qapi_action_items;
-- DROP TABLE IF EXISTS qapi_events;
-- DROP TYPE IF EXISTS qapi_event_status_enum;
-- DROP TYPE IF EXISTS qapi_event_type_enum;
