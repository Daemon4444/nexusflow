-- Durable lifecycle metadata for newly uploaded objects.
--
-- Historical OSS/local files are intentionally not backfilled because their
-- ownership and retention intent are unknown. Only objects registered by the
-- new upload path are eligible for automated expiry.

CREATE TABLE IF NOT EXISTS upload_objects (
    id TEXT PRIMARY KEY,
    object_key TEXT NOT NULL UNIQUE,
    owner_identity TEXT NOT NULL,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    api_key_id TEXT REFERENCES api_keys(id) ON DELETE SET NULL,
    storage TEXT NOT NULL CHECK (storage IN ('oss', 'local')),
    size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
    content_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
      CHECK (status IN ('active', 'delete_pending', 'delete_failed', 'deleted')),
    expires_at TIMESTAMPTZ NOT NULL,
    delete_attempts INTEGER NOT NULL DEFAULT 0,
    next_cleanup_at TIMESTAMPTZ,
    cleanup_lease_until TIMESTAMPTZ,
    last_error TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_upload_objects_cleanup
  ON upload_objects(status, expires_at, next_cleanup_at, cleanup_lease_until);
CREATE INDEX IF NOT EXISTS idx_upload_objects_owner_created
  ON upload_objects(owner_identity, created_at DESC);

