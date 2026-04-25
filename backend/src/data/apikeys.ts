import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import db from "../db";

export interface ApiKey {
  id: string;
  user_id: string | null;
  name: string;
  key: string;
  created_at: string;
  last_used: string | null;
  usage_count: number;
  rate_limit: number;
}

// 预置语句
const stmts = {
  getAll: db.prepare("SELECT * FROM api_keys ORDER BY created_at DESC"),
  getByUser: db.prepare("SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC"),
  getByKey: db.prepare("SELECT * FROM api_keys WHERE key = ?"),
  getById: db.prepare("SELECT * FROM api_keys WHERE id = ?"),
  insert: db.prepare(
    "INSERT INTO api_keys (id, user_id, name, key, created_at, last_used, usage_count, rate_limit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ),
  delete: db.prepare("DELETE FROM api_keys WHERE id = ?"),
  deleteByUser: db.prepare("DELETE FROM api_keys WHERE id = ? AND user_id = ?"),
  updateUsage: db.prepare(
    "UPDATE api_keys SET last_used = ?, usage_count = usage_count + 1 WHERE id = ?"
  ),
};

/** 获取所有密钥 */
export function getAllKeys(): ApiKey[] {
  return stmts.getAll.all() as ApiKey[];
}

/** 获取某个用户的所有密钥 */
export function getKeysByUser(userId: string): ApiKey[] {
  return stmts.getByUser.all(userId) as ApiKey[];
}

/** 通过 Bearer Token 查找密钥，找到则更新 lastUsed 和 usageCount */
export function validateApiKey(token: string): ApiKey | null {
  const key = stmts.getByKey.get(token) as ApiKey | undefined;
  if (key) {
    stmts.updateUsage.run(new Date().toISOString(), key.id);
  }
  return key || null;
}

/** 创建新密钥（关联用户） */
export function createApiKey(name: string, rateLimit = 60, userId?: string): ApiKey {
  const id = uuidv4();
  const fullKey = "sk-air-" + crypto.randomBytes(24).toString("hex");
  const now = new Date().toISOString();

  stmts.insert.run(id, userId || null, name, fullKey, now, null, 0, rateLimit);
  return stmts.getById.get(id) as ApiKey;
}

/** 删除密钥，返回是否成功 */
export function deleteApiKey(id: string): boolean {
  const result = stmts.delete.run(id);
  return result.changes > 0;
}

/** 删除用户的密钥（确保只能删自己的） */
export function deleteApiKeyByUser(id: string, userId: string): boolean {
  const result = stmts.deleteByUser.run(id, userId);
  return result.changes > 0;
}

// 初始化：如果表为空，插入默认密钥
const count = (db.prepare("SELECT COUNT(*) as cnt FROM api_keys").get() as any).cnt;
if (count === 0) {
  createApiKey("默认密钥", 60);
  createApiKey("测试环境密钥", 30);
  console.log("[DB] 已创建默认密钥");
}
