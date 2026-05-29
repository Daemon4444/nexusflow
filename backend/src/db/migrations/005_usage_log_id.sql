ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS log_id TEXT;
CREATE INDEX IF NOT EXISTS idx_usage_logs_log_id ON usage_logs(log_id);
