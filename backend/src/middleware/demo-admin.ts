import { NextFunction, Request, Response } from "express";
import { getSessionUser } from "./admin";
import { isDemoAdminPrincipal } from "../data/admin-access";

export function isDemoAdminSession(session: { email: string | null }): boolean {
  return isDemoAdminPrincipal(session);
}

export async function requireDemoAdmin(req: Request, res: Response, next: NextFunction) {
  const session = await getSessionUser(req, res);
  if (!session) return;

  if (!isDemoAdminSession(session)) {
    res.status(403).json({
      success: false,
      message: "当前账号未开通演示后台",
      code: "demo_admin_forbidden",
    });
    return;
  }

  (req as Request & { demoAdmin?: typeof session }).demoAdmin = session;
  next();
}
