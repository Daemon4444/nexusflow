import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db/client";

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

function hashApiKey(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function maskApiKey(token: string): string {
  if (!token) return "";
  if (!token.startsWith("sk-air-")) return token.length <= 8 ? "********" : `${token.slice(0, 4)}********${token.slice(-4)}`;
  return token.length <= 20 ? `${token.slice(0, 8)}...` : `${token.slice(0, 12)}••••••••${token.slice(-8)}`;
}

export async function getAllKeys(): Promise<ApiKey[]> {
  return db.queryMany<ApiKey>("SELECT * FROM api_keys ORDER BY created_at DESC");
}

export async function getKeysByUser(userId: string): Promise<ApiKey[]> {
  return db.queryMany<ApiKey>("SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC", [userId]);
}

export async function validateApiKey(token: string): Promise<(ApiKey & { parent_user_id: string | null; allowed_models: string | null }) | null> {
  const tokenHash = hashApiKey(token);
  // join 用户状态 + 子账号模型权限：账号（及其主账号）非 active 时 key 立即失效（spec §5）
  // 安全：只允许 sha256 哈希比对。key 列存的是脱敏预览串，绝不能参与鉴权
  // （历史上 `OR k.key = ?` 会让脱敏串本身成为有效凭据——脱敏是幂等的，
  //  dashboard 展示的预览与库中 key 列逐字节相等）。生产已核实全部 key 均有 key_hash。
  const key = await db.queryOne<ApiKey & { user_status: string | null; parent_status: string | null; parent_user_id: string | null; allowed_models: string | null }>(
    `SELECT k.*, u.status as user_status, p.status as parent_status,
            u.parent_user_id as parent_user_id, u.allowed_models as allowed_models
       FROM api_keys k
       LEFT JOIN users u ON u.id = k.user_id
       LEFT JOIN users p ON p.id = u.parent_user_id
      WHERE k.key_hash = ?
      LIMIT 1`,
    [tokenHash]
  );
  if (!key) return null;
  if (key.user_id) {
    if ((key.user_status || "active") !== "active") return null;
    if (key.parent_status != null && key.parent_status !== "active") return null;
  }
  await db.execute("UPDATE api_keys SET last_used = ?, usage_count = usage_count + 1 WHERE id = ?", [
    new Date().toISOString(),
    key.id,
  ]);
  return key;
}

export async function createApiKey(name: string, rateLimit = 60, userId?: string): Promise<ApiKey> {
  const id = uuidv4();
  const fullKey = "sk-air-" + crypto.randomBytes(24).toString("hex");
  const keyHash = hashApiKey(fullKey);
  const now = new Date().toISOString();
  const row = await db.queryOne<ApiKey>(
    `INSERT INTO api_keys (id, user_id, name, key, key_hash, created_at, last_used, usage_count, rate_limit)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING *`,
    [id, userId || null, name, maskApiKey(fullKey), keyHash, now, null, 0, rateLimit]
  );
  return { ...row!, key: fullKey, key_hash: keyHash };
}

export async function deleteApiKey(id: string): Promise<boolean> {
  const changed = await db.execute("DELETE FROM api_keys WHERE id = ?", [id]);
  return changed > 0;
}

export async function deleteApiKeyByUser(id: string, userId: string): Promise<boolean> {
  const changed = await db.execute("DELETE FROM api_keys WHERE id = ? AND user_id = ?", [id, userId]);
  return changed > 0;
}

export async function seedApiKeysIfNeeded(): Promise<void> {
  const row = await db.queryOne<{ cnt: string | number }>("SELECT COUNT(*) as cnt FROM api_keys");
  const count = Number(row?.cnt || 0);
  if (count === 0 && process.env.ENABLE_SEED_API_KEYS === "true" && process.env.NODE_ENV !== "production") {
    await createApiKey("默认密钥", 60);
    await createApiKey("测试环境密钥", 30);
    console.log("[DB] 已创建默认密钥");
  }
}
