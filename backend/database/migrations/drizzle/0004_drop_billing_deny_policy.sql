-- Migration: 0004_drop_billing_deny_policy.sql
-- Description: Drop the pain_assessments_billing_deny permissive SELECT policy.
--
-- The policy was intended to prevent billing staff from reading clinical notes,
-- but it was written as a PERMISSIVE policy that returns TRUE for every role
-- except billing_specialist and revenue_manager. Because permissive policies are
-- OR-evaluated, this silently granted ALL non-billing users SELECT access to
-- pain_assessments regardless of location — bypassing the location-scoped
-- pain_assessments_select policy.
--
-- Billing exclusion is redundant: pain_assessments_select already restricts
-- SELECT to ALL_CLINICAL, PHYSICIAN, SUPERVISORY, and QUALITY_COMPLIANCE groups,
-- none of which include billing roles.

DROP POLICY IF EXISTS pain_assessments_billing_deny ON pain_assessments;

-- ── Down migration ────────────────────────────────────────────────────────────
-- To rollback: recreate the (buggy) billing deny policy.
-- CREATE POLICY pain_assessments_billing_deny ON pain_assessments
--     FOR SELECT USING (
--         current_setting('app.current_role', true) NOT IN ('billing_specialist', 'revenue_manager')
--     );
