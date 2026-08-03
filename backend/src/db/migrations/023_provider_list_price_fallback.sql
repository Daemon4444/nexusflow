-- Expand-only evidence for the source of an exact realized provider cost.
-- The existing provider_cost_resolution constraint remains untouched so the
-- previous binary can continue writing usage throughout a rolling release.

ALTER TABLE usage_logs
  ADD COLUMN IF NOT EXISTS provider_cost_basis TEXT;

ALTER TABLE usage_logs
  ADD CONSTRAINT usage_logs_provider_cost_basis_valid
    CHECK (
      provider_cost_basis IS NULL
      OR provider_cost_basis IN ('price_book', 'official_list')
    ) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_usage_logs_provider_cost_basis
  ON usage_logs (provider_cost_basis, created_at DESC);
