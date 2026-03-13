-- Migration: 0025_physician_order_inbox.sql
-- T3-9: Physician Order Inbox + Paperless Order Routing
-- Extends the orders table with delivery tracking, state machine expansion,
-- verbal read-back flags, and reminder/voiding infrastructure.

-- ── Extend order_status_enum ────────────────────────────────────────────────
-- PostgreSQL does not support removing enum values, so down migration
-- guidance is in the Down section below.
ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'VIEWED';
ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'VOIDED';
ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'NO_SIGNATURE_REQUIRED';
ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'COMPLETED_RETURNED';

-- ── Delivery method enum ─────────────────────────────────────────────────────
CREATE TYPE delivery_method_enum AS ENUM ('PORTAL', 'FAX', 'MAIL', 'COURIER');

-- ── Extend orders table ──────────────────────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS verbal_read_back_flag boolean NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS verbal_read_back_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_method delivery_method_enum;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS urgency_reason text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS linked_signature_request_id uuid REFERENCES signature_requests(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS group_bundle_id uuid;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS no_signature_reason text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS voided_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS voided_by_user_id uuid REFERENCES users(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_returned_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reminder_count integer NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz;

-- ── Extend alert_type_enum ───────────────────────────────────────────────────
ALTER TYPE alert_type_enum ADD VALUE IF NOT EXISTS 'ORDER_EXPIRY';

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_physician_status ON orders(physician_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_patient_id ON orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_orders_due_at ON orders(due_at);
CREATE INDEX IF NOT EXISTS idx_orders_group_bundle ON orders(group_bundle_id) WHERE group_bundle_id IS NOT NULL;

-- ── Down migration ────────────────────────────────────────────────────────────
-- NOTE: PostgreSQL does not support DROP VALUE for enum types.
-- To roll back this migration:
--   1. Remove all rows using the new enum values (DRAFT, VIEWED, VOIDED,
--      NO_SIGNATURE_REQUIRED, COMPLETED_RETURNED, ORDER_EXPIRY).
--   2. Create a new enum without the added values and swap it in:
--      CREATE TYPE order_status_enum_v1 AS ENUM ('PENDING_SIGNATURE','SIGNED','REJECTED','EXPIRED');
--      ALTER TABLE orders ALTER COLUMN status TYPE order_status_enum_v1
--        USING status::text::order_status_enum_v1;
--      DROP TYPE order_status_enum;
--      ALTER TYPE order_status_enum_v1 RENAME TO order_status_enum;
--      (Repeat for delivery_method_enum and alert_type_enum.)
--   3. Drop the added columns:
--      ALTER TABLE orders
--        DROP COLUMN IF EXISTS verbal_read_back_flag,
--        DROP COLUMN IF EXISTS verbal_read_back_at,
--        DROP COLUMN IF EXISTS delivery_method,
--        DROP COLUMN IF EXISTS urgency_reason,
--        DROP COLUMN IF EXISTS linked_signature_request_id,
--        DROP COLUMN IF EXISTS group_bundle_id,
--        DROP COLUMN IF EXISTS no_signature_reason,
--        DROP COLUMN IF EXISTS voided_at,
--        DROP COLUMN IF EXISTS voided_by_user_id,
--        DROP COLUMN IF EXISTS completed_returned_at,
--        DROP COLUMN IF EXISTS reminder_count,
--        DROP COLUMN IF EXISTS last_reminder_at;
--   4. Drop delivery_method_enum:
--      DROP TYPE IF EXISTS delivery_method_enum;
--   5. Drop indexes:
--      DROP INDEX IF EXISTS idx_orders_physician_status;
--      DROP INDEX IF EXISTS idx_orders_patient_id;
--      DROP INDEX IF EXISTS idx_orders_due_at;
--      DROP INDEX IF EXISTS idx_orders_group_bundle;
