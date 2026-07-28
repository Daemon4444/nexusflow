import { Request, Response, NextFunction } from "express";
import { validateSession } from "../data/users";
import { getAdminAccessForUser, isBootstrapAdmin } from "../data/admin-access";

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
  // Synchronous compatibility helper used by legacy UI feature flags. Database
  // role assignments are resolved by requireAdmin/requirePermission.
  return isBootstrapAdmin(session);
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const session = await getSessionUser(req, res);
  if (!session) return;

  const access = await getAdminAccessForUser(session);
  if (access) {
    (req as any).admin = session;
    (req as any).adminAccess = access;
  }
  // Legacy /api/admin surfaces contain broad write capabilities. Only the
  // explicit admin role (or bootstrap super-admin) may enter them. Lower roles
  // use /api/admin/control-plane endpoints guarded per permission.
  if (!access || !access.permissions.includes("legacy.admin")) {
    res.status(403).json({ success: false, message: "需要管理员权限" });
    return;
  }

  next();
}
