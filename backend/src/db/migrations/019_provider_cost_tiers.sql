-- Traceable upstream cost books.
--
-- This is an expand-only migration. Legacy binaries can continue inserting
-- provider cost rows because every new column is nullable or has a safe
-- default. New binaries fail closed when a token tier is ambiguous or a cache
-- price required by the observed usage is absent.

ALTER TABLE provider_cost_versions
  ADD COLUMN IF NOT EXISTS price_book_id TEXT,
  ADD COLUMN IF NOT EXISTS input_tier_min_tokens BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS input_tier_max_tokens BIGINT,
  ADD COLUMN IF NOT EXISTS cache_read_implicit_cost_amount NUMERIC(18, 6),
  ADD COLUMN IF NOT EXISTS cache_read_explicit_cost_amount NUMERIC(18, 6),
  ADD COLUMN IF NOT EXISTS cache_creation_5m_cost_amount NUMERIC(18, 6),
  ADD COLUMN IF NOT EXISTS source_reference TEXT,
  ADD COLUMN IF NOT EXISTS source_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS source_row_reference TEXT,
  ADD COLUMN IF NOT EXISTS condition_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS coverage_status TEXT;

UPDATE provider_cost_versions
   SET price_book_id = CASE
         WHEN price_book_id IS NULL OR price_book_id = '' THEN id
         ELSE price_book_id
       END,
       coverage_status = CASE
         WHEN coverage_status IS NULL OR coverage_status = '' THEN 'legacy'
         ELSE coverage_status
       END
 WHERE price_book_id IS NULL
    OR price_book_id = ''
    OR coverage_status IS NULL
    OR coverage_status = '';

ALTER TABLE provider_cost_versions
  ADD CONSTRAINT provider_cost_versions_input_tier_valid
    CHECK (
      input_tier_min_tokens >= 0
      AND (
        input_tier_max_tokens IS NULL
        OR input_tier_max_tokens > input_tier_min_tokens
      )
    ) NOT VALID,
  ADD CONSTRAINT provider_cost_versions_cache_amounts_valid
    CHECK (
      (cache_read_implicit_cost_amount IS NULL OR cache_read_implicit_cost_amount >= 0)
      AND (cache_read_explicit_cost_amount IS NULL OR cache_read_explicit_cost_amount >= 0)
      AND (cache_creation_5m_cost_amount IS NULL OR cache_creation_5m_cost_amount >= 0)
    ) NOT VALID,
  ADD CONSTRAINT provider_cost_versions_source_sha256_valid
    CHECK (
      source_sha256 IS NULL
      OR (
        LENGTH(source_sha256) = 64
        AND source_sha256 = LOWER(source_sha256)
      )
    ) NOT VALID,
  ADD CONSTRAINT provider_cost_versions_condition_fingerprint_valid
    CHECK (
      condition_fingerprint IS NULL
      OR (
        LENGTH(condition_fingerprint) = 64
        AND condition_fingerprint = LOWER(condition_fingerprint)
      )
    ) NOT VALID,
  ADD CONSTRAINT provider_cost_versions_coverage_status_valid
    CHECK (
      coverage_status IS NULL
      OR coverage_status IN ('full', 'partial', 'legacy')
    ) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_provider_cost_versions_active_tier
  ON provider_cost_versions (
    provider_id,
    model_id,
    effective_from DESC,
    input_tier_min_tokens,
    input_tier_max_tokens
  );

CREATE INDEX IF NOT EXISTS idx_provider_cost_versions_price_book
  ON provider_cost_versions (price_book_id);

CREATE INDEX IF NOT EXISTS idx_provider_cost_versions_source_sha256
  ON provider_cost_versions (source_sha256);

ALTER TABLE usage_logs
  ADD COLUMN IF NOT EXISTS provider_cache_mode TEXT,
  ADD COLUMN IF NOT EXISTS provider_input_includes_cache BOOLEAN,
  ADD COLUMN IF NOT EXISTS provider_cost_resolution TEXT;

ALTER TABLE usage_logs
  ADD CONSTRAINT usage_logs_provider_cache_mode_valid
    CHECK (
      provider_cache_mode IS NULL
      OR provider_cache_mode IN ('implicit', 'explicit')
    ) NOT VALID,
  ADD CONSTRAINT usage_logs_provider_cost_resolution_valid
    CHECK (
      provider_cost_resolution IS NULL
      OR provider_cost_resolution IN (
        'exact',
        'not_applicable',
        'missing_provider',
        'missing_version',
        'missing_tier',
        'ambiguous_tier',
        'missing_cache_mode',
        'missing_cache_rate',
        'inconsistent_usage',
        'lookup_error',
        'unsupported_pricing'
      )
    ) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_usage_logs_provider_cost_resolution
  ON usage_logs (provider_cost_resolution, created_at DESC);
