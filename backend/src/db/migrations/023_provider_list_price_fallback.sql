-- When no verified negotiated/imported price applies, a successful request may
-- use its immutable settlement-time retail list-price snapshot as upstream
-- list cost. The negotiated price-book lookup still runs first.

ALTER TABLE usage_logs
  DROP CONSTRAINT IF EXISTS usage_logs_provider_cost_resolution_valid;

ALTER TABLE usage_logs
  ADD CONSTRAINT usage_logs_provider_cost_resolution_valid
    CHECK (
      provider_cost_resolution IS NULL
      OR provider_cost_resolution IN (
        'exact',
        'list_price_fallback',
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
