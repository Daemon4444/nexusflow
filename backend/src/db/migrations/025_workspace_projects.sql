-- Workspace projects and cost-center identity bindings.
--
-- Additive only: existing personal, organization and sub-account paths remain
-- valid during ACK/ECS rolling upgrades and rollback windows.

CREATE TABLE IF NOT EXISTS organization_projects (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    environment TEXT NOT NULL DEFAULT 'production'
      CHECK (environment IN ('production', 'sandbox', 'customer')),
    status TEXT NOT NULL DEFAULT 'active'
      CHECK (status IN ('active', 'archived')),
    monthly_budget NUMERIC(18, 6)
      CHECK (monthly_budget IS NULL OR monthly_budget >= 0),
    model_scope JSONB NOT NULL DEFAULT '[]'::jsonb,
    region TEXT NOT NULL DEFAULT 'cn-beijing',
    sla_tier TEXT NOT NULL DEFAULT 'standard'
      CHECK (sla_tier IN ('standard', 'business', 'premium')),
    rpm_limit INTEGER NOT NULL DEFAULT 0 CHECK (rpm_limit >= 0),
    tpm_limit INTEGER NOT NULL DEFAULT 0 CHECK (tpm_limit >= 0),
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS idx_organization_projects_org
  ON organization_projects(organization_id, status, created_at ASC);

CREATE TABLE IF NOT EXISTS organization_project_principals (
    project_id TEXT NOT NULL REFERENCES organization_projects(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    principal_type TEXT NOT NULL
      CHECK (principal_type IN ('member', 'service_account')),
    role TEXT NOT NULL DEFAULT 'developer'
      CHECK (role IN ('owner', 'manager', 'developer', 'viewer')),
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_organization_project_principals_user
  ON organization_project_principals(user_id, principal_type, created_at DESC);
