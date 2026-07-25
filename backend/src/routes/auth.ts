import { Router, Request, Response } from "express";
import { loginByEmail, loginByPassword, loginByUsername, setUserPassword, hasPassword, validateSession, logout, getUserById, updateNickname, verifyPassword } from "../data/users";
import { sendEmailCode, verifyEmailCode } from "../services/email";
import { validateBody, SendCodeSchema, LoginSchema } from "../middleware/validation";
import { getRedis } from "../services/redis";
import { z } from "zod";
import { parseAllowedModels } from "../data/model-access";

const router = Router();

// ── 登录爆破防护（Redis 原子尝试计数 + 锁定；故障时生产环境 fail-closed）──
const LOGIN_MAX_FAILURES = 5;
const LOGIN_WINDOW_SEC = 15 * 60; // 15 分钟窗口，达到阈值即锁定该窗口剩余时间

function getClientIp(req: Request): string {
  // nginx overwrites X-Real-IP from the connection source. The left-most
  // X-Forwarded-For value is client-controlled unless every proxy hop is
  // explicitly trusted, so do not use it for brute-force keys.
  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.length > 0) return realIp.trim();
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function loginFailKey(identity: string, ip: string): string {
  return `login:fail:${identity.toLowerCase()}:${ip}`;
}

async function isLoginLocked(identity: string, ip: string): Promise<boolean> {
  if (!process.env.REDIS_HOST) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Redis is required for password login rate limiting");
    }
    return false;
  }

  const result = (await getRedis().eval(
    `
      local attempts = redis.call("INCR", KEYS[1])
      if attempts == 1 then
        redis.call("EXPIRE", KEYS[1], tonumber(ARGV[1]))
      end
      return attempts
    `,
    1,
    loginFailKey(identity, ip),
    LOGIN_WINDOW_SEC
  )) as number;
  return Number(result) > LOGIN_MAX_FAILURES;
}

async function clearLoginFailures(identity: string, ip: string): Promise<void> {
  if (!process.env.REDIS_HOST) return;
  try {
    await getRedis().del(loginFailKey(identity, ip));
  } catch { /* 清理失败无副作用 */ }
}

/** 从请求头提取 session token */
function extractSessionToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

// POST /api/auth/send-code — 发送邮箱验证码
router.post("/send-code", async (req: Request, res: Response) => {
  const parsed = SendCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "邮箱格式不正确" });
    return;
  }

  const { email } = parsed.data;

  const result = await sendEmailCode(email);
  if (!result.success) {
    res
      .status(result.status)
      .json({ success: false, message: result.message });
    return;
  }

  res.json({ success: true, message: result.message });
});

// POST /api/auth/login — 邮箱 + 验证码登录
router.post("/login", validateBody(LoginSchema), async (req: Request, res: Response) => {
  const { email, code } = req.body;

  // 验证码校验（异步）
  const valid = await verifyEmailCode(email, code);
  if (!valid) {
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
  const ip = getClientIp(req);

  let locked: boolean;
  try {
    locked = await isLoginLocked(email, ip);
  } catch {
    console.error("[AUTH] Redis unavailable; password login rejected");
    res.status(503).json({ success: false, message: "登录服务暂不可用，请稍后重试" });
    return;
  }

  if (locked) {
    res.status(429).json({ success: false, message: "登录尝试过于频繁，请 15 分钟后再试" });
    return;
  }

  const result = await loginByPassword(email, password);
  if (!result) {
    res.status(401).json({ success: false, message: "邮箱或密码错误" });
    return;
  }
  await clearLoginFailures(email, ip);

  res.json({
    success: true,
    data: {
      user: {
        id: result.user.id,
        email: result.user.email,
        nickname: result.user.nickname,
        balance: result.user.balance,
        creditBalance: result.user.credit_balance,
        hasPassword: !!result.user.password_hash,
        createdAt: result.user.created_at,
      },
      token: result.token,
    },
    message: "登录成功",
  });
});

// POST /api/auth/login-username — 用户名 + 密码登录（子账号，docs/sub-accounts-spec.md §2.3）
const UsernameLoginSchema = z.object({
  username: z.string().min(3).max(32),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

router.post("/login-username", validateBody(UsernameLoginSchema), async (req: Request, res: Response) => {
  const { username, password } = req.body;
  const ip = getClientIp(req);

  let locked: boolean;
  try {
    locked = await isLoginLocked(`u:${username}`, ip);
  } catch {
    console.error("[AUTH] Redis unavailable; username login rejected");
    res.status(503).json({ success: false, message: "登录服务暂不可用，请稍后重试" });
    return;
  }

  if (locked) {
    res.status(429).json({ success: false, message: "登录尝试过于频繁，请 15 分钟后再试" });
    return;
  }

  const result = await loginByUsername(username, password);
  if (!result) {
    // 统一报错，不区分用户名不存在/密码错误/已停用（防枚举）
    res.status(401).json({ success: false, message: "用户名或密码错误" });
    return;
  }
  await clearLoginFailures(`u:${username}`, ip);

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
        hasPassword: !!result.user.password_hash,
        createdAt: result.user.created_at,
      },
      token: result.token,
    },
    message: "登录成功",
  });
});

// POST /api/auth/set-password — 设置/修改密码（需要登录）
const SetPasswordSchema = z.object({
  password: z.string().min(6, "Password must be at least 6 characters").max(128),
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

  const { password } = req.body;
  const success = await setUserPassword(session.id, password);
  if (!success) {
    res.status(500).json({ success: false, message: "设置密码失败" });
    return;
  }

  res.json({ success: true, message: "密码设置成功" });
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
  newPassword: z.string().min(6, "新密码至少 6 个字符").max(128),
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

  const user = await getUserById(session.id);
  if (!user) {
    res.status(401).json({ success: false, message: "用户不存在" });
    return;
  }

  const { oldPassword, newPassword } = req.body;

  // 如果已有密码，验证旧密码
  if (user.password_hash) {
    if (!verifyPassword(oldPassword, user.password_hash)) {
      res.status(400).json({ success: false, message: "当前密码错误" });
      return;
    }
  }

  const success = await setUserPassword(session.id, newPassword);
  if (!success) {
    res.status(500).json({ success: false, message: "修改失败" });
    return;
  }

  res.json({ success: true, message: "密码修改成功" });
});

export default router;
