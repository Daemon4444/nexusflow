import { Request, Response, NextFunction } from "express";
import { validateSession } from "../data/users";

function parseEnvList(value?: string): string[] {
  return (value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export async function getSessionUser(req: Request, res: Response) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, message: "未登录" });
    return null;
  }

  const session = await validateSession(auth.slice(7).trim());
  if (!session) {
    res.status(401).json({ success: false, message: "登录已过期" });
    return null;
  }

  return session;
}

export function isAdminSession(session: { id: string; email: string | null }) {
  const adminIds = parseEnvList(process.env.ADMIN_USER_IDS);
  const adminEmails = parseEnvList(process.env.ADMIN_EMAILS);
  const email = (session.email || "").toLowerCase();

  return adminIds.includes(session.id.toLowerCase()) || (!!email && adminEmails.includes(email));
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const session = await getSessionUser(req, res);
  if (!session) return;

  if (!isAdminSession(session)) {
    res.status(403).json({ success: false, message: "需要管理员权限" });
    return;
  }

  (req as any).admin = session;
  next();
}
