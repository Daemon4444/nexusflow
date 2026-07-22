-- Independent admin-granted credit that can pay for requests like cash balance.
-- Cash is consumed first; credit is used only for the remainder.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS credit_balance NUMERIC(18, 6) NOT NULL DEFAULT 0;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS credit_amount NUMERIC(18, 6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_after NUMERIC(18, 6);

-- All accounts start with zero credit when this migration is installed, so
-- historical rows also have a zero credit snapshot.
UPDATE transactions SET credit_after = 0 WHERE credit_after IS NULL;

ALTER TABLE transactions
  ALTER COLUMN credit_after SET DEFAULT 0;
