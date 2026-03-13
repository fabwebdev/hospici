-- Migration 0028: T3-13 Chart Audit Mode
-- Tables: review_checklist_templates, review_queue_views
-- ALTER: encounters — add checklist_responses JSONB

-- ── Enums ─────────────────────────────────────────────────────────────────────

CREATE TYPE review_audit_status_enum AS ENUM (
  'NOT_STARTED',
  'IN_PROGRESS',
  'COMPLETE',
  'FLAGGED'
);

CREATE TYPE view_scope_enum AS ENUM (
  'note_review',
  'chart_audit'
);

-- ── review_checklist_templates ─────────────────────────────────────────────────
-- System-level templates have location_id = NULL (readable by all).
-- Location-specific overrides have location_id set.

CREATE TABLE review_checklist_templates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id      UUID REFERENCES locations(id),
  discipline       TEXT NOT NULL,
  visit_type       TEXT NOT NULL,
  items            JSONB NOT NULL DEFAULT '[]',
  version          INTEGER NOT NULL DEFAULT 1,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  effective_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by_id    UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE review_checklist_templates ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read active templates (system + their location).
CREATE POLICY review_checklist_templates_read
  ON review_checklist_templates FOR SELECT
  USING (
    location_id IS NULL
    OR location_id::text = current_setting('app.current_location_id', true)
  );

-- Supervisors and above can insert/update templates for their location.
CREATE POLICY review_checklist_templates_insert
  ON review_checklist_templates FOR INSERT
  WITH CHECK (
    location_id IS NULL
    OR location_id::text = current_setting('app.current_location_id', true)
  );

CREATE POLICY review_checklist_templates_update
  ON review_checklist_templates FOR UPDATE
  USING (
    location_id IS NULL
    OR location_id::text = current_setting('app.current_location_id', true)
  );

CREATE INDEX idx_rct_discipline_visit_type
  ON review_checklist_templates (discipline, visit_type)
  WHERE is_active = true;

CREATE INDEX idx_rct_location_id
  ON review_checklist_templates (location_id)
  WHERE location_id IS NOT NULL;

-- ── review_queue_views ─────────────────────────────────────────────────────────

CREATE TABLE review_queue_views (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location_id    UUID NOT NULL REFERENCES locations(id),
  name           TEXT NOT NULL,
  view_scope     view_scope_enum NOT NULL,
  filters        JSONB NOT NULL DEFAULT '{}',
  sort_config    JSONB NOT NULL DEFAULT '{"sortBy":"lastActivityAt","sortDir":"desc"}',
  column_config  JSONB NOT NULL DEFAULT '{"visibleColumns":[],"columnOrder":[]}',
  group_by       TEXT,
  is_shared      BOOLEAN NOT NULL DEFAULT false,
  is_pinned      BOOLEAN NOT NULL DEFAULT false,
  is_default     BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE review_queue_views ENABLE ROW LEVEL SECURITY;

-- Each user can see their own views + shared views in their location.
CREATE POLICY review_queue_views_read
  ON review_queue_views FOR SELECT
  USING (
    location_id::text = current_setting('app.current_location_id', true)
    AND (
      owner_id::text = current_setting('app.current_user_id', true)
      OR is_shared = true
    )
  );

CREATE POLICY review_queue_views_insert
  ON review_queue_views FOR INSERT
  WITH CHECK (
    location_id::text = current_setting('app.current_location_id', true)
    AND owner_id::text = current_setting('app.current_user_id', true)
  );

CREATE POLICY review_queue_views_update
  ON review_queue_views FOR UPDATE
  USING (
    owner_id::text = current_setting('app.current_user_id', true)
  );

CREATE POLICY review_queue_views_delete
  ON review_queue_views FOR DELETE
  USING (
    owner_id::text = current_setting('app.current_user_id', true)
  );

-- At most one default view per (owner, scope).
CREATE UNIQUE INDEX idx_rqv_unique_default
  ON review_queue_views (owner_id, view_scope)
  WHERE is_default = true;

CREATE INDEX idx_rqv_owner_id ON review_queue_views (owner_id);
CREATE INDEX idx_rqv_location_id ON review_queue_views (location_id);

-- ── encounters — add checklist_responses ──────────────────────────────────────

ALTER TABLE encounters
  ADD COLUMN IF NOT EXISTS checklist_responses JSONB NOT NULL DEFAULT '[]';

-- ── DOWN ──────────────────────────────────────────────────────────────────────
-- ALTER TABLE encounters DROP COLUMN IF EXISTS checklist_responses;
-- DROP TABLE IF EXISTS review_queue_views;
-- DROP TABLE IF EXISTS review_checklist_templates;
-- DROP TYPE IF EXISTS view_scope_enum;
-- DROP TYPE IF EXISTS review_audit_status_enum;
