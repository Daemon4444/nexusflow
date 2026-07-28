-- Durable pre-mutation audit intents.
--
-- A write route inserts a pending intent before the handler is allowed to
-- mutate state. Completion is a separate update; a process crash therefore
-- leaves an explicit pending/unknown record for operator review instead of an
-- invisible audit gap.

CREATE TABLE IF NOT EXISTS admin_audit_intents (
    id TEXT PRIMARY KEY,
    actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    actor_role TEXT,
    actor_email TEXT,
    request_id TEXT NOT NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL DEFAULT 'admin_route',
    resource_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'success', 'failure')),
    reason TEXT NOT NULL DEFAULT '',
    ip_address TEXT,
    user_agent TEXT,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    response_status INTEGER,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_intents_status_created
  ON admin_audit_intents(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_intents_actor_created
  ON admin_audit_intents(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_intents_request
  ON admin_audit_intents(request_id);

