-- Migration 0026: ADR / TPE / Survey Record Packet Export (T3-10)
-- Creates audit_record_exports table with RLS policies.

-- ── Up migration ──────────────────────────────────────────────────────────────

CREATE TYPE export_purpose_enum AS ENUM (
  'ADR',
  'TPE',
  'SURVEY',
  'LEGAL',
  'PAYER_REQUEST'
);

CREATE TYPE export_status_enum AS ENUM (
  'REQUESTED',
  'GENERATING',
  'READY',
  'EXPORTED',
  'FAILED'
);

CREATE TABLE audit_record_exports (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id                  UUID        NOT NULL REFERENCES patients(id)  ON DELETE RESTRICT,
  location_id                 UUID        NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  requested_by_user_id        UUID        NOT NULL REFERENCES users(id)     ON DELETE RESTRICT,
  purpose                     export_purpose_enum NOT NULL,
  status                      export_status_enum  NOT NULL DEFAULT 'REQUESTED',
  date_range_from             DATE        NOT NULL,
  date_range_to               DATE        NOT NULL,
  selected_sections           TEXT[]      NOT NULL DEFAULT '{}',
  include_audit_log           BOOLEAN     NOT NULL DEFAULT FALSE,
  include_completeness_summary BOOLEAN   NOT NULL DEFAULT FALSE,
  export_hash                 VARCHAR(64),
  manifest_json               JSONB,
  pdf_storage_key             VARCHAR(500),
  zip_storage_key             VARCHAR(500),
  generation_started_at       TIMESTAMPTZ,
  generation_completed_at     TIMESTAMPTZ,
  exported_at                 TIMESTAMPTZ,
  error_message               TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX idx_audit_record_exports_patient_created
  ON audit_record_exports (patient_id, created_at DESC);

CREATE INDEX idx_audit_record_exports_location_status
  ON audit_record_exports (location_id, status);

CREATE INDEX idx_audit_record_exports_requested_by
  ON audit_record_exports (requested_by_user_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE audit_record_exports ENABLE ROW LEVEL SECURITY;

-- SELECT: any authenticated member of the location may read export records.
CREATE POLICY audit_record_exports_location_read
  ON audit_record_exports
  FOR SELECT
  USING (
    location_id = (
      SELECT location_id FROM users
      WHERE id = current_setting('app.current_user_id', true)::uuid
    )
  );

-- INSERT: compliance_officer and super_admin only.
CREATE POLICY audit_record_exports_location_insert
  ON audit_record_exports
  FOR INSERT
  WITH CHECK (
    location_id = (
      SELECT location_id FROM users
      WHERE id = current_setting('app.current_user_id', true)::uuid
    )
    AND (
      SELECT abac_attributes->>'role' FROM users
      WHERE id = current_setting('app.current_user_id', true)::uuid
    ) IN ('compliance_officer', 'super_admin')
  );

-- UPDATE: compliance_officer and super_admin only (for status transitions).
CREATE POLICY audit_record_exports_location_update
  ON audit_record_exports
  FOR UPDATE
  USING (
    location_id = (
      SELECT location_id FROM users
      WHERE id = current_setting('app.current_user_id', true)::uuid
    )
    AND (
      SELECT abac_attributes->>'role' FROM users
      WHERE id = current_setting('app.current_user_id', true)::uuid
    ) IN ('compliance_officer', 'super_admin')
  );

-- ── Down migration ────────────────────────────────────────────────────────────

-- DROP TABLE audit_record_exports;
-- DROP TYPE export_status_enum;
-- DROP TYPE export_purpose_enum;
