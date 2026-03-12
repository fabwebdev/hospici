-- Migration: 0003_fix_rls_helper_functions.sql
-- Description: Fix plpgsql variable shadowing bug in current_role_in_group and
--              role_has_clinical_access. Both functions declared a local variable
--              named 'current_role', which is a PostgreSQL built-in keyword.
--              plpgsql resolves the DECLARE initializer to the built-in value
--              (the current DB role) rather than current_setting('app.current_role').
--              Renamed to v_role to eliminate the conflict.

-- ── Fix current_role_in_group ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION current_role_in_group(group_name TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_role TEXT := current_setting('app.current_role', true);
BEGIN
    RETURN CASE group_name
        WHEN 'CLINICAL_DIRECT' THEN v_role IN (
            'registered_nurse', 'lpn', 'social_worker', 'chaplain',
            'physical_therapist', 'occupational_therapist', 'speech_therapist', 'dietitian'
        )
        WHEN 'CLINICAL_AIDE' THEN v_role IN ('aide_cna', 'aide_hha')
        WHEN 'ALL_CLINICAL' THEN v_role IN (
            'registered_nurse', 'lpn', 'social_worker', 'chaplain',
            'physical_therapist', 'occupational_therapist', 'speech_therapist', 'dietitian',
            'aide_cna', 'aide_hha'
        )
        WHEN 'PHYSICIAN' THEN v_role IN ('physician_attending', 'physician_np', 'medical_director')
        WHEN 'ALL_PROVIDERS' THEN v_role IN (
            'physician_attending', 'physician_np', 'medical_director', 'physician_consultant',
            'registered_nurse', 'lpn', 'social_worker', 'chaplain',
            'physical_therapist', 'occupational_therapist', 'speech_therapist', 'dietitian'
        )
        WHEN 'BILLING' THEN v_role IN ('billing_specialist', 'revenue_manager')
        WHEN 'SUPERVISORY' THEN v_role IN ('clinical_supervisor_rn', 'clinical_director', 'medical_director')
        WHEN 'ADMINISTRATIVE' THEN v_role IN ('admin', 'super_admin', 'operations_manager')
        WHEN 'QUALITY_COMPLIANCE' THEN v_role IN ('quality_assurance', 'compliance_officer')
        WHEN 'EXTERNAL' THEN v_role IN ('pharmacy_consultant', 'dme_coordinator')
        WHEN 'SURVEYOR' THEN v_role IN ('surveyor_state', 'surveyor_accreditation')
        WHEN 'PORTAL' THEN v_role IN ('family_caregiver', 'patient_portal')
        WHEN 'LIMITED' THEN v_role IN ('volunteer', 'scheduler', 'hr_admin')
        WHEN 'EMERGENCY' THEN v_role = 'emergency_oncall'
        WHEN 'BEREAVEMENT' THEN v_role = 'bereavement_coordinator'
        WHEN 'VOLUNTEER' THEN v_role IN ('volunteer', 'volunteer_coordinator')
        WHEN 'INTAKE' THEN v_role = 'intake_coordinator'
        ELSE FALSE
    END;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION current_role_in_group(TEXT) IS
    'Checks if current app role is in a defined role group for ABAC';

-- ── Fix role_has_clinical_access ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION role_has_clinical_access(required_level TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_role TEXT := current_setting('app.current_role', true);
    role_level TEXT;
BEGIN
    role_level := CASE v_role
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

-- ── Down migration ────────────────────────────────────────────────────────────
-- To rollback: restore original (buggy) variable name — policies will regress to
-- always evaluating as the DB role name instead of the app GUC.
-- See 0001_enhanced_roles_rls.sql for original function bodies.
