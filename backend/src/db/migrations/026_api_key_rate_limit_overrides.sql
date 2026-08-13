-- API keys inherit the account/model plan by default.  A nullable override is
-- an optional, narrower per-key safety valve; it is not a second mandatory
-- plan limit.  Keep the legacy rate_limit column during the expand/rollback
-- window so the previous application remains compatible.

ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS rate_limit_override INTEGER;

ALTER TABLE api_keys
  ADD CONSTRAINT api_keys_rate_limit_override_valid
  CHECK (rate_limit_override IS NULL OR rate_limit_override BETWEEN 1 AND 1000000) NOT VALID;

