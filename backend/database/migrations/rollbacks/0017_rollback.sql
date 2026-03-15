-- Rollback for migration 0017_noe_notr_workbench.sql
-- Reverses the NOE/NOTR workbench migration.
--
-- ⚠️  PARTIAL ROLLBACK — PostgreSQL limitation:
--    Enum values added with ALTER TYPE ... ADD VALUE IF NOT EXISTS cannot be
--    removed without dropping and recreating the entire enum type and all
--    columns that reference it. The following enum values are NOT rolled back:
--      - notice_filing_status (entire type)
--      - alert_type_enum values: NOE_LATE, NOTR_LATE
--    These values will remain in the database after rollback. If you need a
--    full clean rollback, restore from a pre-0017 pg_dump.

-- Step 1: Drop the new NOE/NOTR tables (CASCADE removes FK constraints)
DROP TABLE IF EXISTS notices_of_termination_revocation CASCADE;
DROP TABLE IF EXISTS notices_of_election CASCADE;

-- Step 2: Drop the new enum type (only possible after tables are dropped)
DROP TYPE IF EXISTS notice_filing_status;

-- Step 3: Recreate the original notice_of_election table (from 0000_baseline.sql)
CREATE TABLE IF NOT EXISTS notice_of_election (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(id) NOT NULL,
    benefit_period_id UUID NOT NULL,
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
CREATE INDEX IF NOT EXISTS idx_noe_deadline ON notice_of_election(filing_deadline)
    WHERE status = 'draft';

-- Note: The original notice_of_election table had no RLS in 0000_baseline.sql.
-- RLS is NOT re-added here to match the original pre-0017 state exactly.
-- alert_type_enum values NOE_LATE and NOTR_LATE remain (cannot be removed).
