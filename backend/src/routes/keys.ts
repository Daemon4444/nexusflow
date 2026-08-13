import { Router, Request, Response } from "express";
import {
  getKeysByUser,
  createSelfServiceApiKey,
  deleteApiKeyByUser,
  maskApiKey,
  ApiKeyLimitError,
} from "../data/apikeys";
import { validateSession } from "../data/users";
import { reservePersistentWrite } from "../services/control-plane-write-admission";
import { getTrustedClientIp } from "../utils/client-ip";

const router = Router();

/** 从请求头提取 session token */
async function getSessionUserId(req: Request): Promise<string | null> {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  const session = await validateSession(token);
  return session?.id || null;
}

// 获取密钥：必须登录
router.get("/", async (req: Request, res: Response) => {
  const userId = await getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  const keys = await getKeysByUser(userId);
  const data = keys.map((k) => ({
    id: k.id,
    user_id: k.user_id,
    name: k.name,
    key: maskApiKey(k.key),
    keyPreview: maskApiKey(k.key),
    created_at: k.created_at,
    createdAt: k.created_at,
    last_used: k.last_used,
    lastUsed: k.last_used,
    usage_count: k.usage_count,
    usageCount: k.usage_count,
    rate_limit: k.rate_limit_override ?? null,
    rateLimit: k.rate_limit_override ?? null,
    rateLimitSource: k.rate_limit_override == null ? "account_plan" : "api_key_override",
  }));
  res.json({ success: true, data });
});

// 创建新密钥（需要登录）
router.post("/", async (req: Request, res: Response) => {
  const userId = await getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body)
    ? req.body as Record<string, unknown>
    : {};
  if (
    Object.prototype.hasOwnProperty.call(body, "rateLimit")
    || Object.prototype.hasOwnProperty.call(body, "rate_limit")
  ) {
    res.status(400).json({
      success: false,
      code: "rate_limit_managed_by_plan",
      message: "密钥速率限制由套餐或管理员配置",
    });
    return;
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    res.status(400).json({ success: false, message: "密钥名称不能为空" });
    return;
  }
  if (name.length > 50) {
    res.status(400).json({ success: false, message: "密钥名称不能超过 50 个字符" });
    return;
  }

  const admission = await reservePersistentWrite({
    kind: "api_key",
    userId,
    clientIp: getTrustedClientIp(req),
  });
  if (!admission.allowed) {
    res
      .status(admission.reason === "redis_unavailable" ? 503 : 429)
      .set("Retry-After", String(admission.retryAfterSeconds))
      .json({
        success: false,
        code: admission.reason,
        message: admission.reason === "redis_unavailable"
          ? "密钥服务暂时不可用"
          : "密钥操作过于频繁，请稍后再试",
      });
    return;
  }

  let newKey;
  try {
    newKey = await createSelfServiceApiKey(name, userId);
  } catch (error) {
    if (error instanceof ApiKeyLimitError) {
      res.status(error.code === "user_not_found" ? 404 : 409).json({
        success: false,
        code: error.code,
        message: error.code === "api_key_limit"
          ? "API 密钥数量已达上限"
          : "用户不存在",
      });
      return;
    }
    throw error;
  }

  res.json({
    success: true,
    data: {
      id: newKey.id,
      name: newKey.name,
      key: newKey.key,
      keyPreview: maskApiKey(newKey.key),
      createdAt: newKey.created_at,
      rateLimit: newKey.rate_limit_override ?? null,
      rateLimitSource: "account_plan",
    },
    message: "密钥创建成功",
  });
});

// 删除密钥（需要登录）
router.delete("/:id", async (req: Request, res: Response) => {
  const userId = await getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  const keyId = req.params.id as string;
  const admission = await reservePersistentWrite({
    kind: "api_key",
    userId,
    clientIp: getTrustedClientIp(req),
  });
  if (!admission.allowed) {
    res
      .status(admission.reason === "redis_unavailable" ? 503 : 429)
      .set("Retry-After", String(admission.retryAfterSeconds))
      .json({
        success: false,
        code: admission.reason,
        message: admission.reason === "redis_unavailable"
          ? "密钥服务暂时不可用"
          : "密钥操作过于频繁，请稍后再试",
      });
    return;
  }

  const success = await deleteApiKeyByUser(keyId, userId);

  if (!success) {
    res.status(404).json({ success: false, message: "密钥不存在" });
    return;
  }
  res.json({ success: true, message: "密钥已删除" });
});

export default router;
