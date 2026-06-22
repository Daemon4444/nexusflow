import { Router, Request, Response } from "express";
import { loginByEmail, loginByPassword, setUserPassword, hasPassword, validateSession, logout, getUserById, updateNickname, verifyPassword } from "../data/users";
import { sendEmailCode, verifyEmailCode } from "../services/email";
import { validateBody, SendCodeSchema, LoginSchema } from "../middleware/validation";
import { z } from "zod";
import { OAuth2Client } from "google-auth-library";

const router = Router();

/** Google OAuth client (used only to verify ID tokens; lazily reused). */
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

/** Extract session token from request header */
function extractSessionToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

// POST /api/auth/send-code — Send email verification code
router.post("/send-code", validateBody(SendCodeSchema), async (req: Request, res: Response) => {
  const { email } = req.body;

  const result = await sendEmailCode(email);
  if (!result.success) {
    res.status(400).json({ success: false, message: result.message });
    return;
  }

  res.json({ success: true, message: result.message });
});

// POST /api/auth/login — Email + verification code login
router.post("/login", validateBody(LoginSchema), async (req: Request, res: Response) => {
  const { email, code } = req.body;

  // Verification code validation (async)
  const valid = await verifyEmailCode(email, code);
  if (!valid) {
    res.status(401).json({ success: false, message: "Verification code incorrect or expired" });
    return;
  }

  const result = await loginByEmail(email);
  if (!result) {
    res.status(500).json({ success: false, message: "Login failed" });
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
    message: "Login successful",
  });
});

// POST /api/auth/login-password — Email + password login
const PasswordLoginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

router.post("/login-password", validateBody(PasswordLoginSchema), async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const result = await loginByPassword(email, password);
  if (!result) {
    res.status(401).json({ success: false, message: "Email or password incorrect" });
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
    message: "Login successful",
  });
});

// POST /api/auth/google — Sign in with Google (verify ID token, find-or-create user by email)
const GoogleLoginSchema = z.object({
  credential: z.string().min(1, "Missing Google credential"),
});

router.post("/google", validateBody(GoogleLoginSchema), async (req: Request, res: Response) => {
  if (!googleClient) {
    res.status(503).json({ success: false, message: "Google sign-in is not configured" });
    return;
  }

  const { credential } = req.body;

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch {
    res.status(401).json({ success: false, message: "Invalid Google credential" });
    return;
  }

  if (!payload?.email) {
    res.status(401).json({ success: false, message: "Google account has no email" });
    return;
  }
  if (payload.email_verified === false) {
    res.status(401).json({ success: false, message: "Google account email is not verified" });
    return;
  }

  // Same email = same account (auto-links to an existing email/password account).
  const result = await loginByEmail(payload.email);
  if (!result) {
    res.status(500).json({ success: false, message: "Login failed" });
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
    message: "Login successful",
  });
});

// POST /api/auth/set-password — Set/change password (requires login)
const SetPasswordSchema = z.object({
  password: z.string().min(6, "Password must be at least 6 characters").max(128),
});

router.post("/set-password", validateBody(SetPasswordSchema), async (req: Request, res: Response) => {
  const token = extractSessionToken(req);
  if (!token) {
    res.status(401).json({ success: false, message: "Not logged in" });
    return;
  }

  const session = await validateSession(token);
  if (!session) {
    res.status(401).json({ success: false, message: "Session expired, please log in again" });
    return;
  }

  const { password } = req.body;
  const success = await setUserPassword(session.id, password);
  if (!success) {
    res.status(500).json({ success: false, message: "Failed to set password" });
    return;
  }

  res.json({ success: true, message: "Password set successfully" });
});

// GET /api/auth/me — Get current user info
router.get("/me", async (req: Request, res: Response) => {
  const token = extractSessionToken(req);
  if (!token) {
    res.status(401).json({ success: false, message: "Not logged in" });
    return;
  }

  const session = await validateSession(token);
  if (!session) {
    res.status(401).json({ success: false, message: "Session expired, please log in again" });
    return;
  }

  const user = await getUserById(session.id);
  if (!user) {
    res.status(401).json({ success: false, message: "User not found" });
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

// POST /api/auth/logout — Logout
router.post("/logout", async (req: Request, res: Response) => {
  const token = extractSessionToken(req);
  if (token) {
    await logout(token);
  }
  res.json({ success: true, message: "Logged out" });
});

// PUT /api/auth/profile — Update profile (nickname)
const UpdateProfileSchema = z.object({
  nickname: z.string().min(1, "Nickname cannot be empty").max(20, "Nickname must be at most 20 characters"),
});

router.put("/profile", validateBody(UpdateProfileSchema), async (req: Request, res: Response) => {
  const token = extractSessionToken(req);
  if (!token) {
    res.status(401).json({ success: false, message: "Not logged in" });
    return;
  }
  const session = await validateSession(token);
  if (!session) {
    res.status(401).json({ success: false, message: "Session expired" });
    return;
  }

  const { nickname } = req.body;
  const success = await updateNickname(session.id, nickname.trim());
  if (!success) {
    res.status(500).json({ success: false, message: "Update failed" });
    return;
  }

  res.json({ success: true, message: "Update successful" });
});

// POST /api/auth/change-password — Change password (requires old password verification)
const ChangePasswordSchema = z.object({
  oldPassword: z.string().min(1, "Please enter current password"),
  newPassword: z.string().min(6, "New password must be at least 6 characters").max(128),
});

router.post("/change-password", validateBody(ChangePasswordSchema), async (req: Request, res: Response) => {
  const token = extractSessionToken(req);
  if (!token) {
    res.status(401).json({ success: false, message: "Not logged in" });
    return;
  }
  const session = await validateSession(token);
  if (!session) {
    res.status(401).json({ success: false, message: "Session expired" });
    return;
  }

  const user = await getUserById(session.id);
  if (!user) {
    res.status(401).json({ success: false, message: "User not found" });
    return;
  }

  const { oldPassword, newPassword } = req.body;

  // If password already set, verify old password
  if (user.password_hash) {
    if (!verifyPassword(oldPassword, user.password_hash)) {
      res.status(400).json({ success: false, message: "Current password incorrect" });
      return;
    }
  }

  const success = await setUserPassword(session.id, newPassword);
  if (!success) {
    res.status(500).json({ success: false, message: "Change failed" });
    return;
  }

  res.json({ success: true, message: "Password changed successfully" });
});

export default router;
