-- Config-driven control plane (P3), expand-only.
--
-- These tables hold the *current published* state of the four configuration
-- entities. They are written only by the control-plane publish path
-- (change request -> validation -> publish), never by request handlers.
-- The runtime does not read them per request: it loads the immutable JSON
-- snapshot in cp_config_versions (migration 031) and swaps it atomically.
-- Until NF_CP_MODE=enforce the legacy sources (static catalog,
-- model_overrides, providers, provider_capacity, ...) stay authoritative.

CREATE TABLE IF NOT EXISTS cp_models (
  id TEXT PRIMARY KEY,
  lifecycle TEXT NOT NULL DEFAULT 'draft'
    CHECK (lifecycle IN ('draft', 'preview', 'active', 'deprecated', 'retired')),
  display JSONB NOT NULL DEFAULT '{}'::jsonb,
  limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  pricing JSONB NOT NULL DEFAULT '{}'::jsonb,
  protocols JSONB NOT NULL DEFAULT '[]'::jsonb,
  capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  param_overrides JSONB,
  preview_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  replacement_model_id TEXT,
  deprecation_date TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS cp_upstream_accounts (
  id TEXT PRIMARY KEY,
  vendor TEXT NOT NULL,
  adapter TEXT NOT NULL
    CHECK (adapter IN ('openai-compat', 'anthropic', 'dashscope-native', 'ark-video', 'azure-openai', 'pixverse')),
  base_url TEXT,
  native_base_url TEXT,
  anthropic_base_url TEXT,
  auth_scheme TEXT NOT NULL DEFAULT 'bearer'
    CHECK (auth_scheme IN ('bearer', 'x-api-key', 'api-key')),
  -- Where the credential lives; secrets are never stored in this table.
  -- e.g. 'legacy_provider:dashscope' = providers.api_key (encrypted with
  -- PROVIDER_SECRET_KEY) or its environment fallback.
  secret_ref TEXT NOT NULL,
  region TEXT,
  is_relay BOOLEAN NOT NULL DEFAULT FALSE,
  relay_operator TEXT,
  data_path TEXT,
  quota JSONB NOT NULL DEFAULT '{}'::jsonb,
  quota_source TEXT NOT NULL DEFAULT 'unverified'
    CHECK (quota_source IN ('console', 'contract', 'observed', 'unverified', 'docs', 'legacy_default')),
  quota_verified_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'draining', 'disabled')),
  owner TEXT,
  contract_ref TEXT,
  contact TEXT,
  legacy_provider_id TEXT,
  legacy_channel_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS cp_quota_pools (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES cp_upstream_accounts(id),
  name TEXT NOT NULL,
  rpm INTEGER NOT NULL DEFAULT 0 CHECK (rpm >= 0),
  tpm BIGINT NOT NULL DEFAULT 0 CHECK (tpm >= 0),
  concurrency INTEGER NOT NULL DEFAULT 0 CHECK (concurrency >= 0),
  daily INTEGER NOT NULL DEFAULT 0 CHECK (daily >= 0),
  source TEXT NOT NULL DEFAULT 'unverified'
    CHECK (source IN ('console', 'contract', 'observed', 'unverified', 'docs', 'legacy_default')),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cp_routes (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES cp_upstream_accounts(id),
  upstream_model_id TEXT NOT NULL,
  -- Protocols the upstream of this route supports natively and that were
  -- verified by probing (D6: no protocol conversion).
  native_protocols JSONB NOT NULL DEFAULT '[]'::jsonb,
  priority INTEGER NOT NULL DEFAULT 10,
  weight INTEGER NOT NULL DEFAULT 100 CHECK (weight >= 0),
  quota_pool_id TEXT REFERENCES cp_quota_pools(id),
  rpm INTEGER NOT NULL DEFAULT 0 CHECK (rpm >= 0),
  tpm BIGINT NOT NULL DEFAULT 0 CHECK (tpm >= 0),
  concurrency INTEGER NOT NULL DEFAULT 0 CHECK (concurrency >= 0),
  daily INTEGER NOT NULL DEFAULT 0 CHECK (daily >= 0),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'standby', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (model_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_cp_routes_model ON cp_routes (model_id);

CREATE TABLE IF NOT EXISTS cp_traffic_policies (
  id TEXT PRIMARY KEY,
  -- global | model:<id> | model_type:chat|async | user:<id>
  scope TEXT NOT NULL UNIQUE,
  user_default JSONB,
  fair_share JSONB,
  overflow JSONB,
  circuit JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
