import { NextFunction, Request, Response } from "express";
import {
  AdminAccess,
  AdminPermission,
  getAdminAccessForUser,
} from "../data/admin-access";
import { getSessionUser } from "./admin";

export type AdminAuthorizedRequest = Request & {
  admin?: Awaited<ReturnType<typeof getSessionUser>> extends infer T ? NonNullable<T> : never;
  adminAccess?: AdminAccess;
};

export async function authorizeAdminRequest(
  req: Request,
  res: Response
): Promise<{ user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>; access: AdminAccess } | null> {
  const existingUser = (req as AdminAuthorizedRequest).admin;
  const existingAccess = (req as AdminAuthorizedRequest).adminAccess;
  if (existingUser && existingAccess) return { user: existingUser, access: existingAccess };

  const user = await getSessionUser(req, res);
  if (!user) return null;
  const access = await getAdminAccessForUser(user);
  if (!access) {
    res.status(403).json({ success: false, message: "需要管理员权限", code: "admin_forbidden" });
    return null;
  }
  (req as AdminAuthorizedRequest).admin = user;
  (req as AdminAuthorizedRequest).adminAccess = access;
  return { user, access };
}

export function requirePermission(permission: AdminPermission) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authorized = await authorizeAdminRequest(req, res);
    if (!authorized) return;
    if (!authorized.access.permissions.includes(permission)) {
      res.status(403).json({
        success: false,
        message: "当前管理员角色无此权限",
        code: "admin_permission_denied",
        requiredPermission: permission,
      });
      return;
    }
    next();
  };
}
