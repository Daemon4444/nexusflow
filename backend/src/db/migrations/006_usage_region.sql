-- Region field: records the actual upstream region of the request (cn-beijing / ap-southeast-1 / us-east-1 / eu-central-1 / global)
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS region TEXT;
CREATE INDEX IF NOT EXISTS idx_usage_logs_region ON usage_logs(region);

-- Backfill missing cache Token columns from migration (production DB was manually added; this is an idempotent backfill to ensure new environments can rebuild)
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS cached_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS cache_creation_tokens INTEGER NOT NULL DEFAULT 0;
