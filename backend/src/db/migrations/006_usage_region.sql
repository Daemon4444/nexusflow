-- Region column: records the actual upstream region the request was routed to (cn-beijing / ap-southeast-1 / us-east-1 / eu-central-1 / global)
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS region TEXT;
CREATE INDEX IF NOT EXISTS idx_usage_logs_region ON usage_logs(region);

-- Backfill cached-token columns missed in earlier migrations (production was patched manually; idempotent here so fresh environments can rebuild)
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS cached_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS cache_creation_tokens INTEGER NOT NULL DEFAULT 0;
