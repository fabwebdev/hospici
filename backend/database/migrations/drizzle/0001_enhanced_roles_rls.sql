-- Migration: 0001_enhanced_roles_rls.sql
-- Description: Enhanced RLS policies for comprehensive ABAC role model
-- Date: 2026-03-11

-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLE TYPE ENUMERATION
-- ═══════════════════════════════════════════════════════════════════════════════

-- Create role type if not exists (PostgreSQL 14+)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM (
            -- Clinical Disciplines
            'registered_nurse', 'lpn', 'social_worker', 'chaplain',
            'physical_therapist', 'occupational_therapist', 'speech_therapist', 'dietitian',
            'aide_cna', 'aide_hha',
            -- Physician Hierarchy
            'physician_attending', 'physician_np', 'medical_director', 'physician_consultant',
            -- Operational
            'intake_coordinator', 'scheduler', 'volunteer', 'volunteer_coordinator',
            'bereavement_coordinator', 'emergency_oncall',
            -- Administrative & Billing
            'billing_specialist', 'revenue_manager', 'clinical_supervisor_rn',
            'clinical_director', 'quality_assurance', 'compliance_officer',
            'operations_manager', 'hr_admin', 'admin', 'super_admin',
            -- External & Portal
            'pharmacy_consultant', 'dme_coordinator', 'surveyor_state', 'surveyor_accreditation',
            'family_caregiver', 'patient_portal'
        );
    END IF;
END$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- HELPER FUNCTIONS FOR RLS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Check if current role is in a role group
CREATE OR REPLACE FUNCTION current_role_in_group(group_name TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    current_role TEXT := current_setting('app.current_role', true);
BEGIN
    RETURN CASE group_name
        -- Clinical direct care staff
        WHEN 'CLINICAL_DIRECT' THEN current_role IN (
            'registered_nurse', 'lpn', 'social_worker', 'chaplain',
            'physical_therapist', 'occupational_therapist', 'speech_therapist', 'dietitian'
        )
        -- Aide-level staff
        WHEN 'CLINICAL_AIDE' THEN current_role IN ('aide_cna', 'aide_hha')
        -- All clinical staff
        WHEN 'ALL_CLINICAL' THEN current_role IN (
            'registered_nurse', 'lpn', 'social_worker', 'chaplain',
            'physical_therapist', 'occupational_therapist', 'speech_therapist', 'dietitian',
            'aide_cna', 'aide_hha'
        )
        -- Physician-level providers
        WHEN 'PHYSICIAN' THEN current_role IN ('physician_attending', 'physician_np', 'medical_director')
        -- All providers
        WHEN 'ALL_PROVIDERS' THEN current_role IN (
            'physician_attending', 'physician_np', 'medical_director', 'physician_consultant',
            'registered_nurse', 'lpn', 'social_worker', 'chaplain',
            'physical_therapist', 'occupational_therapist', 'speech_therapist', 'dietitian'
        )
        -- Billing staff
        WHEN 'BILLING' THEN current_role IN ('billing_specialist', 'revenue_manager')
        -- Supervisory roles
        WHEN 'SUPERVISORY' THEN current_role IN ('clinical_supervisor_rn', 'clinical_director', 'medical_director')
        -- Administrative roles
        WHEN 'ADMINISTRATIVE' THEN current_role IN ('admin', 'super_admin', 'operations_manager')
        -- Quality and compliance
        WHEN 'QUALITY_COMPLIANCE' THEN current_role IN ('quality_assurance', 'compliance_officer')
        -- External partners
        WHEN 'EXTERNAL' THEN current_role IN ('pharmacy_consultant', 'dme_coordinator')
        -- Surveyor/auditor roles
        WHEN 'SURVEYOR' THEN current_role IN ('surveyor_state', 'surveyor_accreditation')
        -- Portal users
        WHEN 'PORTAL' THEN current_role IN ('family_caregiver', 'patient_portal')
        -- Limited access
        WHEN 'LIMITED' THEN current_role IN ('volunteer', 'scheduler', 'hr_admin')
        -- Emergency access
        WHEN 'EMERGENCY' THEN current_role = 'emergency_oncall'
        -- Bereavement staff
        WHEN 'BEREAVEMENT' THEN current_role = 'bereavement_coordinator'
        -- Volunteer program
        WHEN 'VOLUNTEER' THEN current_role IN ('volunteer', 'volunteer_coordinator')
        -- Intake staff
        WHEN 'INTAKE' THEN current_role = 'intake_coordinator'
        ELSE FALSE
    END;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Check if role has clinical access level
CREATE OR REPLACE FUNCTION role_has_clinical_access(required_level TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    current_role TEXT := current_setting('app.current_role', true);
    role_level TEXT;
BEGIN
    role_level := CASE current_role
        WHEN 'super_admin' THEN 'full'
        WHEN 'admin' THEN 'full'
        WHEN 'medical_director' THEN 'full'
        WHEN 'clinical_director' THEN 'full'
        WHEN 'clinical_supervisor_rn' THEN 'full'
        WHEN 'registered_nurse' THEN 'full'
        WHEN 'physician_attending' THEN 'full'
        WHEN 'physician_np' THEN 'full'
        WHEN 'social_worker' THEN 'write'
        WHEN 'chaplain' THEN 'write'
        WHEN 'physical_therapist' THEN 'write'
        WHEN 'occupational_therapist' THEN 'write'
        WHEN 'speech_therapist' THEN 'write'
        WHEN 'dietitian' THEN 'write'
        WHEN 'lpn' THEN 'limited'
        WHEN 'aide_cna' THEN 'limited'
        WHEN 'aide_hha' THEN 'limited'
        ELSE 'none'
    END;
    
    RETURN CASE required_level
        WHEN 'full' THEN role_level IN ('full')
        WHEN 'write' THEN role_level IN ('full', 'write')
        WHEN 'limited' THEN role_level IN ('full', 'write', 'limited')
        WHEN 'read' THEN role_level IN ('full', 'write', 'limited', 'read')
        ELSE FALSE
    END;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════════
-- DROP EXISTING POLICIES (for clean migration)
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS users_self_read ON users;
DROP POLICY IF EXISTS audit_logs_insert ON audit_logs;
DROP POLICY IF EXISTS audit_logs_select ON audit_logs;
DROP POLICY IF EXISTS patients_location_read ON patients;
DROP POLICY IF EXISTS patients_location_insert ON patients;
DROP POLICY IF EXISTS patients_location_update ON patients;
DROP POLICY IF EXISTS noe_billing_read ON notice_of_election;
DROP POLICY IF EXISTS noe_billing_write ON notice_of_election;
DROP POLICY IF EXISTS benefit_periods_location_read ON benefit_periods;
DROP POLICY IF EXISTS benefit_periods_location_write ON benefit_periods;
DROP POLICY IF EXISTS pain_assessments_location_read ON pain_assessments;
DROP POLICY IF EXISTS pain_assessments_location_write ON pain_assessments;
DROP POLICY IF EXISTS idg_meetings_location_read ON idg_meetings;
DROP POLICY IF EXISTS idg_meetings_location_write ON idg_meetings;
DROP POLICY IF EXISTS aide_supervisions_location_read ON aide_supervisions;
DROP POLICY IF EXISTS aide_supervisions_location_write ON aide_supervisions;

-- ═══════════════════════════════════════════════════════════════════════════════
-- USERS TABLE POLICIES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Users: Self-access + Admin + HR + Supervisory
CREATE POLICY users_select ON users
    FOR SELECT USING (
        id = current_setting('app.current_user_id')::UUID
        OR current_role_in_group('ADMINISTRATIVE')
        OR current_role_in_group('SUPERVISORY')
        OR current_setting('app.current_role', true) = 'hr_admin'
    );

CREATE POLICY users_insert ON users
    FOR INSERT WITH CHECK (
        current_role_in_group('ADMINISTRATIVE')
        OR current_setting('app.current_role', true) = 'hr_admin'
    );

CREATE POLICY users_update ON users
    FOR UPDATE USING (
        -- Self update limited fields
        id = current_setting('app.current_user_id')::UUID
        -- Admin can update any user in their location
        OR current_role_in_group('ADMINISTRATIVE')
        -- HR can update staff records
        OR current_setting('app.current_role', true) = 'hr_admin'
        -- Supervisors can update their clinical staff
        OR (current_role_in_group('SUPERVISORY') 
            AND abac_attributes->>'role' IN (
                'registered_nurse', 'lpn', 'social_worker', 'chaplain',
                'physical_therapist', 'occupational_therapist', 
                'speech_therapist', 'dietitian', 'aide_cna', 'aide_hha'
            ))
    );

CREATE POLICY users_delete ON users
    FOR DELETE USING (
        current_role_in_group('ADMINISTRATIVE')
    );

-- ═══════════════════════════════════════════════════════════════════════════════
-- AUDIT LOGS TABLE POLICIES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Audit logs: Append-only, scoped by role
CREATE POLICY audit_logs_insert ON audit_logs
    FOR INSERT WITH CHECK (true);

-- Full audit access for compliance, admin, supervisory
CREATE POLICY audit_logs_select ON audit_logs
    FOR SELECT USING (
        location_id = current_setting('app.current_location_id')::UUID
        OR current_role_in_group('ADMINISTRATIVE')
        OR current_role_in_group('SUPERVISORY')
        OR current_role_in_group('QUALITY_COMPLIANCE')
        OR current_role_in_group('SURVEYOR')
    );

-- ═══════════════════════════════════════════════════════════════════════════════
-- PATIENTS TABLE POLICIES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Patients: Clinical staff full access in location
CREATE POLICY patients_select ON patients
    FOR SELECT USING (
        location_id = current_setting('app.current_location_id')::UUID
        AND (
            current_role_in_group('ALL_CLINICAL')
            OR current_role_in_group('PHYSICIAN')
            OR current_role_in_group('ADMINISTRATIVE')
            OR current_role_in_group('SUPERVISORY')
            OR current_role_in_group('BILLING')
            OR current_role_in_group('QUALITY_COMPLIANCE')
            OR current_setting('app.current_role', true) = 'intake_coordinator'
            OR current_setting('app.current_role', true) = 'scheduler'
            OR current_setting('app.current_role', true) = 'emergency_oncall'
        )
    );

-- Patient insert: Intake, Admin, Clinical
CREATE POLICY patients_insert ON patients
    FOR INSERT WITH CHECK (
        location_id = current_setting('app.current_location_id')::UUID
        AND (
            current_setting('app.current_role', true) = 'intake_coordinator'
            OR current_role_in_group('ADMINISTRATIVE')
            OR current_role_in_group('SUPERVISORY')
        )
    );

-- Patient update: Clinical write access + Admin
CREATE POLICY patients_update ON patients
    FOR UPDATE USING (
        location_id = current_setting('app.current_location_id')::UUID
        AND (
            role_has_clinical_access('write')
            OR current_role_in_group('ADMINISTRATIVE')
            OR current_role_in_group('SUPERVISORY')
        )
    );

-- Patient delete: Admin only
CREATE POLICY patients_delete ON patients
    FOR DELETE USING (
        location_id = current_setting('app.current_location_id')::UUID
        AND current_role_in_group('ADMINISTRATIVE')
    );

-- ═══════════════════════════════════════════════════════════════════════════════
-- CLINICAL NOTES / PAIN ASSESSMENTS POLICIES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Pain assessments: Clinical access
CREATE POLICY pain_assessments_select ON pain_assessments
    FOR SELECT USING (
        location_id = current_setting('app.current_location_id')::UUID
        AND (
            current_role_in_group('ALL_CLINICAL')
            OR current_role_in_group('PHYSICIAN')
            OR current_role_in_group('SUPERVISORY')
            OR current_role_in_group('QUALITY_COMPLIANCE')
        )
    );

-- Billing CANNOT read clinical notes (explicit deny via exclusion)
CREATE POLICY pain_assessments_billing_deny ON pain_assessments
    FOR SELECT USING (
        current_setting('app.current_role', true) NOT IN ('billing_specialist', 'revenue_manager')
    );

CREATE POLICY pain_assessments_insert ON pain_assessments
    FOR INSERT WITH CHECK (
        location_id = current_setting('app.current_location_id')::UUID
        AND role_has_clinical_access('limited')
        AND assessed_by = current_setting('app.current_user_id')::UUID
    );

-- ═══════════════════════════════════════════════════════════════════════════════
-- BILLING TABLES POLICIES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Notice of Election: Billing, Admin, Supervisory
CREATE POLICY noe_select ON notice_of_election
    FOR SELECT USING (
        location_id = current_setting('app.current_location_id')::UUID
        AND (
            current_role_in_group('BILLING')
            OR current_role_in_group('ADMINISTRATIVE')
            OR current_role_in_group('SUPERVISORY')
            OR current_role_in_group('PHYSICIAN')
        )
    );

CREATE POLICY noe_insert ON notice_of_election
    FOR INSERT WITH CHECK (
        location_id = current_setting('app.current_location_id')::UUID
        AND (
            current_role_in_group('BILLING')
            OR current_role_in_group('ADMINISTRATIVE')
        )
    );

CREATE POLICY noe_update ON notice_of_election
    FOR UPDATE USING (
        location_id = current_setting('app.current_location_id')::UUID
        AND (
            current_role_in_group('BILLING')
            OR current_role_in_group('ADMINISTRATIVE')
        )
    );

-- Benefit periods: Clinical read, Billing full
CREATE POLICY benefit_periods_select ON benefit_periods
    FOR SELECT USING (
        location_id = current_setting('app.current_location_id')::UUID
        AND (
            current_role_in_group('ALL_CLINICAL')
            OR current_role_in_group('PHYSICIAN')
            OR current_role_in_group('BILLING')
            OR current_role_in_group('ADMINISTRATIVE')
            OR current_role_in_group('SUPERVISORY')
        )
    );

CREATE POLICY benefit_periods_insert ON benefit_periods
    FOR INSERT WITH CHECK (
        location_id = current_setting('app.current_location_id')::UUID
        AND (
            current_role_in_group('BILLING')
            OR current_role_in_group('ADMINISTRATIVE')
            OR current_setting('app.current_role', true) = 'intake_coordinator'
        )
    );

CREATE POLICY benefit_periods_update ON benefit_periods
    FOR UPDATE USING (
        location_id = current_setting('app.current_location_id')::UUID
        AND (
            current_role_in_group('BILLING')
            OR current_role_in_group('ADMINISTRATIVE')
        )
    );

-- ═══════════════════════════════════════════════════════════════════════════════
-- SCHEDULING TABLES POLICIES
-- ═══════════════════════════════════════════════════════════════════════════════

-- IDG Meetings: Clinical + Admin
CREATE POLICY idg_meetings_select ON idg_meetings
    FOR SELECT USING (
        location_id = current_setting('app.current_location_id')::UUID
        AND (
            current_role_in_group('ALL_CLINICAL')
            OR current_role_in_group('PHYSICIAN')
            OR current_role_in_group('ADMINISTRATIVE')
            OR current_role_in_group('SUPERVISORY')
        )
    );

CREATE POLICY idg_meetings_insert ON idg_meetings
    FOR INSERT WITH CHECK (
        location_id = current_setting('app.current_location_id')::UUID
        AND (
            current_role_in_group('ALL_CLINICAL')
            OR current_role_in_group('PHYSICIAN')
            OR current_role_in_group('ADMINISTRATIVE')
            OR current_setting('app.current_role', true) = 'scheduler'
        )
    );

CREATE POLICY idg_meetings_update ON idg_meetings
    FOR UPDATE USING (
        location_id = current_setting('app.current_location_id')::UUID
        AND (
            current_role_in_group('ALL_CLINICAL')
            OR current_role_in_group('PHYSICIAN')
            OR current_role_in_group('ADMINISTRATIVE')
            OR current_setting('app.current_role', true) = 'scheduler'
        )
    );

-- Aide Supervisions: Supervisory + Aides + Clinical
CREATE POLICY aide_supervisions_select ON aide_supervisions
    FOR SELECT USING (
        location_id = current_setting('app.current_location_id')::UUID
        AND (
            current_role_in_group('SUPERVISORY')
            OR current_role_in_group('CLINICAL_AIDE')
            OR current_setting('app.current_role', true) = 'registered_nurse'
        )
    );

CREATE POLICY aide_supervisions_insert ON aide_supervisions
    FOR INSERT WITH CHECK (
        location_id = current_setting('app.current_location_id')::UUID
        AND (
            current_role_in_group('SUPERVISORY')
            OR current_setting('app.current_user_id')::UUID = supervisor_id
        )
    );

-- ═══════════════════════════════════════════════════════════════════════════════
-- INDEXES FOR PERFORMANCE
-- ═══════════════════════════════════════════════════════════════════════════════

-- Add indexes to support RLS query patterns
CREATE INDEX IF NOT EXISTS idx_patients_location_active ON patients(location_id, is_active);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_role ON audit_logs(user_id, user_role);
CREATE INDEX IF NOT EXISTS idx_noe_status_location ON notice_of_election(status, location_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- COMMENTS FOR DOCUMENTATION
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON FUNCTION current_role_in_group IS 'Checks if current app role is in a defined role group for ABAC';
COMMENT ON FUNCTION role_has_clinical_access IS 'Validates if current role has required clinical access level';
