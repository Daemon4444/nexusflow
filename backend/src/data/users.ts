import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import db from "../db";

export interface User {
  id: string;
  phone: string;
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

/** Hash password with scrypt */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

/** Verify password against stored hash */
export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const computed = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(computed, "hex"));
}

const stmts = {
  getByPhone: db.prepare("SELECT * FROM users WHERE phone = ?"),
  getByEmail: db.prepare("SELECT * FROM users WHERE email = ?"),
  getById: db.prepare("SELECT * FROM users WHERE id = ?"),
  insert: db.prepare(
    "INSERT INTO users (id, phone, email, nickname, balance, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ),
  updateBalance: db.prepare(
    "UPDATE users SET balance = ?, updated_at = ? WHERE id = ?"
  ),
  updatePassword: db.prepare(
    "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?"
  ),
  updateNickname: db.prepare(
    "UPDATE users SET nickname = ?, updated_at = ? WHERE id = ?"
  ),
  // sessions
  insertSession: db.prepare(
    "INSERT INTO sessions (id, user_id, token, created_at, expires_at) VALUES (?, ?, ?, ?, ?)"
  ),
  getSessionByToken: db.prepare(
    "SELECT s.*, u.phone, u.nickname, u.balance, u.email, u.password_hash FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ? AND s.expires_at > datetime('now')"
  ),
  deleteSession: db.prepare("DELETE FROM sessions WHERE token = ?"),
  cleanExpiredSessions: db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')"),
};

/** 通过手机号查找用户 */
export function getUserByPhone(phone: string): User | null {
  return (stmts.getByPhone.get(phone) as User) || null;
}

/** 通过邮箱查找用户 */
export function getUserByEmail(email: string): User | null {
  return (stmts.getByEmail.get(email.toLowerCase()) as User) || null;
}

/** 通过 ID 查找用户 */
export function getUserById(id: string): User | null {
  return (stmts.getById.get(id) as User) || null;
}

/** 创建新用户（手机号） */
export function createUser(phone: string): User {
  const id = uuidv4();
  const now = new Date().toISOString();
  const nickname = `用户${phone.slice(-4)}`;
  stmts.insert.run(id, phone, null, nickname, 0, now, now);
  return stmts.getById.get(id) as User;
}

/** 创建新用户（邮箱） */
export function createUserByEmail(email: string): User {
  const id = uuidv4();
  const now = new Date().toISOString();
  const nickname = email.split("@")[0].slice(0, 8);
  stmts.insert.run(id, null, email.toLowerCase(), nickname, 0, now, now);
  return stmts.getById.get(id) as User;
}

/** 手机号登录，不存在则自动注册（验证码校验已在路由层完成） */
export function loginByPhone(phone: string, _code: string): { user: User; token: string } | null {
  let user = getUserByPhone(phone);
  if (!user) {
    user = createUser(phone);
  }

  // 创建 session
  const sessionId = uuidv4();
  const token = "sess-" + crypto.randomBytes(32).toString("hex");
  const now = new Date().toISOString();
  // session 有效期 7 天
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  stmts.insertSession.run(sessionId, user.id, token, now, expiresAt);

  return { user, token };
}

/** 邮箱登录，不存在则自动注册 */
export function loginByEmail(email: string): { user: User; token: string } | null {
  let user = getUserByEmail(email);
  if (!user) {
    user = createUserByEmail(email);
  }

  const sessionId = uuidv4();
  const token = "sess-" + crypto.randomBytes(32).toString("hex");
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  stmts.insertSession.run(sessionId, user.id, token, now, expiresAt);

  return { user, token };
}

/** 通过 session token 验证用户，返回用户信息 */
export function validateSession(token: string): (User & { sessionToken: string }) | null {
  const row = stmts.getSessionByToken.get(token) as any;
  if (!row) return null;
  return {
    id: row.user_id,
    phone: row.phone,
    email: row.email || null,
    nickname: row.nickname,
    balance: row.balance,
    password_hash: row.password_hash || null,
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at,
    sessionToken: token,
  };
}

/** 登出 */
export function logout(token: string): void {
  stmts.deleteSession.run(token);
}

/** 更新用户余额 */
export function updateUserBalance(userId: string, newBalance: number): void {
  stmts.updateBalance.run(newBalance, new Date().toISOString(), userId);
}

/** 设置/更新密码 */
export function setUserPassword(userId: string, password: string): boolean {
  const hash = hashPassword(password);
  const result = stmts.updatePassword.run(hash, new Date().toISOString(), userId);
  return result.changes > 0;
}

/** 检查用户是否已设置密码 */
export function hasPassword(userId: string): boolean {
  const user = getUserById(userId);
  return !!(user && user.password_hash);
}

/** 更新用户昵称 */
export function updateNickname(userId: string, nickname: string): boolean {
  const result = stmts.updateNickname.run(nickname, new Date().toISOString(), userId);
  return result.changes > 0;
}

/** 邮箱 + 密码登录 */
export function loginByPassword(email: string, password: string): { user: User; token: string } | null {
  const user = getUserByEmail(email);
  if (!user || !user.password_hash) return null;
  if (!verifyPassword(password, user.password_hash)) return null;

  const sessionId = uuidv4();
  const token = "sess-" + crypto.randomBytes(32).toString("hex");
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  stmts.insertSession.run(sessionId, user.id, token, now, expiresAt);

  return { user, token };
}

// 启动时清理过期 session
stmts.cleanExpiredSessions.run();

/** 获取所有用户列表（管理后台用） */
export function getAllUsers(): User[] {
  return db.prepare("SELECT * FROM users ORDER BY created_at DESC").all() as User[];
}
