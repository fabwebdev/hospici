-- Migration 0002 — Better Auth tables
-- Adds auth-system tables required by Better Auth v1.x + twoFactor plugin.
-- Also extends the users table with fields required by Better Auth and Hospici ABAC.
--
-- RLS note: auth tables are user-scoped (no location_id).
-- The server ALWAYS authenticates requests server-side; clients never query these
-- tables directly. RLS policies enforce that a user can only read their own rows.

-- ── 1. Extend users table ────────────────────────────────────────────────────
-- Rename emailverified column (non-standard) → email_verified (snake_case standard)
-- and add Better Auth required + Hospici custom columns.

ALTER TABLE users
  RENAME COLUMN emailverified TO email_verified;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS name         VARCHAR(255)  NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image        VARCHAR(500),
  ADD COLUMN IF NOT EXISTS is_active    BOOLEAN       NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT false;

-- ── 2. Sessions table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  expires_at   TIMESTAMPTZ   NOT NULL,
  token        TEXT          NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  ip_address   TEXT,
  user_agent   TEXT,
  user_id      UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Server sets app.current_user_id; sessions are user-scoped (not location-scoped)
CREATE POLICY sessions_user_read ON sessions
  FOR SELECT
  USING (user_id::TEXT = current_setting('app.current_user_id', true));

CREATE POLICY sessions_user_delete ON sessions
  FOR DELETE
  USING (user_id::TEXT = current_setting('app.current_user_id', true));

-- Only the server-side process (no RLS context = superuser/service role) can INSERT
CREATE POLICY sessions_server_insert ON sessions
  FOR INSERT
  WITH CHECK (true);

-- ── 3. Accounts table ────────────────────────────────────────────────────────
-- Stores credentials (password hash for email provider) and OAuth tokens.
CREATE TABLE IF NOT EXISTS accounts (
  id                        UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                TEXT          NOT NULL,
  provider_id               TEXT          NOT NULL,
  user_id                   UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_token              TEXT,
  refresh_token             TEXT,
  id_token                  TEXT,
  access_token_expires_at   TIMESTAMPTZ,
  refresh_token_expires_at  TIMESTAMPTZ,
  scope                     TEXT,
  password                  TEXT,
  created_at                TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS accounts_user_id_idx ON accounts(user_id);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

-- Accounts are never exposed to end users — server-only access
-- Block all direct client queries; the server service role bypasses RLS
CREATE POLICY accounts_deny_all ON accounts
  AS RESTRICTIVE
  FOR ALL
  USING (false);

-- ── 4. Verifications table ────────────────────────────────────────────────────
-- Short-lived tokens for email verification, password reset, etc.
CREATE TABLE IF NOT EXISTS verifications (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier   TEXT          NOT NULL,
  value        TEXT          NOT NULL,
  expires_at   TIMESTAMPTZ   NOT NULL,
  created_at   TIMESTAMPTZ   DEFAULT now(),
  updated_at   TIMESTAMPTZ   DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verifications_identifier_idx ON verifications(identifier);

ALTER TABLE verifications ENABLE ROW LEVEL SECURITY;

-- Verifications are server-only (service role bypasses RLS)
CREATE POLICY verifications_deny_all ON verifications
  AS RESTRICTIVE
  FOR ALL
  USING (false);

-- ── 5. Two-factors table (TOTP) ───────────────────────────────────────────────
-- HIPAA §164.312(d): stores encrypted TOTP secret + backup codes per user.
CREATE TABLE IF NOT EXISTS two_factors (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  secret       TEXT          NOT NULL,
  backup_codes TEXT          NOT NULL,
  user_id      UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS two_factors_user_id_idx ON two_factors(user_id);

ALTER TABLE two_factors ENABLE ROW LEVEL SECURITY;

-- two_factors rows are never exposed directly; server-only
CREATE POLICY two_factors_deny_all ON two_factors
  AS RESTRICTIVE
  FOR ALL
  USING (false);

-- ── Down migration ────────────────────────────────────────────────────────────
-- To roll back (run manually, do not auto-apply):
--
-- ALTER TABLE users RENAME COLUMN email_verified TO emailverified;
-- ALTER TABLE users
--   DROP COLUMN IF EXISTS name,
--   DROP COLUMN IF EXISTS image,
--   DROP COLUMN IF EXISTS is_active,
--   DROP COLUMN IF EXISTS last_login_at,
--   DROP COLUMN IF EXISTS two_factor_enabled;
-- DROP TABLE IF EXISTS two_factors;
-- DROP TABLE IF EXISTS verifications;
-- DROP TABLE IF EXISTS accounts;
-- DROP TABLE IF EXISTS sessions;
