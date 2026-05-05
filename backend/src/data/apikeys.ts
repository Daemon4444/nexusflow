import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import db from "../db";

export interface ApiKey {
  id: string;
  user_id: string | null;
  name: string;
  key: string;
  key_hash?: string | null;
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
  getByKeyHash: db.prepare("SELECT * FROM api_keys WHERE key_hash = ?"),
  getById: db.prepare("SELECT * FROM api_keys WHERE id = ?"),
  insert: db.prepare(
    "INSERT INTO api_keys (id, user_id, name, key, key_hash, created_at, last_used, usage_count, rate_limit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ),
  delete: db.prepare("DELETE FROM api_keys WHERE id = ?"),
  deleteByUser: db.prepare("DELETE FROM api_keys WHERE id = ? AND user_id = ?"),
  updateUsage: db.prepare(
    "UPDATE api_keys SET last_used = ?, usage_count = usage_count + 1 WHERE id = ?"
  ),
};

function hashApiKey(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function maskApiKey(token: string): string {
  if (!token) return "";
  if (!token.startsWith("sk-air-")) return token.length <= 8 ? "********" : `${token.slice(0, 4)}********${token.slice(-4)}`;
  return token.length <= 20 ? `${token.slice(0, 8)}...` : `${token.slice(0, 12)}••••••••${token.slice(-8)}`;
}

function migratePlaintextKeys(): void {
  try {
    const cols = db.pragma("table_info(api_keys)") as Array<{ name: string }>;
    if (!cols.some((col) => col.name === "key_hash")) {
      db.exec("ALTER TABLE api_keys ADD COLUMN key_hash TEXT");
    }
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash)");

    const rows = db.prepare("SELECT id, key, key_hash FROM api_keys").all() as Array<{ id: string; key: string; key_hash?: string | null }>;
    const updateHash = db.prepare("UPDATE api_keys SET key_hash = ?, key = ? WHERE id = ?");
    for (const row of rows) {
      if (!row.key_hash && row.key?.startsWith("sk-air-")) {
        updateHash.run(hashApiKey(row.key), maskApiKey(row.key), row.id);
      }
    }
  } catch (error: any) {
    console.error("[DB] API Key 迁移失败:", error.message);
  }
}

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
  const tokenHash = hashApiKey(token);
  const key = (stmts.getByKeyHash.get(tokenHash) || stmts.getByKey.get(token)) as ApiKey | undefined;
  if (key) {
    stmts.updateUsage.run(new Date().toISOString(), key.id);
  }
  return key || null;
}

/** 创建新密钥（关联用户） */
export function createApiKey(name: string, rateLimit = 60, userId?: string): ApiKey {
  const id = uuidv4();
  const fullKey = "sk-air-" + crypto.randomBytes(24).toString("hex");
  const keyHash = hashApiKey(fullKey);
  const now = new Date().toISOString();

  stmts.insert.run(id, userId || null, name, maskApiKey(fullKey), keyHash, now, null, 0, rateLimit);
  return { ...(stmts.getById.get(id) as ApiKey), key: fullKey, key_hash: keyHash };
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

migratePlaintextKeys();

// 初始化：仅允许显式开启的非生产环境创建演示密钥
const count = (db.prepare("SELECT COUNT(*) as cnt FROM api_keys").get() as any).cnt;
if (count === 0 && process.env.ENABLE_SEED_API_KEYS === "true" && process.env.NODE_ENV !== "production") {
  createApiKey("默认密钥", 60);
  createApiKey("测试环境密钥", 30);
  console.log("[DB] 已创建默认密钥");
}
