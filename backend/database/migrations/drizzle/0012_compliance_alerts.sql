-- 0012_compliance_alerts.sql
-- Compliance alert dashboard — persisted alert records with escalation state.
-- T2-8: All 10 operational alert types, Valkey-cached, Socket.IO-pushed.
--
-- Down migration:
--   DROP TABLE IF EXISTS compliance_alerts;
--   DROP TYPE IF EXISTS alert_status_enum;
--   DROP TYPE IF EXISTS alert_severity_enum;
--   DROP TYPE IF EXISTS alert_type_enum;

-- ── Enums ─────────────────────────────────────────────────────────────────────

CREATE TYPE alert_type_enum AS ENUM (
  'NOE_DEADLINE',
  'NOTR_DEADLINE',
  'IDG_OVERDUE',
  'AIDE_SUPERVISION_OVERDUE',
  'AIDE_SUPERVISION_UPCOMING',
  'HOPE_WINDOW_CLOSING',
  'F2F_REQUIRED',
  'CAP_THRESHOLD',
  'BENEFIT_PERIOD_EXPIRING',
  'RECERTIFICATION_DUE'
);

CREATE TYPE alert_severity_enum AS ENUM ('critical', 'warning', 'info');
CREATE TYPE alert_status_enum AS ENUM ('new', 'acknowledged', 'assigned', 'resolved');

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE compliance_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id     UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  type            alert_type_enum NOT NULL,
  severity        alert_severity_enum NOT NULL,
  patient_name    TEXT NOT NULL,           -- PHI — encrypted at rest via pgcrypto
  due_date        DATE,
  days_remaining  INTEGER NOT NULL DEFAULT 0,
  description     TEXT NOT NULL,
  root_cause      TEXT NOT NULL,
  next_action     TEXT NOT NULL,
  status          alert_status_enum NOT NULL DEFAULT 'new',
  assigned_to     UUID REFERENCES users(id) ON DELETE SET NULL,
  snoozed_until   DATE,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: one active alert per (patient, type) — upsert by these keys
CREATE UNIQUE INDEX compliance_alerts_patient_type_active_idx
  ON compliance_alerts (patient_id, type)
  WHERE status != 'resolved';

-- Partial index on unresolved alerts (primary dashboard query path)
CREATE INDEX compliance_alerts_active_location_idx
  ON compliance_alerts (location_id, severity, status)
  WHERE status != 'resolved';

-- Work queue index: filter by assignee
CREATE INDEX compliance_alerts_assigned_idx
  ON compliance_alerts (assigned_to, status)
  WHERE status != 'resolved' AND assigned_to IS NOT NULL;

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE compliance_alerts ENABLE ROW LEVEL SECURITY;

-- Location-scoped read
CREATE POLICY compliance_alerts_location_read ON compliance_alerts
  FOR SELECT
  USING (location_id = current_setting('app.current_location_id', true)::UUID);

-- Location-scoped insert
CREATE POLICY compliance_alerts_location_insert ON compliance_alerts
  FOR INSERT
  WITH CHECK (location_id = current_setting('app.current_location_id', true)::UUID);

-- Location-scoped update (acknowledge, assign, snooze, resolve)
CREATE POLICY compliance_alerts_location_update ON compliance_alerts
  FOR UPDATE
  USING (location_id = current_setting('app.current_location_id', true)::UUID);

-- Super admin bypass — read/write across all locations
CREATE POLICY compliance_alerts_super_admin ON compliance_alerts
  USING (current_setting('app.current_role', true) = 'super_admin');
