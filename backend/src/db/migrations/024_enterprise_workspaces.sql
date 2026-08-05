-- Enterprise tenant and reseller foundation.
--
-- This migration is additive so the previous ACK/ECS binaries remain safe
-- during a rolling upgrade or rollback window.

CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    legal_name TEXT,
    status TEXT NOT NULL DEFAULT 'active'
      CHECK (status IN ('active', 'suspended', 'closed')),
    plan TEXT NOT NULL DEFAULT 'team'
      CHECK (plan IN ('team', 'business', 'enterprise')),
    billing_mode TEXT NOT NULL DEFAULT 'shared_balance'
      CHECK (billing_mode IN ('shared_balance', 'invoiced')),
    reseller_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    brand_name TEXT,
    custom_domain TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_owner
  ON organizations(owner_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS organization_members (
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'billing', 'developer', 'viewer')),
    status TEXT NOT NULL DEFAULT 'active'
      CHECK (status IN ('invited', 'active', 'suspended')),
    invited_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    joined_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_organization_members_user
  ON organization_members(user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS organization_offers (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    public_slug TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    pricing_mode TEXT NOT NULL DEFAULT 'markup'
      CHECK (pricing_mode IN ('markup', 'fixed_discount', 'contract')),
    markup_percent NUMERIC(8, 3) NOT NULL DEFAULT 0
      CHECK (markup_percent >= 0 AND markup_percent <= 1000),
    model_scope JSONB NOT NULL DEFAULT '[]'::jsonb,
    monthly_minimum NUMERIC(18, 6) NOT NULL DEFAULT 0
      CHECK (monthly_minimum >= 0),
    status TEXT NOT NULL DEFAULT 'draft'
      CHECK (status IN ('draft', 'active', 'archived')),
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organization_offers_org
  ON organization_offers(organization_id, status, created_at DESC);
