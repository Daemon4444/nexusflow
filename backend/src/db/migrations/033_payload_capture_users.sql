-- Full request/response capture (data return), see
-- backend/src/services/payload-capture.ts. Lookup per request: the caller's
-- row, then the parent account's row, then the '*' row (everyone). A row with
-- enabled = false opts that account out even when '*' is enabled.
-- archive_label names the spool directory and the R2 prefix; NULL means the
-- billing owner's user id. It must stay path-safe ([A-Za-z0-9._-]); rows that
-- are not are ignored by the backend. Never delete a row that already
-- produced archives: set enabled = false.
CREATE TABLE IF NOT EXISTS payload_capture_users (
  user_id TEXT PRIMARY KEY,
  archive_label TEXT UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  enabled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  enabled_by TEXT,
  note TEXT
);
