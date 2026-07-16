import { Router, Request, Response } from "express";
import { validateSession, User } from "../data/users";
import {
  createSubAccount,
  listSubAccounts,
  updateSubAccount,
  resetSubAccountPassword,
  softDeleteSubAccount,
} from "../data/sub-accounts";

// docs/sub-accounts-spec.md §6 — 全部接口要求：已登录 + 发起者是主账号
const router = Router();

async function requireMainAccount(req: Request, res: Response): Promise<User | null> {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    res.status(401).json({ success: false, message: "未登录" });
    return null;
  }
  const session = await validateSession(auth.slice(7).trim());
  if (!session) {
    res.status(401).json({ success: false, message: "登录已过期，请重新登录" });
    return null;
  }
  if (session.parent_user_id) {
    res.status(403).json({ success: false, code: "sub_account_forbidden", message: "子账号无权管理子账号" });
    return null;
  }
  return session;
}

// POST /api/sub-accounts — 创建子账号
router.post("/", async (req: Request, res: Response) => {
  const owner = await requireMainAccount(req, res);
  if (!owner) return;

  const { username, password, nickname, quotaLimit, quotaPeriod } = req.body || {};
  if (!username || !password) {
    res.status(400).json({ success: false, message: "用户名和密码不能为空" });
    return;
  }

  const result = await createSubAccount({
    ownerId: owner.id,
    username: String(username),
    password: String(password),
    nickname: nickname ? String(nickname) : undefined,
    quotaLimit,
    quotaPeriod,
  });
  if ("error" in result) {
    res.status(result.status).json({ success: false, message: result.error });
    return;
  }

  res.json({
    success: true,
    data: {
      id: result.user.id,
      username: result.user.username,
      nickname: result.user.nickname,
      status: result.user.status,
      quotaLimit: result.user.quota_limit,
      quotaPeriod: result.user.quota_period,
      createdAt: result.user.created_at,
    },
    message: "子账号创建成功",
  });
});

// GET /api/sub-accounts — 子账号列表
router.get("/", async (req: Request, res: Response) => {
  const owner = await requireMainAccount(req, res);
  if (!owner) return;
  const rows = await listSubAccounts(owner.id);
  res.json({ success: true, data: rows });
});

// PATCH /api/sub-accounts/:id — 更新昵称/限额/状态
router.patch("/:id", async (req: Request, res: Response) => {
  const owner = await requireMainAccount(req, res);
  if (!owner) return;

  const { nickname, quotaLimit, quotaPeriod, status } = req.body || {};
  const result = await updateSubAccount(owner.id, req.params.id as string, {
    ...(nickname !== undefined ? { nickname } : {}),
    ...(quotaLimit !== undefined ? { quotaLimit } : {}),
    ...(quotaPeriod !== undefined ? { quotaPeriod } : {}),
    ...(status !== undefined ? { status } : {}),
  });
  if ("error" in result) {
    res.status(result.status).json({ success: false, message: result.error });
    return;
  }
  res.json({
    success: true,
    data: {
      id: result.user.id,
      username: result.user.username,
      nickname: result.user.nickname,
      status: result.user.status,
      quotaLimit: result.user.quota_limit,
      quotaUsed: result.user.quota_used,
      quotaPeriod: result.user.quota_period,
    },
    message: "更新成功",
  });
});

// POST /api/sub-accounts/:id/reset-password — 重置子账号密码
router.post("/:id/reset-password", async (req: Request, res: Response) => {
  const owner = await requireMainAccount(req, res);
  if (!owner) return;

  const { password } = req.body || {};
  const result = await resetSubAccountPassword(owner.id, req.params.id as string, String(password || ""));
  if ("error" in result) {
    res.status(result.status).json({ success: false, message: result.error });
    return;
  }
  res.json({ success: true, message: "密码已重置，该子账号已被登出" });
});

// DELETE /api/sub-accounts/:id — 软删除（须先停用）
router.delete("/:id", async (req: Request, res: Response) => {
  const owner = await requireMainAccount(req, res);
  if (!owner) return;

  const result = await softDeleteSubAccount(owner.id, req.params.id as string);
  if ("error" in result) {
    res.status(result.status).json({ success: false, message: result.error });
    return;
  }
  res.json({ success: true, message: "子账号已删除（历史用量与账单保留）" });
});

export default router;
