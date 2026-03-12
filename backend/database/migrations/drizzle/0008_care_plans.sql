-- Migration 0008 — care_plans table + RLS
-- Unified interdisciplinary care plan (T2-5)
-- One row per patient; discipline_sections JSONB keyed by role.

-- ── Up ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "care_plans" (
  "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "patient_id"          UUID NOT NULL REFERENCES "patients"("id"),
  "location_id"         UUID NOT NULL REFERENCES "locations"("id"),
  -- JSONB map: { "RN": { notes, goals, lastUpdatedBy, lastUpdatedAt }, ... }
  "discipline_sections" JSONB NOT NULL DEFAULT '{}',
  -- Optimistic-lock counter — incremented on every discipline PATCH
  "version"             INTEGER NOT NULL DEFAULT 1,
  "created_at"          TIMESTAMPTZ DEFAULT now(),
  "updated_at"          TIMESTAMPTZ DEFAULT now()
);

-- One care plan per patient
CREATE UNIQUE INDEX "care_plans_patient_id_unique" ON "care_plans" ("patient_id");

-- Fast lookup by patient
CREATE INDEX "care_plans_patient_idx" ON "care_plans" ("patient_id");

-- GIN index for JSONB queries (e.g. search goals by status)
CREATE INDEX "care_plans_sections_gin" ON "care_plans" USING gin ("discipline_sections");

-- ── Row-Level Security ────────────────────────────────────────────────────────

ALTER TABLE "care_plans" ENABLE ROW LEVEL SECURITY;

-- Read: location-scoped
CREATE POLICY "care_plans_location_read" ON "care_plans"
  FOR SELECT
  USING (location_id = current_setting('app.current_location_id')::uuid);

-- Insert: location-scoped
CREATE POLICY "care_plans_location_insert" ON "care_plans"
  FOR INSERT
  WITH CHECK (location_id = current_setting('app.current_location_id')::uuid);

-- Update: location-scoped + discipline role gate enforced in application layer
CREATE POLICY "care_plans_location_update" ON "care_plans"
  FOR UPDATE
  USING (location_id = current_setting('app.current_location_id')::uuid)
  WITH CHECK (location_id = current_setting('app.current_location_id')::uuid);

-- ── Down ──────────────────────────────────────────────────────────────────────

-- DROP TABLE IF EXISTS "care_plans";
