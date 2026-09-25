-- Record the SHA-256 of each applied migration file so the runner can detect
-- a migration that was edited after it was applied. Expand-only: the column is
-- nullable; scripts/migrate-with-lock.mjs backfills NULL checksums from the
-- current file on its next run and fails when a recorded checksum differs.

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE schema_migrations
  ADD COLUMN IF NOT EXISTS checksum TEXT;
