-- Migration 0031: Team Communications
-- Tables: team_comm_threads, team_comm_messages

-- ── team_comm_threads ─────────────────────────────────────────────────────────
CREATE TABLE team_comm_threads (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id           UUID NOT NULL REFERENCES patients(id),
  location_id          UUID NOT NULL REFERENCES locations(id),
  subject              TEXT NOT NULL,
  created_by_user_id   UUID REFERENCES users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE team_comm_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY team_comm_threads_location_read
  ON team_comm_threads FOR SELECT
  USING (location_id::text = current_setting('app.current_location_id', true));

CREATE POLICY team_comm_threads_location_insert
  ON team_comm_threads FOR INSERT
  WITH CHECK (location_id::text = current_setting('app.current_location_id', true));

CREATE POLICY team_comm_threads_location_update
  ON team_comm_threads FOR UPDATE
  USING (location_id::text = current_setting('app.current_location_id', true))
  WITH CHECK (location_id::text = current_setting('app.current_location_id', true));

CREATE INDEX idx_team_comm_threads_patient_id ON team_comm_threads(patient_id);

-- ── team_comm_messages ────────────────────────────────────────────────────────
CREATE TABLE team_comm_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id       UUID NOT NULL REFERENCES team_comm_threads(id),
  patient_id      UUID NOT NULL REFERENCES patients(id),
  location_id     UUID NOT NULL REFERENCES locations(id),
  author_user_id  UUID REFERENCES users(id),
  body            TEXT NOT NULL,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE team_comm_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY team_comm_messages_location_read
  ON team_comm_messages FOR SELECT
  USING (location_id::text = current_setting('app.current_location_id', true));

CREATE POLICY team_comm_messages_location_insert
  ON team_comm_messages FOR INSERT
  WITH CHECK (location_id::text = current_setting('app.current_location_id', true));

CREATE POLICY team_comm_messages_location_update
  ON team_comm_messages FOR UPDATE
  USING (location_id::text = current_setting('app.current_location_id', true))
  WITH CHECK (location_id::text = current_setting('app.current_location_id', true));

CREATE INDEX idx_team_comm_messages_thread_sent ON team_comm_messages(thread_id, sent_at);

-- ── Rollback ──────────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS team_comm_messages;
-- DROP TABLE IF EXISTS team_comm_threads;
