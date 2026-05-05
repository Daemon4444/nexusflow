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
}

export interface Session {
  id: string;
  user_id: string;
  token: string;
  created_at: string;
  expires_at: string;
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
  return db.queryOne<User>("SELECT * FROM users WHERE phone = ?", [phone]);
}

export async function getUserByEmail(email: string): Promise<User | null> {
  return db.queryOne<User>("SELECT * FROM users WHERE email = ?", [email.toLowerCase()]);
}

export async function getUserById(id: string): Promise<User | null> {
  return db.queryOne<User>("SELECT * FROM users WHERE id = ?", [id]);
}

export async function createUser(phone: string): Promise<User> {
  const id = uuidv4();
  const now = new Date().toISOString();
  const nickname = `用户${phone.slice(-4)}`;
  const user = await db.queryOne<User>(
    "INSERT INTO users (id, phone, email, nickname, balance, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *",
    [id, phone, null, nickname, 0, now, now]
  );
  return user!;
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
  return user!;
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
  const user = (await getUserByPhone(phone)) || (await createUser(phone));
  return createSession(user);
}

export async function loginByEmail(email: string): Promise<{ user: User; token: string } | null> {
  const user = (await getUserByEmail(email)) || (await createUserByEmail(email));
  return createSession(user);
}

export async function validateSession(token: string): Promise<(User & { sessionToken: string }) | null> {
  const row = await db.queryOne<any>(
    `SELECT s.*, u.phone, u.nickname, u.balance, u.email, u.password_hash, u.created_at as user_created_at, u.updated_at as user_updated_at
       FROM sessions s
       JOIN users u ON s.user_id = u.id
      WHERE s.token = ? AND s.expires_at > NOW()`,
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
    sessionToken: token,
  };
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
  if (!verifyPassword(password, user.password_hash)) return null;
  return createSession(user);
}

export async function cleanExpiredSessions(): Promise<void> {
  await db.execute("DELETE FROM sessions WHERE expires_at <= NOW()");
}

export async function getAllUsers(): Promise<User[]> {
  return db.queryMany<User>("SELECT * FROM users ORDER BY created_at DESC");
}
