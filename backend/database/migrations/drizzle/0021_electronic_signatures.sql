-- Migration: 0021_electronic_signatures.sql
-- T3-5: Electronic Signatures with expanded scope (competitor parity)

-- ── Enums ────────────────────────────────────────────────────────────────────

-- Document types that can be signed
CREATE TYPE signature_document_type AS ENUM (
  'encounter', 'order', 'recertification', 'f2f', 'idg_record', 'consent', 'care_plan'
);

-- Signature request status (10-state machine)
CREATE TYPE signature_request_status AS ENUM (
  'DRAFT',
  'READY_FOR_SIGNATURE',
  'SENT_FOR_SIGNATURE',
  'VIEWED',
  'PARTIALLY_SIGNED',
  'SIGNED',
  'REJECTED',
  'VOIDED',
  'NO_SIGNATURE_REQUIRED',
  'EXPIRED'
);

-- Signer type (who is signing)
CREATE TYPE signer_type AS ENUM (
  'CLINICIAN',
  'PHYSICIAN',
  'PATIENT',
  'REPRESENTATIVE',
  'AGENCY_REP'
);

-- Signature exception reason
CREATE TYPE signature_exception_type AS ENUM (
  'NO_SIGNATURE_REQUIRED',
  'PATIENT_UNABLE_TO_SIGN',
  'PHYSICIAN_UNAVAILABLE'
);

-- ── Tables ────────────────────────────────────────────────────────────────────

-- Signature requests (workflow tracking)
CREATE TABLE signature_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  
  -- Document being signed
  document_type signature_document_type NOT NULL,
  document_id uuid NOT NULL,  -- FK to encounters, orders, etc. (polymorphic)
  
  -- Status machine
  status signature_request_status NOT NULL DEFAULT 'DRAFT',
  
  -- Signature policy configuration
  require_countersign boolean NOT NULL DEFAULT false,
  require_patient_signature boolean NOT NULL DEFAULT false,
  require_signature_time boolean NOT NULL DEFAULT false,
  allow_grouping boolean NOT NULL DEFAULT false,  -- grouped order signing
  
  -- Routing/delivery preferences
  delivery_method varchar(20) DEFAULT 'portal',  -- portal, fax, mail, courier
  
  -- Timestamps (business vs system time per Axxess pattern)
  documented_signed_at timestamptz,  -- user-reported signing time
  sent_for_signature_at timestamptz,
  viewed_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  
  -- Content hash for tamper evidence
  content_hash varchar(64) NOT NULL,  -- SHA-256 of canonical document content
  prior_revision_hash varchar(64),    -- hash before signature
  
  -- Exception handling
  exception_type signature_exception_type,
  exception_reason text,
  exception_approved_by uuid REFERENCES users(id),
  exception_approved_at timestamptz,
  
  -- Rejection tracking
  rejected_at timestamptz,
  rejected_by uuid REFERENCES users(id),
  rejection_reason text,
  
  -- Void tracking
  voided_at timestamptz,
  voided_by uuid REFERENCES users(id),
  void_reason text,
  
  -- Request metadata
  requested_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Individual signatures (one per signer)
CREATE TABLE electronic_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signature_request_id uuid NOT NULL REFERENCES signature_requests(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES locations(id),
  
  -- Signer info
  signer_type signer_type NOT NULL,
  signer_user_id uuid REFERENCES users(id),  -- null for external physicians/patients
  signer_name text NOT NULL,  -- displayed/typed name
  signer_legal_name text,     -- legal name for audit
  signer_npi varchar(10),     -- for physician signatures
  
  -- Attestation
  attestation_accepted boolean NOT NULL DEFAULT false,
  attestation_text text NOT NULL,  -- "I certify that..." text shown to signer
  
  -- Timestamps
  documented_signed_at timestamptz,  -- user-reported time (if required)
  signed_at timestamptz NOT NULL DEFAULT now(),  -- actual system time
  
  -- Audit trail
  ip_address inet,
  user_agent text,
  
  -- Signature artifact
  signature_data text,  -- base64 signature image (for stylus/finger capture)
  typed_name text,      -- for typed attestations
  
  -- Tamper evidence
  content_hash_at_sign varchar(64) NOT NULL,  -- hash of content when signed
  signature_hash varchar(64) NOT NULL,        -- hash of this signature record
  
  -- Patient representative specific
  representative_relationship text,  -- spouse, child, POA, etc.
  patient_unable_reason text,        -- why patient couldn't sign
  
  -- Countersign chain
  countersigns_signature_id uuid REFERENCES electronic_signatures(id),
  
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Signature events (append-only audit log)
CREATE TABLE signature_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signature_request_id uuid NOT NULL REFERENCES signature_requests(id) ON DELETE CASCADE,
  event_type varchar(50) NOT NULL,  -- created, sent, viewed, signed, rejected, voided, etc.
  event_data jsonb NOT NULL DEFAULT '{}',
  actor_user_id uuid REFERENCES users(id),
  actor_name text,  -- denormalized for audit
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

-- Fast lookup by document
CREATE INDEX signature_requests_document_idx 
  ON signature_requests (document_type, document_id);

-- Outstanding signature queues
CREATE INDEX signature_requests_status_location_idx 
  ON signature_requests (location_id, status) 
  WHERE status IN ('READY_FOR_SIGNATURE', 'SENT_FOR_SIGNATURE', 'VIEWED', 'PARTIALLY_SIGNED');

-- Patient signature timeline
CREATE INDEX signature_requests_patient_idx 
  ON signature_requests (patient_id, created_at DESC);

-- Signature request expiration
CREATE INDEX signature_requests_expires_idx 
  ON signature_requests (expires_at) 
  WHERE status IN ('SENT_FOR_SIGNATURE', 'VIEWED');

-- Signatures by request
CREATE INDEX electronic_signatures_request_idx 
  ON electronic_signatures (signature_request_id);

-- Event log
CREATE INDEX signature_events_request_idx 
  ON signature_events (signature_request_id, created_at DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE signature_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE electronic_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE signature_events ENABLE ROW LEVEL SECURITY;

-- signature_requests policies
CREATE POLICY signature_requests_location_read ON signature_requests
  FOR SELECT USING (location_id::text = current_setting('app.location_id', true));

CREATE POLICY signature_requests_location_insert ON signature_requests
  FOR INSERT WITH CHECK (location_id::text = current_setting('app.location_id', true));

CREATE POLICY signature_requests_location_update ON signature_requests
  FOR UPDATE USING (location_id::text = current_setting('app.location_id', true));

-- electronic_signatures policies
CREATE POLICY electronic_signatures_location_read ON electronic_signatures
  FOR SELECT USING (location_id::text = current_setting('app.location_id', true));

CREATE POLICY electronic_signatures_location_insert ON electronic_signatures
  FOR INSERT WITH CHECK (location_id::text = current_setting('app.location_id', true));

-- signature_events policies (read via signature request)
CREATE POLICY signature_events_location_read ON signature_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM signature_requests sr 
      WHERE sr.id = signature_events.signature_request_id
      AND sr.location_id::text = current_setting('app.location_id', true)
    )
  );

CREATE POLICY signature_events_location_insert ON signature_events
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM signature_requests sr 
      WHERE sr.id = signature_events.signature_request_id
      AND sr.location_id::text = current_setting('app.location_id', true)
    )
  );

-- ── Add alert type for signature overdue ─────────────────────────────────────

ALTER TYPE alert_type_enum ADD VALUE IF NOT EXISTS 'SIGNATURE_OVERDUE';

-- ──────────────────────────────────────────────────────────────────────────────
-- DOWN MIGRATION
-- 
-- DROP TABLE IF EXISTS signature_events;
-- DROP TABLE IF EXISTS electronic_signatures;
-- DROP TABLE IF EXISTS signature_requests;
-- DROP TYPE IF EXISTS signature_exception_type;
-- DROP TYPE IF EXISTS signer_type;
-- DROP TYPE IF EXISTS signature_request_status;
-- DROP TYPE IF EXISTS signature_document_type;
-- Note: SIGNATURE_OVERDUE cannot be removed from enum once added
-- ──────────────────────────────────────────────────────────────────────────────
