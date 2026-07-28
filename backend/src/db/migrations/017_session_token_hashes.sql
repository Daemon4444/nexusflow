-- Expand-compatible session bearer protection.
--
-- Phase 1 (this migration): old and new binaries may coexist. New binaries
-- write only token_hash plus a non-secret marker. Legacy binaries may continue
-- to write/read token while hash_only=false, but new binaries only use that
-- column as a legacy-read fallback.
-- Phase 2 (post-rollout hook): revoke all sessions and atomically flip
-- hash_only=true. New sessions then retain only an irreversible hash; token
-- contains a non-secret unique marker required by the legacy schema.

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS token_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token_hash
  ON sessions(token_hash)
  WHERE token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS session_token_security_state (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    hash_only BOOLEAN NOT NULL DEFAULT FALSE,
    release_sha TEXT,
    updated_by TEXT NOT NULL DEFAULT 'migration',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO session_token_security_state (
    singleton, hash_only, release_sha, updated_by, updated_at
) VALUES (
    TRUE, FALSE, NULL, 'migration', NOW()
) ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS session_token_security_events (
    id TEXT PRIMARY KEY,
    transition TEXT NOT NULL CHECK (transition IN ('forward', 'rollback')),
    from_hash_only BOOLEAN NOT NULL,
    to_hash_only BOOLEAN NOT NULL,
    sessions_revoked INTEGER NOT NULL CHECK (sessions_revoked >= 0),
    release_sha TEXT NOT NULL,
    actor TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_token_security_events_created
  ON session_token_security_events(created_at DESC);

-- PG_ONLY_SESSION_TOKEN_TRIGGER_START
-- The trigger takes a shared lock on the singleton state row. This closes the
-- race where a legacy process begins INSERT while the cutover transaction is
-- deleting sessions and flipping hash_only.
CREATE OR REPLACE FUNCTION enforce_session_token_hash_only()
RETURNS TRIGGER AS $$
DECLARE
  hash_only_enabled BOOLEAN;
BEGIN
  SELECT hash_only
    INTO hash_only_enabled
    FROM session_token_security_state
   WHERE singleton = TRUE
   FOR SHARE;

  IF hash_only_enabled THEN
    IF NEW.token_hash IS NULL OR NEW.token NOT LIKE 'session-hash-v1:%' THEN
      RAISE EXCEPTION 'plaintext session bearer storage is disabled';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sessions_enforce_token_hash_only
BEFORE INSERT OR UPDATE OF token, token_hash ON sessions
FOR EACH ROW
EXECUTE FUNCTION enforce_session_token_hash_only();
-- PG_ONLY_SESSION_TOKEN_TRIGGER_END
