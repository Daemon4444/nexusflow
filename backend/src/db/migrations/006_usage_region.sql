-- 区域字段：记录请求实际走的上游区域（cn-beijing / ap-southeast-1 / us-east-1 / eu-central-1 / global）
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS region TEXT;
CREATE INDEX IF NOT EXISTS idx_usage_logs_region ON usage_logs(region);

-- 补齐迁移文件缺失的缓存 Token 列（生产库已手动添加，此处为幂等补录，保证新环境可重建）
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS cached_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS cache_creation_tokens INTEGER NOT NULL DEFAULT 0;
