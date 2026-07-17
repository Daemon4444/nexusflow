import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { db } from "../db/client";

export interface User {
  id: string;
  phone: string | null;
  email: string | null;
  nickname: string;
  balance: number;
  password_hash: string | null;
  created_at: string;
  updated_at: string;
  // 子账号体系（docs/sub-accounts-spec.md）
  parent_user_id: string | null;
  username: string | null;
  status: string; // 'active' | 'suspended' | 'deleted'
  quota_limit: number | null;
  quota_used: number;
  quota_period: string | null; // 'total' | 'monthly'
  quota_reset_at: string | null;
  allowed_models: string | null; // JSON 数组；NULL=不限；子账号模型权限（migration 009）
}

export interface Session {
  id: string;
  user_id: string;
  token: string;
  created_at: string;
  expires_at: string;
}

function normalizeUser<T extends User | null>(user: T): T {
  if (!user) return user;
  return {
    ...user,
    balance: Number(user.balance || 0),
    parent_user_id: user.parent_user_id || null,
    username: user.username || null,
    status: user.status || "active",
    quota_limit: user.quota_limit == null ? null : Number(user.quota_limit),
    quota_used: Number(user.quota_used || 0),
    quota_period: user.quota_period || null,
    quota_reset_at: user.quota_reset_at || null,
    allowed_models: user.allowed_models ?? null,
  };
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const computed = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(computed, "hex"));
}

export async function getUserByPhone(phone: string): Promise<User | null> {
  return normalizeUser(await db.queryOne<User>("SELECT * FROM users WHERE phone = ?", [phone]));
}

export async function getUserByEmail(email: string): Promise<User | null> {
  return normalizeUser(await db.queryOne<User>("SELECT * FROM users WHERE email = ?", [email.toLowerCase()]));
}

export async function getUserById(id: string): Promise<User | null> {
  return normalizeUser(await db.queryOne<User>("SELECT * FROM users WHERE id = ?", [id]));
}

export async function getUserByUsername(username: string): Promise<User | null> {
  return normalizeUser(await db.queryOne<User>("SELECT * FROM users WHERE username = ?", [username.toLowerCase()]));
}

/** 计费主体：子账号 → 主账号 id；主账号 → 自己 */
export async function resolveBillingOwnerId(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const row = await db.queryOne<{ owner_id: string }>(
    "SELECT COALESCE(parent_user_id, id) as owner_id FROM users WHERE id = ?",
    [userId]
  );
  return row?.owner_id || null;
}

export async function createUser(phone: string): Promise<User> {
  const id = uuidv4();
  const now = new Date().toISOString();
  const nickname = `用户${phone.slice(-4)}`;
  const user = await db.queryOne<User>(
    "INSERT INTO users (id, phone, email, nickname, balance, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *",
    [id, phone, null, nickname, 0, now, now]
  );
  return normalizeUser(user)!;
}

export async function createUserByEmail(email: string): Promise<User> {
  const id = uuidv4();
  const now = new Date().toISOString();
  const normalizedEmail = email.toLowerCase();
  const nickname = normalizedEmail.split("@")[0].slice(0, 8);
  const user = await db.queryOne<User>(
    "INSERT INTO users (id, phone, email, nickname, balance, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *",
    [id, null, normalizedEmail, nickname, 0, now, now]
  );
  return normalizeUser(user)!;
}

async function createSession(user: User): Promise<{ user: User; token: string }> {
  const sessionId = uuidv4();
  const token = "sess-" + crypto.randomBytes(32).toString("hex");
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await db.execute(
    "INSERT INTO sessions (id, user_id, token, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
    [sessionId, user.id, token, now, expiresAt]
  );
  return { user, token };
}

export async function loginByPhone(phone: string, _code: string): Promise<{ user: User; token: string } | null> {
  // TODO: 短信验证码校验未实现，禁止调用此函数
  throw new Error("loginByPhone is not implemented — SMS code verification required");
}

export async function loginByEmail(email: string): Promise<{ user: User; token: string } | null> {
  const user = (await getUserByEmail(email)) || (await createUserByEmail(email));
  if (user.status !== "active") return null;
  return createSession(user);
}

export async function loginByUsername(username: string, password: string): Promise<{ user: User; token: string } | null> {
  const user = await getUserByUsername(username);
  if (!user || !user.password_hash) return null;
  if (user.status !== "active") return null;
  if (!verifyPassword(password, user.password_hash)) return null;
  return createSession(user);
}

export async function validateSession(token: string): Promise<(User & { sessionToken: string }) | null> {
  const row = await db.queryOne<any>(
    `SELECT s.*, u.phone, u.nickname, u.balance, u.email, u.password_hash, u.created_at as user_created_at, u.updated_at as user_updated_at,
            u.parent_user_id, u.username, u.status, u.quota_limit, u.quota_used, u.quota_period, u.quota_reset_at, u.allowed_models
       FROM sessions s
       JOIN users u ON s.user_id = u.id
      WHERE s.token = ? AND s.expires_at > NOW() AND u.status = 'active'`,
    [token]
  );
  if (!row) return null;
  return {
    id: row.user_id,
    phone: row.phone,
    email: row.email || null,
    nickname: row.nickname,
    balance: Number(row.balance || 0),
    password_hash: row.password_hash || null,
    created_at: row.user_created_at || row.created_at,
    updated_at: row.user_updated_at || row.user_created_at || row.created_at,
    parent_user_id: row.parent_user_id || null,
    username: row.username || null,
    status: row.status || "active",
    quota_limit: row.quota_limit == null ? null : Number(row.quota_limit),
    quota_used: Number(row.quota_used || 0),
    quota_period: row.quota_period || null,
    quota_reset_at: row.quota_reset_at || null,
    allowed_models: row.allowed_models ?? null,
    sessionToken: token,
  };
}

export async function deleteSessionsByUserId(userId: string): Promise<void> {
  await db.execute("DELETE FROM sessions WHERE user_id = ?", [userId]);
}

export async function logout(token: string): Promise<void> {
  await db.execute("DELETE FROM sessions WHERE token = ?", [token]);
}

export async function updateUserBalance(userId: string, newBalance: number): Promise<void> {
  await db.execute("UPDATE users SET balance = ?, updated_at = ? WHERE id = ?", [
    newBalance,
    new Date().toISOString(),
    userId,
  ]);
}

export async function setUserPassword(userId: string, password: string): Promise<boolean> {
  const hash = hashPassword(password);
  const changed = await db.execute("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", [
    hash,
    new Date().toISOString(),
    userId,
  ]);
  return changed > 0;
}

export async function hasPassword(userId: string): Promise<boolean> {
  const user = await getUserById(userId);
  return !!(user && user.password_hash);
}

export async function updateNickname(userId: string, nickname: string): Promise<boolean> {
  const changed = await db.execute("UPDATE users SET nickname = ?, updated_at = ? WHERE id = ?", [
    nickname,
    new Date().toISOString(),
    userId,
  ]);
  return changed > 0;
}

export async function loginByPassword(email: string, password: string): Promise<{ user: User; token: string } | null> {
  const user = await getUserByEmail(email);
  if (!user || !user.password_hash) return null;
  if (user.status !== "active") return null;
  if (!verifyPassword(password, user.password_hash)) return null;
  return createSession(user);
}

export async function cleanExpiredSessions(): Promise<void> {
  await db.execute("DELETE FROM sessions WHERE expires_at <= NOW()");
}

export async function getAllUsers(): Promise<User[]> {
  return db.queryMany<User>("SELECT * FROM users ORDER BY created_at DESC");
}
