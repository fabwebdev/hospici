-- 0016_hope_period_status_enum.sql
-- Replace VARCHAR(20) status column on hope_reporting_periods with a proper pgEnum.
-- Existing CHECK constraint ('open', 'submitted', 'closed') ensures all rows are
-- already valid enum members — USING cast is safe with no data migration required.

-- ── Up ────────────────────────────────────────────────────────────────────────

CREATE TYPE hope_period_status AS ENUM ('open', 'submitted', 'closed');

-- Drop default before type change (PostgreSQL requires this)
ALTER TABLE hope_reporting_periods ALTER COLUMN status DROP DEFAULT;

ALTER TABLE hope_reporting_periods
  ALTER COLUMN status TYPE hope_period_status
  USING status::hope_period_status;

ALTER TABLE hope_reporting_periods
  ALTER COLUMN status SET DEFAULT 'open'::hope_period_status;

-- ── Down ──────────────────────────────────────────────────────────────────────

-- To rollback:
-- ALTER TABLE hope_reporting_periods ALTER COLUMN status DROP DEFAULT;
-- ALTER TABLE hope_reporting_periods
--   ALTER COLUMN status TYPE VARCHAR(20) USING status::text;
-- ALTER TABLE hope_reporting_periods
--   ALTER COLUMN status SET DEFAULT 'open';
-- ALTER TABLE hope_reporting_periods
--   ADD CONSTRAINT hope_reporting_periods_status_check
--   CHECK (status IN ('open', 'submitted', 'closed'));
-- DROP TYPE hope_period_status;
