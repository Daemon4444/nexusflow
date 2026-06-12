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

export async function validateApiKey(token: string): Promise<ApiKey | null> {
  const tokenHash = hashApiKey(token);
  const key = await db.queryOne<ApiKey>(
    "SELECT * FROM api_keys WHERE key_hash = ? OR key = ? LIMIT 1",
    [tokenHash, token]
  );
  if (key) {
    await db.execute("UPDATE api_keys SET last_used = ?, usage_count = usage_count + 1 WHERE id = ?", [
      new Date().toISOString(),
      key.id,
    ]);
  }
  return key || null;
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
    await createApiKey("Default key", 60);
    await createApiKey("Test environment key", 30);
    console.log("[DB] default API keys created");
  }
}
