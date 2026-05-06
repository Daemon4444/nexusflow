-- Store account money and ledger cost values as fixed-scale decimals.
-- REAL/float is not suitable for balances because small API charges are
-- accumulated many times and must remain auditable.

ALTER TABLE users
  ALTER COLUMN balance TYPE NUMERIC(18, 6)
  USING ROUND(balance::numeric, 6),
  ALTER COLUMN balance SET DEFAULT 0;

ALTER TABLE transactions
  ALTER COLUMN amount TYPE NUMERIC(18, 6)
  USING ROUND(amount::numeric, 6),
  ALTER COLUMN balance_after TYPE NUMERIC(18, 6)
  USING ROUND(balance_after::numeric, 6);

ALTER TABLE usage_logs
  ALTER COLUMN cost TYPE NUMERIC(18, 6)
  USING ROUND(cost::numeric, 6),
  ALTER COLUMN cost SET DEFAULT 0;
