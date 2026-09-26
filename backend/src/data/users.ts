import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { db } from "../db/client";
import {
  getSessionTokenSecurityState,
  hashSessionToken,
  SessionSecurityClient,
  sessionStorageMarker,
} from "./session-token-security";

export interface User {
  id: string;
  phone: string | null;
  email: string | null;
  nickname: string;
  balance: number;
  credit_balance: number;
  password_hash: string | null;
  created_at: string;
  updated_at: string;
  // 子账号体系（docs/specs/sub-accounts-spec.md）
  parent_user_id: string | null;
  username: string | null;
  status: string; // 'active' | 'suspended' | 'deleted'
  quota_limit: number | null;
  quota_used: number;
  quota_period: string | null; // 'total' | 'monthly'
  quota_reset_at: string | null;
  allowed_models: string | null; // JSON 数组；NULL=不限；子账号模型权限（migration 009）
}

/**
 * Explicit response-safe user shape. Authentication material must never cross
 * an HTTP serialization boundary, including on privileged admin endpoints.
 */
export interface SafeUser {
  id: string;
  phone: string | null;
  email: string | null;
  nickname: string;
  balance: number;
  credit_balance: number;
  created_at: string;
  updated_at: string;
  parent_user_id: string | null;
  username: string | null;
  status: string;
  quota_limit: number | null;
  quota_used: number;
  quota_period: string | null;
  quota_reset_at: string | null;
  allowed_models: string | null;
  has_password: boolean;
}

export function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    phone: user.phone,
    email: user.email,
    nickname: user.nickname,
    balance: user.balance,
    credit_balance: user.credit_balance,
    created_at: user.created_at,
    updated_at: user.updated_at,
    parent_user_id: user.parent_user_id,
    username: user.username,
    status: user.status,
    quota_limit: user.quota_limit,
    quota_used: user.quota_used,
    quota_period: user.quota_period,
    quota_reset_at: user.quota_reset_at,
    allowed_models: user.allowed_models,
    has_password: !!user.password_hash,
  };
}

export interface Session {
  id: string;
  user_id: string;
  token: string;
  token_hash: string | null;
  created_at: string;
  expires_at: string;
}

function normalizeUser<T extends User | null>(user: T): T {
  if (!user) return user;
  return {
    ...user,
    balance: Number(user.balance || 0),
    credit_balance: Number(user.credit_balance || 0),
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

const DUMMY_PASSWORD_HASH =
  "000102030405060708090a0b0c0d0e0f:51529fdbf27ba343cec03d0fe6c232bd0546a4bf111cbd36e848d15711369e92af8448ca8390d7fdfd2cb60fd60efbc850f78f1c543d2a5c8c13a013d2608f34";

function scryptAsync(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export async function hashPasswordAsync(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await scryptAsync(password, salt);
  return `${salt}:${hash.toString("hex")}`;
}

/**
 * Password-facing request paths use libuv's worker pool instead of blocking
 * the event loop with scryptSync. Callers may pass null for a nonexistent
 * account; the fixed dummy hash preserves one full KDF operation so account
 * enumeration cannot obtain a cheap timing oracle.
 */
export async function verifyPasswordAsync(
  password: string,
  stored: string | null | undefined
): Promise<boolean> {
  const candidate = stored || DUMMY_PASSWORD_HASH;
  const [salt, hash] = candidate.split(":");
  if (!salt || !/^[0-9a-f]{128}$/i.test(hash || "")) {
    // Malformed legacy data still consumes the normal dummy KDF cost.
    await scryptAsync(password, DUMMY_PASSWORD_HASH.split(":")[0]);
    return false;
  }
  const computed = await scryptAsync(password, salt);
  const expected = Buffer.from(hash, "hex");
  const matches =
    expected.length === computed.length
    && crypto.timingSafeEqual(expected, computed);
  return !!stored && matches;
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

async function createSessionWithClient(
  user: User,
  client: SessionSecurityClient
): Promise<{ user: User; token: string }> {
  const sessionId = uuidv4();
  const token = "sess-" + crypto.randomBytes(32).toString("hex");
  const tokenHash = hashSessionToken(token);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  // Lock the mode row so a cutover/rollback cannot race this INSERT. A new
  // binary never writes a raw bearer, even in legacy-compatible read mode.
  await getSessionTokenSecurityState(client, "share");
  const storedToken = sessionStorageMarker(sessionId);
  await client.execute(
    `INSERT INTO sessions (
       id, user_id, token, token_hash, created_at, expires_at
     ) VALUES (?, ?, ?, ?, ?, ?)`,
    [sessionId, user.id, storedToken, tokenHash, now, expiresAt]
  );
  return { user, token };
}

async function createSession(user: User): Promise<{ user: User; token: string }> {
  return db.transaction((tx) => createSessionWithClient(user, tx));
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
  return db.transaction(async (tx) => {
    const user = normalizeUser(await tx.queryOne<User>(
      "SELECT * FROM users WHERE username = ? FOR SHARE",
      [username.toLowerCase()]
    ));
    const passwordMatches = await verifyPasswordAsync(password, user?.password_hash);
    if (!user || !user.password_hash || !passwordMatches) return null;
    if (user.status !== "active") return null;
    return createSessionWithClient(user, tx);
  });
}

export async function validateSession(token: string): Promise<(User & { sessionToken: string }) | null> {
  const selectSession = (predicate: string, value: string) => db.queryOne<any>(
    `SELECT s.*, u.phone, u.nickname, u.balance, u.credit_balance, u.email, u.password_hash, u.created_at as user_created_at, u.updated_at as user_updated_at,
            u.parent_user_id, u.username, u.status, u.quota_limit, u.quota_used, u.quota_period, u.quota_reset_at, u.allowed_models
       FROM sessions s
       JOIN users u ON s.user_id = u.id
      WHERE ${predicate} = ? AND s.expires_at > NOW() AND u.status = 'active'`,
    [value]
  );
  let row = await selectSession("s.token_hash", hashSessionToken(token));
  if (!row) {
    const state = await getSessionTokenSecurityState();
    if (!state.hash_only) {
      row = await selectSession("s.token", token);
    }
  }
  if (!row) return null;
  return {
    id: row.user_id,
    phone: row.phone,
    email: row.email || null,
    nickname: row.nickname,
    balance: Number(row.balance || 0),
    credit_balance: Number(row.credit_balance || 0),
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
  const state = await getSessionTokenSecurityState();
  if (state.hash_only) {
    await db.execute("DELETE FROM sessions WHERE token_hash = ?", [hashSessionToken(token)]);
    return;
  }
  await db.execute(
    "DELETE FROM sessions WHERE token_hash = ? OR token = ?",
    [hashSessionToken(token), token]
  );
}

export async function updateUserBalance(userId: string, newBalance: number): Promise<void> {
  await db.execute("UPDATE users SET balance = ?, updated_at = ? WHERE id = ?", [
    newBalance,
    new Date().toISOString(),
    userId,
  ]);
}

export async function setUserPassword(userId: string, password: string): Promise<boolean> {
  const hash = await hashPasswordAsync(password);
  const changed = await db.execute("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", [
    hash,
    new Date().toISOString(),
    userId,
  ]);
  return changed > 0;
}

export type InitialPasswordResult = "success" | "already_set" | "not_found";

/**
 * Performs the one-time password bootstrap and revokes every pre-existing
 * session in the same transaction. The `password_hash IS NULL` predicate is
 * the concurrency boundary: two valid sessions can race, but only one can
 * establish the initial credential.
 */
export async function setInitialPasswordAndRevokeSessions(
  userId: string,
  password: string
): Promise<InitialPasswordResult> {
  // Avoid spending a KDF for the common rejected overwrite path. The
  // conditional UPDATE below remains the authoritative race boundary.
  const current = await db.queryOne<{ password_hash: string | null }>(
    "SELECT password_hash FROM users WHERE id = ?",
    [userId]
  );
  if (!current) return "not_found";
  if (current.password_hash) return "already_set";
  const passwordHash = await hashPasswordAsync(password);
  const now = new Date().toISOString();
  return db.transaction(async (tx) => {
    const changed = await tx.queryOne<{ id: string }>(
      `UPDATE users
          SET password_hash = ?, updated_at = ?
        WHERE id = ? AND password_hash IS NULL
        RETURNING id`,
      [passwordHash, now, userId]
    );
    if (!changed) {
      const existing = await tx.queryOne<{ password_hash: string | null }>(
        "SELECT password_hash FROM users WHERE id = ?",
        [userId]
      );
      return existing ? "already_set" : "not_found";
    }
    await tx.execute("DELETE FROM sessions WHERE user_id = ?", [userId]);
    return "success";
  });
}

export type ChangePasswordResult =
  | "success"
  | "invalid_old_password"
  | "password_not_set"
  | "not_found";

/**
 * Serializes password verification and mutation on the user row, then revokes
 * all sessions before commit. No token (including the caller's or an admin
 * session) survives a credential change.
 */
export async function changePasswordAndRevokeSessions(
  userId: string,
  oldPassword: string,
  newPassword: string
): Promise<ChangePasswordResult> {
  const now = new Date().toISOString();
  return db.transaction(async (tx) => {
    const user = await tx.queryOne<{ password_hash: string | null }>(
      "SELECT password_hash FROM users WHERE id = ? FOR UPDATE",
      [userId]
    );
    if (!user) return "not_found";
    if (!user.password_hash) return "password_not_set";
    if (!(await verifyPasswordAsync(oldPassword, user.password_hash))) {
      return "invalid_old_password";
    }
    const newPasswordHash = await hashPasswordAsync(newPassword);

    await tx.execute(
      "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
      [newPasswordHash, now, userId]
    );
    await tx.execute("DELETE FROM sessions WHERE user_id = ?", [userId]);
    return "success";
  });
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
  return db.transaction(async (tx) => {
    const user = normalizeUser(await tx.queryOne<User>(
      "SELECT * FROM users WHERE email = ? FOR SHARE",
      [email.toLowerCase()]
    ));
    const passwordMatches = await verifyPasswordAsync(password, user?.password_hash);
    if (!user || !user.password_hash || !passwordMatches) return null;
    if (user.status !== "active") return null;
    return createSessionWithClient(user, tx);
  });
}

export async function cleanExpiredSessions(): Promise<void> {
  await db.execute("DELETE FROM sessions WHERE expires_at <= NOW()");
}

export async function getAllUsers(): Promise<User[]> {
  const users = await db.queryMany<User>("SELECT * FROM users ORDER BY created_at DESC");
  return users.map((user) => normalizeUser(user)!);
}
