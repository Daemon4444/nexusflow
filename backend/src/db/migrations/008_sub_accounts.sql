-- =====================================================
-- 子账号体系（docs/sub-accounts-spec.md）
-- Migration: 008_sub_accounts.sql
-- 全部新列可空/带默认值：存量数据零影响
-- =====================================================

-- 子账号关系与登录
-- parent_user_id 不加 FK 约束：users 自引用 FK 在 pg-mem 下不稳定，且软删除策略下无级联需求，完整性由应用层保证
ALTER TABLE users ADD COLUMN IF NOT EXISTS parent_user_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

-- 消费限额（仅子账号使用；单位与 balance 一致 = CNY）
ALTER TABLE users ADD COLUMN IF NOT EXISTS quota_limit NUMERIC;
ALTER TABLE users ADD COLUMN IF NOT EXISTS quota_used NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS quota_period TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS quota_reset_at TIMESTAMP WITH TIME ZONE;

-- 账单归属：钱记在主账号（user_id），actor_user_id 记录实际发起消费的账号
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS actor_user_id TEXT;

-- 幂等补录：折扣列生产库为手动添加、缺 migration（先例同 006 的 cached_tokens），保证新环境可重建
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS discount_rate NUMERIC;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS discount_amount_cny NUMERIC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_parent ON users(parent_user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_actor ON transactions(actor_user_id);
