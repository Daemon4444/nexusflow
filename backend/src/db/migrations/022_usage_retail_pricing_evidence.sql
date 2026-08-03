-- Persist the retail pricing facts used at settlement time.
-- Catalog prices and model capabilities can change later, so billing exports
-- must not reconstruct money from the current catalog or guess thinking mode.

ALTER TABLE usage_logs
  ADD COLUMN IF NOT EXISTS retail_list_cost NUMERIC(18, 6),
  ADD COLUMN IF NOT EXISTS retail_discount_rate NUMERIC(8, 6),
  ADD COLUMN IF NOT EXISTS retail_discount_amount NUMERIC(18, 6),
  ADD COLUMN IF NOT EXISTS thinking_output BOOLEAN;

ALTER TABLE usage_logs
  ADD CONSTRAINT usage_logs_retail_list_cost_nonnegative
    CHECK (retail_list_cost IS NULL OR retail_list_cost >= 0) NOT VALID,
  ADD CONSTRAINT usage_logs_retail_discount_rate_valid
    CHECK (
      retail_discount_rate IS NULL
      OR (retail_discount_rate >= 0 AND retail_discount_rate <= 1)
    ) NOT VALID,
  ADD CONSTRAINT usage_logs_retail_discount_amount_nonnegative
    CHECK (retail_discount_amount IS NULL OR retail_discount_amount >= 0) NOT VALID;
