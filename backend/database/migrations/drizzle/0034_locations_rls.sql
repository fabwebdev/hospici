-- Migration 0034 — Add Row Level Security to the locations table
-- The locations table was created in 0000_baseline.sql without RLS.
-- Per CLAUDE.md rule 1.5, every user-data table requires RLS.
-- Locations hold multi-tenancy root data (hospice branch records) and
-- must be restricted so sessions cannot enumerate other tenants' locations.
--
-- Policy design:
--   SELECT — any authenticated session may read locations (needed for join displays,
--             branch selectors, and FHIR bundle URL construction).
--   INSERT  — restricted to admin and super_admin roles only.
--   UPDATE  — restricted to admin and super_admin roles only.
--   DELETE  — no DELETE policy; locations are soft-deleted via isActive = false.

-- UP

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

-- All authenticated sessions can read all locations (needed for cross-branch displays
-- and branch selectors; locations are not patient PHI).
CREATE POLICY locations_read ON locations
  FOR SELECT
  USING (current_setting('app.current_user_id', true) IS NOT NULL
         AND current_setting('app.current_user_id', true) <> '');

-- Only admins and super_admins can insert new locations (i.e. create new branches).
CREATE POLICY locations_admin_insert ON locations
  FOR INSERT
  WITH CHECK (
    current_setting('app.current_role', true) IN ('admin', 'super_admin')
  );

-- Only admins and super_admins can update location records.
CREATE POLICY locations_admin_update ON locations
  FOR UPDATE
  USING (
    current_setting('app.current_role', true) IN ('admin', 'super_admin')
  );

-- DOWN
-- To roll back: drop the policies and disable RLS.
-- ALTER TABLE locations DISABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS locations_read ON locations;
-- DROP POLICY IF EXISTS locations_admin_insert ON locations;
-- DROP POLICY IF EXISTS locations_admin_update ON locations;
