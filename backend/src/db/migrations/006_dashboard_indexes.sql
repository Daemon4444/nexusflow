-- Dashboard performance indexes
-- Accelerates daily stats aggregation (date + status filtering)
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_status
  ON usage_logs (created_at, status);

-- Accelerates top-users query (date + user grouping with covering columns)
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_user
  ON usage_logs (created_at, user_id)
  INCLUDE (total_tokens, cost, status);

-- Accelerates user growth query
CREATE INDEX IF NOT EXISTS idx_users_created_at
  ON users (created_at);
