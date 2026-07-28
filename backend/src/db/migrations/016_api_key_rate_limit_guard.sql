-- Self-service API key limits are server-owned. This database constraint is
-- the final guard for internal/admin writes and future code paths.
--
-- Production was checked before this migration: all existing rows are within
-- the accepted range. NOT VALID keeps the expand migration rollout-safe while
-- still enforcing the constraint for every new or updated row.

ALTER TABLE api_keys
  ADD CONSTRAINT api_keys_rate_limit_valid
  CHECK (rate_limit BETWEEN 1 AND 30000) NOT VALID;
