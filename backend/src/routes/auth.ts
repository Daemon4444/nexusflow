import { Router, Request, Response } from "express";
import { loginByEmail, loginByPassword, setUserPassword, hasPassword, validateSession, logout, getUserById, updateNickname, verifyPassword } from "../data/users";
import { sendEmailCode, verifyEmailCode } from "../services/email";
import { validateBody, SendCodeSchema, LoginSchema } from "../middleware/validation";
import { z } from "zod";

const router = Router();

/** 从请求头提取 session token */
function extractSessionToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

// POST /api/auth/send-code — 发送邮箱验证码
router.post("/send-code", validateBody(SendCodeSchema), async (req: Request, res: Response) => {
  const { email } = req.body;

  const result = await sendEmailCode(email);
  if (!result.success) {
    res.status(400).json({ success: false, message: result.message });
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

  const result = loginByEmail(email);
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

router.post("/login-password", validateBody(PasswordLoginSchema), (req: Request, res: Response) => {
  const { email, password } = req.body;

  const result = loginByPassword(email, password);
  if (!result) {
    res.status(401).json({ success: false, message: "邮箱或密码错误" });
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

router.post("/set-password", validateBody(SetPasswordSchema), (req: Request, res: Response) => {
  const token = extractSessionToken(req);
  if (!token) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }

  const session = validateSession(token);
  if (!session) {
    res.status(401).json({ success: false, message: "登录已过期，请重新登录" });
    return;
  }

  const { password } = req.body;
  const success = setUserPassword(session.id, password);
  if (!success) {
    res.status(500).json({ success: false, message: "设置密码失败" });
    return;
  }

  res.json({ success: true, message: "密码设置成功" });
});

// GET /api/auth/me — 获取当前用户信息
router.get("/me", (req: Request, res: Response) => {
  const token = extractSessionToken(req);
  if (!token) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }

  const session = validateSession(token);
  if (!session) {
    res.status(401).json({ success: false, message: "登录已过期，请重新登录" });
    return;
  }

  const user = getUserById(session.id);
  if (!user) {
    res.status(401).json({ success: false, message: "用户不存在" });
    return;
  }

  res.json({
    success: true,
    data: {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      balance: user.balance,
      hasPassword: !!user.password_hash,
      createdAt: user.created_at,
    },
  });
});

// POST /api/auth/logout — 登出
router.post("/logout", (req: Request, res: Response) => {
  const token = extractSessionToken(req);
  if (token) {
    logout(token);
  }
  res.json({ success: true, message: "已登出" });
});

// PUT /api/auth/profile — 更新个人信息（昵称）
const UpdateProfileSchema = z.object({
  nickname: z.string().min(1, "昵称不能为空").max(20, "昵称最多 20 个字符"),
});

router.put("/profile", validateBody(UpdateProfileSchema), (req: Request, res: Response) => {
  const token = extractSessionToken(req);
  if (!token) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  const session = validateSession(token);
  if (!session) {
    res.status(401).json({ success: false, message: "登录已过期" });
    return;
  }

  const { nickname } = req.body;
  const success = updateNickname(session.id, nickname.trim());
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

router.post("/change-password", validateBody(ChangePasswordSchema), (req: Request, res: Response) => {
  const token = extractSessionToken(req);
  if (!token) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  const session = validateSession(token);
  if (!session) {
    res.status(401).json({ success: false, message: "登录已过期" });
    return;
  }

  const user = getUserById(session.id);
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

  const success = setUserPassword(session.id, newPassword);
  if (!success) {
    res.status(500).json({ success: false, message: "修改失败" });
    return;
  }

  res.json({ success: true, message: "密码修改成功" });
});

export default router;
