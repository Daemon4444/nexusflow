-- Control-plane change management (P3/P6), expand-only.

CREATE TABLE IF NOT EXISTS cp_change_requests (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'validated', 'approved', 'published', 'rejected')),
  title TEXT NOT NULL,
  reason TEXT,
  -- Ordered list of entity operations: {op, entity, id, value}.
  changes JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Version the draft was prepared against; publishing re-validates on top
  -- of the then-current version.
  base_version INTEGER,
  validation JSONB,
  affected JSONB NOT NULL DEFAULT '{}'::jsonb,
  author TEXT NOT NULL,
  approver TEXT,
  rejected_by TEXT,
  reject_reason TEXT,
  published_version INTEGER,
  source TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cp_change_requests_status ON cp_change_requests (status, created_at);

-- Immutable published configuration versions. The runtime reads only the
-- highest version. A rollback republishes an older content as a new version.
CREATE TABLE IF NOT EXISTS cp_config_versions (
  version INTEGER PRIMARY KEY CHECK (version > 0),
  content JSONB NOT NULL,
  content_sha256 TEXT NOT NULL,
  parent_version INTEGER,
  change_request_id TEXT,
  kind TEXT NOT NULL DEFAULT 'publish'
    CHECK (kind IN ('backfill', 'publish', 'rollback')),
  note TEXT,
  published_by TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PG_ONLY_CP_VERSION_IMMUTABLE_START
CREATE OR REPLACE FUNCTION cp_config_versions_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'cp_config_versions rows are immutable';
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'cp_config_versions_no_update') THEN
    CREATE TRIGGER cp_config_versions_no_update
      BEFORE UPDATE OR DELETE ON cp_config_versions
      FOR EACH ROW EXECUTE FUNCTION cp_config_versions_immutable();
  END IF;
END $$;
-- PG_ONLY_CP_VERSION_IMMUTABLE_END

CREATE TABLE IF NOT EXISTS cp_route_probe_results (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  protocol TEXT NOT NULL,
  capability TEXT NOT NULL,
  ok BOOLEAN NOT NULL,
  expected BOOLEAN NOT NULL DEFAULT TRUE,
  http_status INTEGER,
  latency_ms INTEGER,
  error TEXT,
  usage JSONB,
  probed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cp_route_probe_results_route ON cp_route_probe_results (route_id, probed_at);
