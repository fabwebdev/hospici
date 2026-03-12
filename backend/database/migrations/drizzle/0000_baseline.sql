-- Migration: 0000_baseline.sql
-- Description: Foundation tables with RLS support and JSONB for TypeBox schemas

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ───────────────────────────────────────────────────────────────────────────────
-- Foundation: Locations (Multi-tenancy)
-- ───────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    npi VARCHAR(10) UNIQUE,
    taxId VARCHAR(9),
    address JSONB NOT NULL,
    phone VARCHAR(20),
    isActive BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ───────────────────────────────────────────────────────────────────────────────
-- Identity: Users with ABAC attributes in JSONB
-- ───────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    emailVerified BOOLEAN DEFAULT false,
    -- ABAC attributes stored in JSONB for flexibility
    abac_attributes JSONB NOT NULL DEFAULT '{"locationIds": [], "role": "clinician", "permissions": []}',
    password_hash VARCHAR(255), -- Better Auth will manage this
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ───────────────────────────────────────────────────────────────────────────────
-- Identity: Audit Logs (Append-only, partitioned)
-- ───────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    user_role VARCHAR(50) NOT NULL,
    location_id UUID REFERENCES locations(id) NOT NULL,
    action VARCHAR(50) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id UUID NOT NULL,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    details JSONB,
    PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

-- Create initial partitions
CREATE TABLE IF NOT EXISTS audit_logs_y2026m03 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_location ON audit_logs(location_id);

-- ───────────────────────────────────────────────────────────────────────────────
-- Clinical: Patients (FHIR R4 Patient resource in JSONB)
-- ───────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_type VARCHAR(50) NOT NULL DEFAULT 'Patient',
    -- Promoted columns for RLS and indexing
    location_id UUID REFERENCES locations(id) NOT NULL,
    admission_date DATE,
    discharge_date DATE,
    fhir_version VARCHAR(10) NOT NULL DEFAULT '4.0',
    -- TypeBox-validated FHIR Patient resource
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patients_location ON patients(location_id);
CREATE INDEX IF NOT EXISTS idx_patients_admission ON patients(admission_date);
CREATE INDEX IF NOT EXISTS idx_patients_data ON patients USING GIN (data);

-- ───────────────────────────────────────────────────────────────────────────────
-- Clinical: Pain Assessments
-- ───────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pain_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(id) NOT NULL,
    location_id UUID REFERENCES locations(id) NOT NULL,
    assessment_type VARCHAR(50) NOT NULL, -- 'flacc', 'painad', 'numeric', etc.
    assessed_at TIMESTAMPTZ NOT NULL,
    assessed_by UUID REFERENCES users(id) NOT NULL,
    total_score INTEGER,
    -- TypeBox-validated assessment data
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pain_assessments_patient ON pain_assessments(patient_id);
CREATE INDEX IF NOT EXISTS idx_pain_assessments_location ON pain_assessments(location_id);

-- ───────────────────────────────────────────────────────────────────────────────
-- Billing: Notice of Election (NOE)
-- ───────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notice_of_election (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(id) NOT NULL,
    benefit_period_id UUID NOT NULL, -- Will reference benefit_periods table
    location_id UUID REFERENCES locations(id) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    election_date DATE NOT NULL,
    filed_date DATE,
    filing_deadline DATE NOT NULL,
    submitted_at TIMESTAMPTZ,
    late_filing_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_noe_patient ON notice_of_election(patient_id);
CREATE INDEX IF NOT EXISTS idx_noe_location ON notice_of_election(location_id);
CREATE INDEX IF NOT EXISTS idx_noe_status ON notice_of_election(status);
CREATE INDEX IF NOT EXISTS idx_noe_deadline ON notice_of_election(filing_deadline) WHERE status = 'draft';

-- ───────────────────────────────────────────────────────────────────────────────
-- Billing: Benefit Periods
-- ───────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS benefit_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(id) NOT NULL,
    location_id UUID REFERENCES locations(id) NOT NULL,
    period_number INTEGER NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    period_type VARCHAR(50) NOT NULL, -- 'initial_90', 'second_90', 'subsequent_60', etc.
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    is_active BOOLEAN DEFAULT true,
    f2f_required BOOLEAN DEFAULT false,
    f2f_date DATE,
    f2f_physician_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_benefit_periods_patient ON benefit_periods(patient_id);
CREATE INDEX IF NOT EXISTS idx_benefit_periods_location ON benefit_periods(location_id);
CREATE INDEX IF NOT EXISTS idx_benefit_periods_active ON benefit_periods(patient_id, is_active);

-- ───────────────────────────────────────────────────────────────────────────────
-- Scheduling: IDG Meetings
-- ───────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS idg_meetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(id) NOT NULL,
    location_id UUID REFERENCES locations(id) NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    status VARCHAR(50) NOT NULL DEFAULT 'scheduled',
    -- Attendees stored as JSONB array
    attendees JSONB NOT NULL DEFAULT '[]',
    rn_present BOOLEAN DEFAULT false,
    md_present BOOLEAN DEFAULT false,
    sw_present BOOLEAN DEFAULT false,
    days_since_last_idg INTEGER,
    is_compliant BOOLEAN DEFAULT true,
    care_plan_reviewed BOOLEAN DEFAULT false,
    symptom_management_discussed BOOLEAN DEFAULT false,
    goals_of_care_reviewed BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_idg_meetings_patient ON idg_meetings(patient_id);
CREATE INDEX IF NOT EXISTS idx_idg_meetings_location ON idg_meetings(location_id);

-- ───────────────────────────────────────────────────────────────────────────────
-- Scheduling: Aide Supervision
-- ───────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS aide_supervisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(id) NOT NULL,
    location_id UUID REFERENCES locations(id) NOT NULL,
    aide_id UUID REFERENCES users(id) NOT NULL,
    supervisor_id UUID REFERENCES users(id) NOT NULL,
    supervision_date DATE NOT NULL,
    next_supervision_due DATE NOT NULL,
    method VARCHAR(50) NOT NULL, -- 'in_person', 'virtual', 'observation'
    findings TEXT NOT NULL,
    action_required BOOLEAN DEFAULT false,
    action_taken TEXT,
    action_completed_at TIMESTAMPTZ,
    is_overdue BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aide_supervisions_patient ON aide_supervisions(patient_id);
CREATE INDEX IF NOT EXISTS idx_aide_supervisions_aide ON aide_supervisions(aide_id);
CREATE INDEX IF NOT EXISTS idx_aide_supervisions_due ON aide_supervisions(next_supervision_due);

-- ───────────────────────────────────────────────────────────────────────────────
-- Row-Level Security (RLS) Policies
-- ───────────────────────────────────────────────────────────────────────────────

-- Enable RLS on all PHI tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE pain_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notice_of_election ENABLE ROW LEVEL SECURITY;
ALTER TABLE benefit_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE idg_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE aide_supervisions ENABLE ROW LEVEL SECURITY;

-- Users: Self-access only for non-admins
CREATE POLICY users_self_read ON users
    FOR SELECT USING (
        id = current_setting('app.current_user_id')::UUID
        OR current_setting('app.current_role') IN ('admin', 'super_admin')
    );

-- Audit logs: Append-only, location-scoped
CREATE POLICY audit_logs_insert ON audit_logs
    FOR INSERT WITH CHECK (true);

CREATE POLICY audit_logs_select ON audit_logs
    FOR SELECT USING (
        location_id = current_setting('app.current_location_id')::UUID
    );

-- Patients: Location isolation
CREATE POLICY patients_location_read ON patients
    FOR SELECT USING (
        location_id = current_setting('app.current_location_id')::UUID
    );

CREATE POLICY patients_location_insert ON patients
    FOR INSERT WITH CHECK (
        location_id = current_setting('app.current_location_id')::UUID
    );

CREATE POLICY patients_location_update ON patients
    FOR UPDATE USING (
        location_id = current_setting('app.current_location_id')::UUID
    );

-- NOE: Location + billing role restriction
CREATE POLICY noe_billing_read ON notice_of_election
    FOR SELECT USING (
        location_id = current_setting('app.current_location_id')::UUID
        AND current_setting('app.current_role') IN ('admin', 'billing', 'supervisor', 'super_admin')
    );

CREATE POLICY noe_billing_write ON notice_of_election
    FOR INSERT WITH CHECK (
        location_id = current_setting('app.current_location_id')::UUID
        AND current_setting('app.current_role') IN ('admin', 'billing', 'super_admin')
    );

-- Benefit periods: Location-scoped
CREATE POLICY benefit_periods_location_read ON benefit_periods
    FOR SELECT USING (
        location_id = current_setting('app.current_location_id')::UUID
    );

CREATE POLICY benefit_periods_location_write ON benefit_periods
    FOR INSERT WITH CHECK (
        location_id = current_setting('app.current_location_id')::UUID
    );

-- Clinical tables: Location-scoped
CREATE POLICY pain_assessments_location_read ON pain_assessments
    FOR SELECT USING (
        location_id = current_setting('app.current_location_id')::UUID
    );

CREATE POLICY pain_assessments_location_write ON pain_assessments
    FOR INSERT WITH CHECK (
        location_id = current_setting('app.current_location_id')::UUID
    );

-- Scheduling: Location-scoped
CREATE POLICY idg_meetings_location_read ON idg_meetings
    FOR SELECT USING (
        location_id = current_setting('app.current_location_id')::UUID
    );

CREATE POLICY idg_meetings_location_write ON idg_meetings
    FOR INSERT WITH CHECK (
        location_id = current_setting('app.current_location_id')::UUID
    );

CREATE POLICY aide_supervisions_location_read ON aide_supervisions
    FOR SELECT USING (
        location_id = current_setting('app.current_location_id')::UUID
    );

CREATE POLICY aide_supervisions_location_write ON aide_supervisions
    FOR INSERT WITH CHECK (
        location_id = current_setting('app.current_location_id')::UUID
    );
