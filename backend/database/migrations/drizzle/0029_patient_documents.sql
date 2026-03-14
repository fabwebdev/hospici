-- Migration 0029: Patient Documents
-- Tables: patient_documents
-- Enums: document_category_enum, document_status_enum

-- ── document_category_enum ────────────────────────────────────────────────────
CREATE TYPE document_category_enum AS ENUM (
  'CERTIFICATION',
  'CONSENT',
  'CLINICAL_NOTE',
  'ORDER',
  'CARE_PLAN',
  'ADVANCE_DIRECTIVE',
  'OTHER'
);

-- ── document_status_enum ──────────────────────────────────────────────────────
CREATE TYPE document_status_enum AS ENUM (
  'ACTIVE',
  'ARCHIVED'
);

-- ── patient_documents ─────────────────────────────────────────────────────────
CREATE TABLE patient_documents (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id           UUID NOT NULL REFERENCES patients(id),
  location_id          UUID NOT NULL REFERENCES locations(id),
  name                 TEXT NOT NULL,
  category             document_category_enum NOT NULL,
  storage_key          TEXT,
  mime_type            TEXT,
  size_bytes           INTEGER,
  status               document_status_enum NOT NULL DEFAULT 'ACTIVE',
  uploaded_by_user_id  UUID REFERENCES users(id),
  signed               BOOLEAN NOT NULL DEFAULT false,
  signed_at            TIMESTAMPTZ,
  signed_by_user_id    UUID REFERENCES users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE patient_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY patient_documents_location_read
  ON patient_documents FOR SELECT
  USING (location_id::text = current_setting('app.current_location_id', true));

CREATE POLICY patient_documents_location_insert
  ON patient_documents FOR INSERT
  WITH CHECK (location_id::text = current_setting('app.current_location_id', true));

CREATE POLICY patient_documents_location_update
  ON patient_documents FOR UPDATE
  USING (location_id::text = current_setting('app.current_location_id', true))
  WITH CHECK (location_id::text = current_setting('app.current_location_id', true));

CREATE INDEX idx_patient_documents_patient_status   ON patient_documents(patient_id, status);
CREATE INDEX idx_patient_documents_patient_category ON patient_documents(patient_id, category);

-- ── Rollback ──────────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS patient_documents;
-- DROP TYPE IF EXISTS document_status_enum;
-- DROP TYPE IF EXISTS document_category_enum;
