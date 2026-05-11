-- User/model commercial discounts.
-- discount_rate is a multiplier applied to catalog price:
--   1.0 = no discount, 0.8 = 20% off, 0 = free.

CREATE TABLE IF NOT EXISTS user_model_discounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    model_id TEXT NOT NULL,
    discount_rate NUMERIC(8, 6) NOT NULL DEFAULT 1,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT NOT NULL DEFAULT '',
    created_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, model_id)
);

CREATE INDEX IF NOT EXISTS idx_user_model_discounts_user ON user_model_discounts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_model_discounts_model ON user_model_discounts(model_id);
CREATE INDEX IF NOT EXISTS idx_user_model_discounts_enabled ON user_model_discounts(is_enabled);
