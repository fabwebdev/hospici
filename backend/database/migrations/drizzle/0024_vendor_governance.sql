-- Migration: 0024_vendor_governance.sql
-- T3-8: Vendor Governance + BAA Registry + Security Hardening
-- Creates vendors + vendor_reviews tables, 3 new enums, immutable audit_log trigger,
-- and extends alert_type_enum with BAA compliance types.

-- ── UP ────────────────────────────────────────────────────────────────────────

-- New alert_type_enum values (vendor governance)
ALTER TYPE alert_type_enum ADD VALUE IF NOT EXISTS 'BAA_EXPIRING';
ALTER TYPE alert_type_enum ADD VALUE IF NOT EXISTS 'BAA_MISSING';
ALTER TYPE alert_type_enum ADD VALUE IF NOT EXISTS 'SECURITY_REVIEW_OVERDUE';

-- New enums
CREATE TYPE baa_status AS ENUM ('SIGNED', 'PENDING', 'NOT_REQUIRED', 'EXPIRED', 'SUSPENDED');
CREATE TYPE vendor_service_category AS ENUM ('INFRASTRUCTURE', 'CLINICAL', 'BILLING', 'COMMUNICATION', 'AI_ML', 'IDENTITY', 'STORAGE', 'MONITORING', 'OTHER');
CREATE TYPE phi_exposure_level AS ENUM ('NONE', 'INDIRECT', 'DIRECT', 'STORES_PHI');

-- ── vendors ──────────────────────────────────────────────────────────────────
CREATE TABLE vendors (
  id                        uuid                    PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id               uuid                    NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  vendor_name               text                    NOT NULL,
  service_category          vendor_service_category NOT NULL,
  description               text                    NOT NULL DEFAULT '',
  phi_exposure_level        phi_exposure_level      NOT NULL DEFAULT 'NONE',
  transmits_phi             boolean                 NOT NULL DEFAULT false,
  stores_phi                boolean                 NOT NULL DEFAULT false,
  subprocessor              boolean                 NOT NULL DEFAULT false,
  baa_required              boolean                 NOT NULL DEFAULT false,
  baa_status                baa_status              NOT NULL DEFAULT 'PENDING',
  baa_effective_date        date,
  baa_renewal_date          date,
  contract_owner_user_id    uuid                    REFERENCES users(id) ON DELETE SET NULL,
  security_owner_user_id    uuid                    REFERENCES users(id) ON DELETE SET NULL,
  security_review_date      date,
  security_review_due_date  date,
  incident_contact          text,
  data_residency            text,
  exit_plan                 text,
  notes                     text,
  is_active                 boolean                 NOT NULL DEFAULT true,
  created_at                timestamptz             NOT NULL DEFAULT now(),
  updated_at                timestamptz             NOT NULL DEFAULT now()
);

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

-- compliance_officer + super_admin: full write access
CREATE POLICY vendors_compliance_write ON vendors
  USING (
    current_setting('app.current_role', true) IN ('compliance_officer', 'super_admin')
  )
  WITH CHECK (
    current_setting('app.current_role', true) IN ('compliance_officer', 'super_admin')
  );

-- admin: read-only
CREATE POLICY vendors_admin_read ON vendors
  FOR SELECT
  USING (
    current_setting('app.current_role', true) = 'admin'
  );

-- ── vendor_reviews ────────────────────────────────────────────────────────────
CREATE TABLE vendor_reviews (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id             uuid        NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  location_id           uuid        NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  reviewed_by_user_id   uuid        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  review_date           date        NOT NULL,
  outcome               text        NOT NULL CHECK (outcome IN ('APPROVED', 'APPROVED_WITH_CONDITIONS', 'SUSPENDED', 'TERMINATED')),
  baa_status_at_review  baa_status  NOT NULL,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vendor_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY vendor_reviews_compliance_write ON vendor_reviews
  USING (
    current_setting('app.current_role', true) IN ('compliance_officer', 'super_admin')
  )
  WITH CHECK (
    current_setting('app.current_role', true) IN ('compliance_officer', 'super_admin')
  );

CREATE POLICY vendor_reviews_admin_read ON vendor_reviews
  FOR SELECT
  USING (
    current_setting('app.current_role', true) = 'admin'
  );

-- ── Audit log immutability trigger ───────────────────────────────────────────
-- HIPAA §164.312(b): audit logs must be append-only.
-- This trigger prevents UPDATE and DELETE on audit_logs at the DB level.
CREATE OR REPLACE FUNCTION audit_logs_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: UPDATE and DELETE are not permitted (HIPAA §164.312(b))';
END;
$$;

CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();

CREATE TRIGGER audit_logs_no_delete
  BEFORE DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX vendors_location_id_idx ON vendors(location_id);
CREATE INDEX vendors_baa_status_idx ON vendors(baa_status);
CREATE INDEX vendors_baa_renewal_date_idx ON vendors(baa_renewal_date) WHERE baa_renewal_date IS NOT NULL;
CREATE INDEX vendors_service_category_idx ON vendors(service_category);
CREATE INDEX vendor_reviews_vendor_id_idx ON vendor_reviews(vendor_id);

-- ── DOWN ──────────────────────────────────────────────────────────────────────

-- DROP TRIGGER IF EXISTS audit_logs_no_update ON audit_logs;
-- DROP TRIGGER IF EXISTS audit_logs_no_delete ON audit_logs;
-- DROP FUNCTION IF EXISTS audit_logs_immutable();
-- DROP TABLE IF EXISTS vendor_reviews;
-- DROP TABLE IF EXISTS vendors;
-- DROP TYPE IF EXISTS phi_exposure_level;
-- DROP TYPE IF EXISTS vendor_service_category;
-- DROP TYPE IF EXISTS baa_status;
