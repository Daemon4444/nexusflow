-- Request-scoped billing holds.
-- Prevents concurrent requests from all passing a stale balance pre-check.

CREATE TABLE IF NOT EXISTS billing_reservations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    billing_owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ref_id TEXT NOT NULL UNIQUE,
    reserved_amount NUMERIC(18, 6) NOT NULL CHECK (reserved_amount >= 0),
    actual_amount NUMERIC(18, 6),
    status TEXT NOT NULL DEFAULT 'active'
      CHECK (status IN ('active', 'settled', 'released')),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    settled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_billing_reservations_owner_status
  ON billing_reservations(billing_owner_id, status);
CREATE INDEX IF NOT EXISTS idx_billing_reservations_user_status
  ON billing_reservations(user_id, status);
CREATE INDEX IF NOT EXISTS idx_billing_reservations_expiry
  ON billing_reservations(status, expires_at);

ALTER TABLE async_tasks
  ADD COLUMN IF NOT EXISTS billing_reservation_id TEXT
  REFERENCES billing_reservations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_async_tasks_billing_reservation
  ON async_tasks(billing_reservation_id);

-- Reservation settlements use a dedicated ref prefix, so they can be made
-- idempotent without breaking historical API-key ref_id values.
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_reservation_once
  ON transactions(ref_id)
  WHERE type = 'consumption' AND ref_id LIKE 'reservation:%';
