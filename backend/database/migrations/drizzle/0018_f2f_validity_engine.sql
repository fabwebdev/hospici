-- Migration 0018 — F2F Validity Engine + Physician Routing (T3-2b)
-- UP

-- Add alert enum values
ALTER TYPE alert_type_enum ADD VALUE IF NOT EXISTS 'F2F_MISSING';
ALTER TYPE alert_type_enum ADD VALUE IF NOT EXISTS 'F2F_INVALID';

-- Create enums
CREATE TYPE order_status_enum AS ENUM ('PENDING_SIGNATURE', 'SIGNED', 'REJECTED', 'EXPIRED');
CREATE TYPE order_type_enum AS ENUM ('VERBAL', 'DME', 'FREQUENCY_CHANGE', 'MEDICATION', 'F2F_DOCUMENTATION');
CREATE TYPE provider_role_enum AS ENUM ('physician', 'np', 'pa');
CREATE TYPE encounter_setting_enum AS ENUM ('office', 'home', 'telehealth', 'snf', 'hospital');

-- orders table (minimal T3-9 bootstrap)
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations(id),
  patient_id UUID NOT NULL REFERENCES patients(id),
  issuing_clinician_id UUID NOT NULL REFERENCES users(id),
  physician_id UUID REFERENCES users(id),
  type order_type_enum NOT NULL,
  content TEXT NOT NULL,
  status order_status_enum NOT NULL DEFAULT 'PENDING_SIGNATURE',
  due_at TIMESTAMPTZ NOT NULL,
  signed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY orders_location_read ON orders
  FOR SELECT USING (location_id::text = current_setting('app.current_location_id', true));

CREATE POLICY orders_location_insert ON orders
  FOR INSERT WITH CHECK (location_id::text = current_setting('app.current_location_id', true));

CREATE POLICY orders_location_update ON orders
  FOR UPDATE USING (location_id::text = current_setting('app.current_location_id', true));

CREATE INDEX IF NOT EXISTS idx_orders_patient ON orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_orders_physician ON orders(physician_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- face_to_face_encounters table
CREATE TABLE IF NOT EXISTS face_to_face_encounters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id),
  location_id UUID NOT NULL REFERENCES locations(id),
  benefit_period_id UUID NOT NULL REFERENCES benefit_periods(id),
  f2f_date DATE NOT NULL,
  f2f_provider_id UUID REFERENCES users(id),
  f2f_provider_npi VARCHAR(10),
  f2f_provider_role provider_role_enum NOT NULL,
  encounter_setting encounter_setting_enum NOT NULL,
  clinical_findings TEXT NOT NULL DEFAULT '',
  is_valid_for_recert BOOLEAN NOT NULL DEFAULT false,
  validated_at TIMESTAMPTZ,
  invalidation_reason TEXT,
  physician_task_id UUID REFERENCES orders(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE face_to_face_encounters ENABLE ROW LEVEL SECURITY;

CREATE POLICY f2f_location_read ON face_to_face_encounters
  FOR SELECT USING (location_id::text = current_setting('app.current_location_id', true));

CREATE POLICY f2f_location_insert ON face_to_face_encounters
  FOR INSERT WITH CHECK (location_id::text = current_setting('app.current_location_id', true));

CREATE POLICY f2f_location_update ON face_to_face_encounters
  FOR UPDATE USING (location_id::text = current_setting('app.current_location_id', true));

CREATE INDEX IF NOT EXISTS idx_f2f_patient ON face_to_face_encounters(patient_id);
CREATE INDEX IF NOT EXISTS idx_f2f_benefit_period ON face_to_face_encounters(benefit_period_id);
CREATE INDEX IF NOT EXISTS idx_f2f_valid ON face_to_face_encounters(patient_id, is_valid_for_recert);

-- DOWN
-- DROP TABLE IF EXISTS face_to_face_encounters;
-- DROP TABLE IF EXISTS orders;
-- DROP TYPE IF EXISTS encounter_setting_enum;
-- DROP TYPE IF EXISTS provider_role_enum;
-- DROP TYPE IF EXISTS order_type_enum;
-- DROP TYPE IF EXISTS order_status_enum;
-- Note: Cannot remove enum values from PostgreSQL enums without full recreation
