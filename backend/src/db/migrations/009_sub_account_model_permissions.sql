-- =====================================================
-- 子账号模型权限（主账号授权子账号可用哪些模型）
-- Migration: 009_sub_account_model_permissions.sql
-- 新列可空：存量数据零影响
-- 语义：allowed_models 存 JSON 数组
--   NULL      = 不限（存量老子账号 → 继续放行，向后兼容）
--   '[]'      = 全禁（新建子账号默认，须主账号显式授权）
--   '["id"]'  = 白名单（仅列表内模型放行）
-- 主账号（parent_user_id IS NULL）永不检查，恒放行。
-- =====================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_models TEXT;
