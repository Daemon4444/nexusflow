-- One real recharge ledger row per Alipay order. Payment status, balance and
-- this row are written in a single transaction by settlePaidPaymentOrder.
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_alipay_once
  ON transactions(ref_id)
  WHERE type = 'recharge' AND ref_id LIKE 'alipay:%';
