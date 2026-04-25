import { Router, Request, Response } from "express";
import { getKeysByUser, createApiKey, deleteApiKeyByUser } from "../data/apikeys";
import { validateSession } from "../data/users";

const router = Router();

/** 从请求头提取 session token */
function getSessionUserId(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  const session = validateSession(token);
  return session?.id || null;
}

// 获取密钥：必须登录
router.get("/", (req: Request, res: Response) => {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  const keys = getKeysByUser(userId);
  const data = keys.map((k) => ({
    id: k.id,
    user_id: k.user_id,
    name: k.name,
    key: k.key,
    created_at: k.created_at,
    createdAt: k.created_at,
    last_used: k.last_used,
    lastUsed: k.last_used,
    usage_count: k.usage_count,
    usageCount: k.usage_count,
    rate_limit: k.rate_limit,
    rateLimit: k.rate_limit,
  }));
  res.json({ success: true, data });
});

// 创建新密钥（需要登录）
router.post("/", (req: Request, res: Response) => {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  const { name, rateLimit = 60 } = req.body;
  if (!name) {
    res.status(400).json({ success: false, message: "密钥名称不能为空" });
    return;
  }

  const newKey = createApiKey(name, rateLimit, userId);

  res.json({
    success: true,
    data: {
      id: newKey.id,
      name: newKey.name,
      key: newKey.key,
      createdAt: newKey.created_at,
      rateLimit: newKey.rate_limit,
    },
    message: "密钥创建成功",
  });
});

// 删除密钥（需要登录）
router.delete("/:id", (req: Request, res: Response) => {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  const keyId = req.params.id as string;

  const success = deleteApiKeyByUser(keyId, userId);

  if (!success) {
    res.status(404).json({ success: false, message: "密钥不存在" });
    return;
  }
  res.json({ success: true, message: "密钥已删除" });
});

export default router;
