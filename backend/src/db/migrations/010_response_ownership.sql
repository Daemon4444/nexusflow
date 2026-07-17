-- Responses API 归属表：记录每个上游 response id 属于哪个用户。
-- GET/DELETE /v1/responses/:id 必须校验归属，否则任何持 key 用户可读/删他人对话（IDOR）。
CREATE TABLE IF NOT EXISTS response_ownership (
  response_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_response_ownership_user ON response_ownership(user_id);
