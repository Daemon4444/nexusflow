-- Supplier operations layer: costs, route audits, SLA snapshots, customer routing policies.

CREATE TABLE IF NOT EXISTS provider_cost_versions (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    model_id TEXT NOT NULL,
    version_label TEXT NOT NULL DEFAULT 'default',
    pricing_type TEXT NOT NULL DEFAULT 'token',
    prompt_cost REAL NOT NULL DEFAULT 0,
    completion_cost REAL NOT NULL DEFAULT 0,
    fixed_cost REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'CNY',
    effective_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    effective_to TIMESTAMP WITH TIME ZONE,
    notes TEXT NOT NULL DEFAULT '',
    created_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_cost_versions_route ON provider_cost_versions(provider_id, model_id);
CREATE INDEX IF NOT EXISTS idx_provider_cost_versions_effective ON provider_cost_versions(effective_from, effective_to);

CREATE TABLE IF NOT EXISTS route_change_audits (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    model_id TEXT NOT NULL,
    action TEXT NOT NULL,
    before_config TEXT,
    after_config TEXT,
    actor_id TEXT,
    reason TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_route_change_audits_route ON route_change_audits(provider_id, model_id);
CREATE INDEX IF NOT EXISTS idx_route_change_audits_created ON route_change_audits(created_at);

CREATE TABLE IF NOT EXISTS provider_sla_snapshots (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    model_id TEXT NOT NULL,
    window_start TIMESTAMP WITH TIME ZONE NOT NULL,
    window_end TIMESTAMP WITH TIME ZONE NOT NULL,
    total_requests INTEGER NOT NULL DEFAULT 0,
    success_requests INTEGER NOT NULL DEFAULT 0,
    error_requests INTEGER NOT NULL DEFAULT 0,
    avg_latency_ms INTEGER NOT NULL DEFAULT 0,
    p95_latency_ms INTEGER NOT NULL DEFAULT 0,
    availability REAL NOT NULL DEFAULT 100,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_sla_snapshots_route ON provider_sla_snapshots(provider_id, model_id);
CREATE INDEX IF NOT EXISTS idx_provider_sla_snapshots_window ON provider_sla_snapshots(window_start, window_end);

CREATE TABLE IF NOT EXISTS customer_route_policies (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    model_id TEXT NOT NULL DEFAULT '*',
    strategy TEXT NOT NULL DEFAULT 'weighted',
    pinned_provider_id TEXT REFERENCES providers(id) ON DELETE SET NULL,
    allowed_providers TEXT NOT NULL DEFAULT '[]',
    blocked_providers TEXT NOT NULL DEFAULT '[]',
    priority_boost TEXT NOT NULL DEFAULT '{}',
    min_availability REAL,
    max_prompt_cost REAL,
    max_completion_cost REAL,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT NOT NULL DEFAULT '',
    created_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_route_policies_user ON customer_route_policies(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_route_policies_model ON customer_route_policies(model_id);
CREATE INDEX IF NOT EXISTS idx_customer_route_policies_enabled ON customer_route_policies(is_enabled);
