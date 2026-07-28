-- Real administration control plane.
--
-- The new tables are deliberately additive. Existing ADMIN_USER_IDS /
-- ADMIN_EMAILS remain the bootstrap super-admin mechanism, while database role
-- assignments provide revocable least-privilege access for day-to-day work.

CREATE TABLE IF NOT EXISTS admin_role_assignments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('viewer', 'support', 'finance', 'operator', 'admin')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    granted_by TEXT,
    revoked_by TEXT,
    reason TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    UNIQUE(user_id, role)
);

ALTER TABLE admin_role_assignments
  ADD COLUMN IF NOT EXISTS revoked_by TEXT;

CREATE INDEX IF NOT EXISTS idx_admin_role_assignments_user_active
  ON admin_role_assignments(user_id, is_active);

CREATE TABLE IF NOT EXISTS admin_audit_events (
    id TEXT PRIMARY KEY,
    actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    actor_role TEXT,
    actor_email TEXT,
    request_id TEXT NOT NULL,
    idempotency_key TEXT,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure')),
    reason TEXT NOT NULL DEFAULT '',
    ip_address TEXT,
    user_agent TEXT,
    before_data JSONB,
    after_data JSONB,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_events_created
  ON admin_audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_events_actor
  ON admin_audit_events(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_events_resource
  ON admin_audit_events(resource_type, resource_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_audit_events_success_idempotency
  ON admin_audit_events(actor_user_id, action, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND outcome = 'success';

CREATE TABLE IF NOT EXISTS deployment_events (
    id TEXT PRIMARY KEY,
    release_id TEXT NOT NULL,
    environment TEXT NOT NULL DEFAULT 'production',
    sha TEXT,
    event_type TEXT NOT NULL CHECK (
      event_type IN ('started', 'node_started', 'node_succeeded', 'node_failed', 'succeeded', 'failed', 'rollback_started', 'rolled_back')
    ),
    node_id TEXT,
    actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    message TEXT NOT NULL DEFAULT '',
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deployment_events_release
  ON deployment_events(release_id, created_at);
CREATE INDEX IF NOT EXISTS idx_deployment_events_created
  ON deployment_events(created_at DESC);

CREATE TABLE IF NOT EXISTS runtime_nodes (
    node_id TEXT PRIMARY KEY,
    hostname TEXT NOT NULL,
    environment TEXT NOT NULL DEFAULT 'production',
    backend_sha TEXT,
    backend_built_at TIMESTAMPTZ,
    frontend_build_id TEXT,
    status TEXT NOT NULL DEFAULT 'unknown'
      CHECK (status IN ('unknown', 'healthy', 'degraded', 'offline')),
    postgres_status TEXT,
    redis_status TEXT,
    started_at TIMESTAMPTZ,
    last_seen_at TIMESTAMPTZ NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_runtime_nodes_environment_seen
  ON runtime_nodes(environment, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    severity TEXT NOT NULL CHECK (severity IN ('sev1', 'sev2', 'sev3', 'sev4')),
    status TEXT NOT NULL DEFAULT 'open'
      CHECK (status IN ('open', 'investigating', 'monitoring', 'resolved')),
    source TEXT NOT NULL DEFAULT 'manual',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incidents_status_started
  ON incidents(status, started_at DESC);

CREATE TABLE IF NOT EXISTS incident_events (
    id TEXT PRIMARY KEY,
    incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_events_incident
  ON incident_events(incident_id, created_at);

-- Structural request facts used by the admin Request Explorer. Historical rows
-- remain NULL when the fact was not captured; unknown must never be rewritten
-- as a guessed value.
ALTER TABLE usage_logs
  ADD COLUMN IF NOT EXISTS provider_id TEXT,
  ADD COLUMN IF NOT EXISTS channel_id TEXT,
  ADD COLUMN IF NOT EXISTS protocol TEXT,
  ADD COLUMN IF NOT EXISTS node_id TEXT,
  ADD COLUMN IF NOT EXISTS http_status INTEGER,
  ADD COLUMN IF NOT EXISTS error_code TEXT,
  ADD COLUMN IF NOT EXISTS estimated BOOLEAN,
  ADD COLUMN IF NOT EXISTS reservation_id TEXT REFERENCES billing_reservations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider_cost NUMERIC(18, 6),
  ADD COLUMN IF NOT EXISTS cost_version_id TEXT REFERENCES provider_cost_versions(id) ON DELETE SET NULL;

ALTER TABLE usage_logs
  ADD CONSTRAINT usage_logs_http_status_valid
    CHECK (http_status IS NULL OR (http_status >= 100 AND http_status <= 599)) NOT VALID,
  ADD CONSTRAINT usage_logs_provider_cost_valid
    CHECK (provider_cost IS NULL OR provider_cost >= 0) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_usage_logs_provider_created
  ON usage_logs(provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_channel_created
  ON usage_logs(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_protocol_created
  ON usage_logs(protocol, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_node_created
  ON usage_logs(node_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_error_created
  ON usage_logs(error_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_reservation
  ON usage_logs(reservation_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_transaction
  ON usage_logs(transaction_id);

-- Provider costs are money and must have an exact representation. This is an
-- expand-only migration: keep the legacy REAL columns so the previous binary
-- remains rollback-compatible, and add NUMERIC shadow columns. New binaries
-- dual-write both representations and prefer the NUMERIC values; a later
-- contract migration may remove the legacy columns after the rollback window.
ALTER TABLE provider_cost_versions
  ADD COLUMN IF NOT EXISTS prompt_cost_amount NUMERIC(18, 6),
  ADD COLUMN IF NOT EXISTS completion_cost_amount NUMERIC(18, 6),
  ADD COLUMN IF NOT EXISTS fixed_cost_amount NUMERIC(18, 6),
  ADD COLUMN IF NOT EXISTS source TEXT;

UPDATE provider_cost_versions
   SET prompt_cost_amount = COALESCE(prompt_cost_amount, ROUND(prompt_cost::numeric, 6)),
       completion_cost_amount = COALESCE(completion_cost_amount, ROUND(completion_cost::numeric, 6)),
       fixed_cost_amount = COALESCE(fixed_cost_amount, ROUND(fixed_cost::numeric, 6));

UPDATE provider_cost_versions
   SET source = CASE WHEN version_label = 'auto-baseline' THEN 'estimate' ELSE 'unknown' END
 WHERE source IS NULL OR source = '' OR version_label = 'auto-baseline';

ALTER TABLE provider_cost_versions
  ADD CONSTRAINT provider_cost_versions_source_valid
    CHECK (source IN ('unknown', 'estimate', 'contract', 'invoice', 'manual', 'import')) NOT VALID,
  ADD CONSTRAINT provider_cost_versions_amounts_valid
    CHECK (
      (prompt_cost_amount IS NULL OR prompt_cost_amount >= 0)
      AND (completion_cost_amount IS NULL OR completion_cost_amount >= 0)
      AND (fixed_cost_amount IS NULL OR fixed_cost_amount >= 0)
    ) NOT VALID,
  ADD CONSTRAINT provider_cost_versions_window_valid
    CHECK (effective_to IS NULL OR effective_to > effective_from) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_provider_cost_versions_source
  ON provider_cost_versions(source);
