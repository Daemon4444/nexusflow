-- Model catalog override layer.
-- The static catalog in backend/src/data/models.ts is always the seed/fallback.
-- Rows here are merged on top of it at runtime (see data/model-overrides.ts):
--   action='upsert'  -> add a new model, or override an existing static model (doc = full AIModel JSON)
--   action='disable' -> hide a static model from the catalog
-- When this table is empty, the effective catalog is byte-identical to the static seed.

CREATE TABLE IF NOT EXISTS model_overrides (
  id          TEXT PRIMARY KEY,
  doc         JSONB,
  action      TEXT NOT NULL DEFAULT 'upsert' CHECK (action IN ('upsert', 'disable')),
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
