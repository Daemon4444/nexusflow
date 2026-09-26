import { Router, Request, Response } from "express";
import {
  changePasswordAndRevokeSessions,
  getUserById,
  loginByEmail,
  loginByPassword,
  loginByUsername,
  logout,
  setInitialPasswordAndRevokeSessions,
  updateNickname,
  validateSession,
} from "../data/users";
import { sendEmailCode, verifyEmailCode } from "../services/email";
import { validateBody, SendCodeSchema, LoginSchema } from "../middleware/validation";
import { getRedis } from "../services/redis";
import { z } from "zod";
import { parseAllowedModels } from "../data/model-access";
import { isDemoAdminSession } from "../middleware/demo-admin";
import { createHash, randomUUID } from "node:crypto";
import {
  isStrongNewPassword,
  NEW_PASSWORD_POLICY_MESSAGE,
} from "../utils/password-policy";
import { getTrustedClientIp } from "../utils/client-ip";
import {
  releaseKdfAdmission,
  reserveKdfAdmission,
  type KdfAdmission,
} from "../services/kdf-admission";

const router = Router();

// ── 登录爆破防护（Redis 原子尝试计数 + 锁定；故障时生产环境 fail-closed）──
const LOGIN_MAX_FAILURES = 5;
const LOGIN_ACCOUNT_MAX_ATTEMPTS = 25;
const LOGIN_WINDOW_SEC = 15 * 60; // 15 分钟窗口，达到阈值即锁定该窗口剩余时间

function positiveAuthLimit(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getAuthClientIp(req: Request): string {
  return getTrustedClientIp(req);
}

function loginIdentityDigest(identity: string): string {
  return createHash("sha256").update(identity.trim().toLowerCase()).digest("hex");
}

function loginAttemptKeys(identity: string, ip: string): {
  accountKey: string;
  sourceKey: string;
  ipKey: string;
  globalKey: string;
  ipConcurrencyKey: string;
  globalConcurrencyKey: string;
} {
  const identityHash = loginIdentityDigest(identity);
  const ipHash = loginIdentityDigest(`ip:${ip}`);
  return {
    accountKey: `login:attempt:v2:account:${identityHash}`,
    sourceKey: `login:attempt:v2:source:${identityHash}:${ip}`,
    ipKey: `login:attempt:v3:ip:${ipHash}`,
    globalKey: "login:attempt:v3:global",
    ipConcurrencyKey: `login:concurrency:v1:ip:${ipHash}`,
    globalConcurrencyKey: "login:concurrency:v1:global",
  };
}

type LoginAttemptAdmission =
  | { allowed: true; leaseId: string }
  | { allowed: false };

async function reserveLoginAttempt(
  identity: string,
  ip: string
): Promise<LoginAttemptAdmission> {
  if (!process.env.REDIS_HOST) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Redis is required for password login rate limiting");
    }
    return { allowed: true, leaseId: "" };
  }

  const keys = loginAttemptKeys(identity, ip);
  const leaseId = randomUUID();
  const now = Date.now();
  const concurrencyTtlSeconds = positiveAuthLimit(
    "LOGIN_CONCURRENCY_TTL_SECONDS",
    30
  );
  const result = (await getRedis().eval(
    `
      local source = tonumber(redis.call("GET", KEYS[1]) or "0")
      local account = tonumber(redis.call("GET", KEYS[2]) or "0")
      local ip = tonumber(redis.call("GET", KEYS[3]) or "0")
      local global = tonumber(redis.call("GET", KEYS[4]) or "0")
      local now = tonumber(ARGV[6])
      local expiresAt = tonumber(ARGV[7])
      if source == nil or account == nil or ip == nil or global == nil then
        return redis.error_reply("invalid login rate-limit state")
      end
      redis.call("ZREMRANGEBYSCORE", KEYS[5], 0, now)
      redis.call("ZREMRANGEBYSCORE", KEYS[6], 0, now)
      if source >= tonumber(ARGV[2])
        or account >= tonumber(ARGV[3])
        or ip >= tonumber(ARGV[4])
        or global >= tonumber(ARGV[5])
        or redis.call("ZCARD", KEYS[5]) >= tonumber(ARGV[9])
        or redis.call("ZCARD", KEYS[6]) >= tonumber(ARGV[10]) then
        return {0}
      end

      source = redis.call("INCR", KEYS[1])
      account = redis.call("INCR", KEYS[2])
      ip = redis.call("INCR", KEYS[3])
      global = redis.call("INCR", KEYS[4])
      if source == 1 then
        redis.call("EXPIRE", KEYS[1], tonumber(ARGV[1]))
      end
      if account == 1 then
        redis.call("EXPIRE", KEYS[2], tonumber(ARGV[1]))
      end
      if ip == 1 then redis.call("EXPIRE", KEYS[3], tonumber(ARGV[1])) end
      if global == 1 then redis.call("EXPIRE", KEYS[4], tonumber(ARGV[1])) end
      redis.call("ZADD", KEYS[5], expiresAt, ARGV[8])
      redis.call("ZADD", KEYS[6], expiresAt, ARGV[8])
      redis.call("EXPIRE", KEYS[5], tonumber(ARGV[11]) + 1)
      redis.call("EXPIRE", KEYS[6], tonumber(ARGV[11]) + 1)
      return {1}
    `,
    6,
    keys.sourceKey,
    keys.accountKey,
    keys.ipKey,
    keys.globalKey,
    keys.ipConcurrencyKey,
    keys.globalConcurrencyKey,
    LOGIN_WINDOW_SEC,
    LOGIN_MAX_FAILURES,
    LOGIN_ACCOUNT_MAX_ATTEMPTS,
    positiveAuthLimit("LOGIN_IP_MAX_ATTEMPTS", 40),
    positiveAuthLimit("LOGIN_GLOBAL_MAX_ATTEMPTS", 1000),
    now,
    now + concurrencyTtlSeconds * 1000,
    leaseId,
    positiveAuthLimit("LOGIN_IP_CONCURRENCY", 4),
    positiveAuthLimit("LOGIN_GLOBAL_CONCURRENCY", 64),
    concurrencyTtlSeconds
  )) as [number];
  return Number(result[0]) === 1
    ? { allowed: true, leaseId }
    : { allowed: false };
}

async function releaseLoginAttempt(
  identity: string,
  ip: string,
  leaseId: string
): Promise<void> {
  if (!process.env.REDIS_HOST || !leaseId) return;
  const keys = loginAttemptKeys(identity, ip);
  try {
    await getRedis().eval(
      `
        redis.call("ZREM", KEYS[1], ARGV[1])
        redis.call("ZREM", KEYS[2], ARGV[1])
        if redis.call("ZCARD", KEYS[1]) == 0 then redis.call("DEL", KEYS[1]) end
        if redis.call("ZCARD", KEYS[2]) == 0 then redis.call("DEL", KEYS[2]) end
        return 1
      `,
      2,
      keys.ipConcurrencyKey,
      keys.globalConcurrencyKey,
      leaseId
    );
  } catch {
    // Leases have a short TTL, so release failure is fail-safe and bounded.
  }
}

async function recordLoginSuccess(identity: string, ip: string): Promise<void> {
  if (!process.env.REDIS_HOST) return;
  const keys = loginAttemptKeys(identity, ip);
  try {
    await getRedis().eval(
      `
        redis.call("DEL", KEYS[1])
        local account = tonumber(redis.call("GET", KEYS[2]) or "0")
        if account <= 1 then
          redis.call("DEL", KEYS[2])
        else
          redis.call("DECR", KEYS[2])
        end
        return 1
      `,
      2,
      keys.sourceKey,
      keys.accountKey
    );
  } catch { /* 清理失败无副作用 */ }
}

const NewPasswordSchema = z
  .string()
  .max(128)
  .refine(
    isStrongNewPassword,
    NEW_PASSWORD_POLICY_MESSAGE
  );

/** 从请求头提取 session token */
function extractSessionToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

async function requireKdfAdmission(
  req: Request,
  res: Response,
  actor: string
): Promise<Extract<KdfAdmission, { allowed: true }> | null> {
  const admission = await reserveKdfAdmission(actor, getAuthClientIp(req));
  if (admission.allowed) return admission;
  const unavailable = admission.reason === "redis_unavailable";
  res.status(unavailable ? 503 : 429).json({
    success: false,
    message: unavailable
      ? "密码服务暂不可用，请稍后重试"
      : "密码操作过于频繁，请稍后重试",
    code: unavailable ? "kdf_admission_unavailable" : "kdf_rate_limited",
  });
  return null;
}

// POST /api/auth/send-code — 发送邮箱验证码
router.post("/send-code", async (req: Request, res: Response) => {
  const parsed = SendCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "邮箱格式不正确" });
    return;
  }

  const { email } = parsed.data;

  const result = await sendEmailCode(email, {
    sourceIp: getAuthClientIp(req),
  });
  if (!result.success) {
    res
      .status(result.status)
      .json({ success: false, message: result.message });
    return;
  }

  res.json({
    success: true,
    message: result.message,
    data: { challengeToken: result.challengeToken },
  });
});

// POST /api/auth/login — 邮箱 + 验证码登录
router.post("/login", validateBody(LoginSchema), async (req: Request, res: Response) => {
  const { email, code, challengeToken } = req.body;
  if (
    typeof challengeToken !== "string"
    || !/^[a-f0-9]{48}$/i.test(challengeToken)
  ) {
    res.status(400).json({
      success: false,
      message: "验证码会话已失效，请重新获取验证码",
      code: "challenge_token_required",
    });
    return;
  }

  const verification = await verifyEmailCode(email, code, {
    challengeToken,
    sourceIp: getAuthClientIp(req),
  });
  if (verification === "unavailable") {
    res.status(503).json({
      success: false,
      message: "验证码服务暂不可用，请稍后重试",
      code: "verification_store_unavailable",
    });
    return;
  }
  if (verification === "rate_limited") {
    res.status(429).json({
      success: false,
      message: "验证码尝试过于频繁，请重新获取验证码",
      code: "verification_rate_limited",
    });
    return;
  }
  if (verification !== "valid") {
    res.status(401).json({ success: false, message: "验证码错误或已过期" });
    return;
  }

  const result = await loginByEmail(email);
  if (!result) {
    res.status(500).json({ success: false, message: "登录失败" });
    return;
  }

  res.json({
    success: true,
    data: {
      user: {
        id: result.user.id,
        email: result.user.email,
        nickname: result.user.nickname,
        balance: result.user.balance,
        creditBalance: result.user.credit_balance,
        demoAdminAccess: isDemoAdminSession(result.user),
        hasPassword: !!result.user.password_hash,
        createdAt: result.user.created_at,
      },
      token: result.token,
    },
    message: "登录成功",
  });
});

// POST /api/auth/login-password — 邮箱 + 密码登录
const PasswordLoginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

router.post("/login-password", validateBody(PasswordLoginSchema), async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const ip = getAuthClientIp(req);

  let admission: LoginAttemptAdmission;
  try {
    admission = await reserveLoginAttempt(email, ip);
  } catch {
    console.error("[AUTH] Redis unavailable; password login rejected");
    res.status(503).json({ success: false, message: "登录服务暂不可用，请稍后重试" });
    return;
  }

  if (!admission.allowed) {
    res.status(429).json({ success: false, message: "登录尝试过于频繁，请 15 分钟后再试" });
    return;
  }

  let result: Awaited<ReturnType<typeof loginByPassword>>;
  try {
    result = await loginByPassword(email, password);
  } finally {
    await releaseLoginAttempt(email, ip, admission.leaseId);
  }
  if (!result) {
    res.status(401).json({ success: false, message: "邮箱或密码错误" });
    return;
  }
  await recordLoginSuccess(email, ip);

  res.json({
    success: true,
    data: {
      user: {
        id: result.user.id,
        email: result.user.email,
        nickname: result.user.nickname,
        balance: result.user.balance,
        creditBalance: result.user.credit_balance,
        demoAdminAccess: isDemoAdminSession(result.user),
        hasPassword: !!result.user.password_hash,
        createdAt: result.user.created_at,
      },
      token: result.token,
    },
    message: "登录成功",
  });
});

// POST /api/auth/login-username — 用户名 + 密码登录（子账号，docs/specs/sub-accounts-spec.md §2.3）
const UsernameLoginSchema = z.object({
  username: z.string().min(3).max(32),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

router.post("/login-username", validateBody(UsernameLoginSchema), async (req: Request, res: Response) => {
  const { username, password } = req.body;
  const ip = getAuthClientIp(req);

  const identity = `u:${username}`;
  let admission: LoginAttemptAdmission;
  try {
    admission = await reserveLoginAttempt(identity, ip);
  } catch {
    console.error("[AUTH] Redis unavailable; username login rejected");
    res.status(503).json({ success: false, message: "登录服务暂不可用，请稍后重试" });
    return;
  }

  if (!admission.allowed) {
    res.status(429).json({ success: false, message: "登录尝试过于频繁，请 15 分钟后再试" });
    return;
  }

  let result: Awaited<ReturnType<typeof loginByUsername>>;
  try {
    result = await loginByUsername(username, password);
  } finally {
    await releaseLoginAttempt(identity, ip, admission.leaseId);
  }
  if (!result) {
    // 统一报错，不区分用户名不存在/密码错误/已停用（防枚举）
    res.status(401).json({ success: false, message: "用户名或密码错误" });
    return;
  }
  await recordLoginSuccess(identity, ip);

  res.json({
    success: true,
    data: {
      user: {
        id: result.user.id,
        email: result.user.email,
        username: result.user.username,
        nickname: result.user.nickname,
        balance: result.user.parent_user_id ? 0 : result.user.balance,
        creditBalance: result.user.parent_user_id ? 0 : result.user.credit_balance,
        accountType: result.user.parent_user_id ? "sub" : "main",
        demoAdminAccess: isDemoAdminSession(result.user),
        hasPassword: !!result.user.password_hash,
        createdAt: result.user.created_at,
      },
      token: result.token,
    },
    message: "登录成功",
  });
});

// POST /api/auth/set-password — 仅首次设置密码（需要登录）
const SetPasswordSchema = z.object({
  password: NewPasswordSchema,
});

router.post("/set-password", validateBody(SetPasswordSchema), async (req: Request, res: Response) => {
  const token = extractSessionToken(req);
  if (!token) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }

  const session = await validateSession(token);
  if (!session) {
    res.status(401).json({ success: false, message: "登录已过期，请重新登录" });
    return;
  }
  if (session.password_hash) {
    res.status(409).json({
      success: false,
      message: "密码已设置，请使用修改密码或验证码找回流程",
      code: "password_already_set",
    });
    return;
  }

  const { password } = req.body;
  const admission = await requireKdfAdmission(req, res, `session:${session.id}`);
  if (!admission) return;
  let result: Awaited<ReturnType<typeof setInitialPasswordAndRevokeSessions>>;
  try {
    result = await setInitialPasswordAndRevokeSessions(session.id, password);
  } finally {
    await releaseKdfAdmission(admission).catch(() => undefined);
  }
  if (result === "already_set") {
    res.status(409).json({
      success: false,
      message: "密码已设置，请使用修改密码或验证码找回流程",
      code: "password_already_set",
    });
    return;
  }
  if (result === "not_found") {
    res.status(401).json({ success: false, message: "用户不存在", code: "user_not_found" });
    return;
  }

  res.json({
    success: true,
    message: "密码设置成功，所有旧会话已退出，请重新登录",
    data: { reauthenticationRequired: true },
  });
});

// GET /api/auth/me — 获取当前用户信息
router.get("/me", async (req: Request, res: Response) => {
  const token = extractSessionToken(req);
  if (!token) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }

  const session = await validateSession(token);
  if (!session) {
    res.status(401).json({ success: false, message: "登录已过期，请重新登录" });
    return;
  }

  const user = await getUserById(session.id);
  if (!user) {
    res.status(401).json({ success: false, message: "用户不存在" });
    return;
  }

  const isSub = !!user.parent_user_id;
  res.json({
    success: true,
    data: {
      id: user.id,
      email: user.email,
      username: user.username,
      nickname: user.nickname,
      // 子账号无独立余额（钱在主账号，spec §4.3：不向子账号暴露主账号余额）
      balance: isSub ? 0 : user.balance,
      creditBalance: isSub ? 0 : user.credit_balance,
      accountType: isSub ? "sub" : "main",
      quota: isSub
        ? { limit: user.quota_limit, used: user.quota_used, period: user.quota_period }
        : null,
      allowedModels: isSub ? parseAllowedModels(user.allowed_models) : null,
      demoAdminAccess: isDemoAdminSession(user),
      hasPassword: !!user.password_hash,
      createdAt: user.created_at,
    },
  });
});

// POST /api/auth/logout — 登出
router.post("/logout", async (req: Request, res: Response) => {
  const token = extractSessionToken(req);
  if (token) {
    await logout(token);
  }
  res.json({ success: true, message: "已登出" });
});

// PUT /api/auth/profile — 更新个人信息（昵称）
const UpdateProfileSchema = z.object({
  nickname: z.string().min(1, "昵称不能为空").max(20, "昵称最多 20 个字符"),
});

router.put("/profile", validateBody(UpdateProfileSchema), async (req: Request, res: Response) => {
  const token = extractSessionToken(req);
  if (!token) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  const session = await validateSession(token);
  if (!session) {
    res.status(401).json({ success: false, message: "登录已过期" });
    return;
  }

  const { nickname } = req.body;
  const success = await updateNickname(session.id, nickname.trim());
  if (!success) {
    res.status(500).json({ success: false, message: "更新失败" });
    return;
  }

  res.json({ success: true, message: "更新成功" });
});

// POST /api/auth/change-password — 修改密码（需要旧密码验证）
const ChangePasswordSchema = z.object({
  oldPassword: z.string().min(1, "请输入当前密码"),
  newPassword: NewPasswordSchema,
});

router.post("/change-password", validateBody(ChangePasswordSchema), async (req: Request, res: Response) => {
  const token = extractSessionToken(req);
  if (!token) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  const session = await validateSession(token);
  if (!session) {
    res.status(401).json({ success: false, message: "登录已过期" });
    return;
  }

  const { oldPassword, newPassword } = req.body;
  const admission = await requireKdfAdmission(req, res, `session:${session.id}`);
  if (!admission) return;
  let result: Awaited<ReturnType<typeof changePasswordAndRevokeSessions>>;
  try {
    result = await changePasswordAndRevokeSessions(
      session.id,
      oldPassword,
      newPassword
    );
  } finally {
    await releaseKdfAdmission(admission).catch(() => undefined);
  }
  if (result === "invalid_old_password") {
    res.status(400).json({
      success: false,
      message: "当前密码错误",
      code: "invalid_current_password",
    });
    return;
  }
  if (result === "password_not_set") {
    res.status(409).json({
      success: false,
      message: "尚未设置密码，请先使用首次设置密码流程",
      code: "password_not_set",
    });
    return;
  }
  if (result === "not_found") {
    res.status(401).json({ success: false, message: "用户不存在", code: "user_not_found" });
    return;
  }

  res.json({
    success: true,
    message: "密码修改成功，所有旧会话已退出，请重新登录",
    data: { reauthenticationRequired: true },
  });
});

export default router;
