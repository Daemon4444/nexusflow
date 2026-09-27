import { Router, Request, Response } from "express";
import { requirePermission } from "../middleware/admin-access";
import { auditAdminWrite } from "../middleware/admin-audit";
import {
  deleteUserModelDiscount,
  listUserModelDiscounts,
  upsertUserModelDiscount,
} from "../data/user-discounts";
import { getUserById } from "../data/users";
import { models } from "../data/models";

const router = Router();

router.use("/admin", auditAdminWrite, requirePermission("billing.read"));
router.use("/admin", (req: Request, res: Response, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase())) {
    next();
    return;
  }
  requirePermission("billing.manage")(req, res, next);
});

router.get("/admin/user-model-discounts", async (req: Request, res: Response) => {
  const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
  const rows = await listUserModelDiscounts(userId);
  res.json({ success: true, data: rows });
});

router.post("/admin/user-model-discounts", async (req: Request, res: Response) => {
  const { userId, user_id, modelId, model_id, discountRate, discount_rate, enabled, is_enabled, notes } = req.body || {};
  const normalizedUserId = String(userId || user_id || "").trim();
  const normalizedModelId = String(modelId || model_id || "").trim();
  const rate = Number(discountRate ?? discount_rate);

  if (!normalizedUserId || !normalizedModelId) {
    res.status(400).json({ success: false, message: "缺少 userId 或 modelId" });
    return;
  }
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    res.status(400).json({ success: false, message: "discountRate 必须在 0 到 1 之间" });
    return;
  }
  // "*" (all models) and prefix patterns such as "qwen*" are resolved at
  // billing time; anything else must be a model in the current catalog.
  if (!normalizedModelId.endsWith("*") && !models.some((item) => item.id === normalizedModelId)) {
    res.status(400).json({ success: false, message: `模型 ${normalizedModelId} 不在当前目录中；全部模型用 *，前缀匹配用如 qwen*`, code: "unknown_model" });
    return;
  }
  const user = await getUserById(normalizedUserId);
  if (!user) {
    res.status(404).json({ success: false, message: "用户不存在", code: "customer_not_found" });
    return;
  }
  if ((user as { parent_user_id?: string | null }).parent_user_id) {
    res.status(400).json({ success: false, message: "子账号没有独立计费，折扣请设置在主账号上", code: "subaccount_discount_forbidden" });
    return;
  }

  const row = await upsertUserModelDiscount({
    userId: normalizedUserId,
    modelId: normalizedModelId,
    discountRate: rate,
    enabled: is_enabled ?? enabled ?? true,
    notes: String(notes || ""),
    createdBy: (req as any).admin?.id || null,
  });
  res.json({ success: true, data: row, message: "用户模型折扣已保存" });
});

router.delete("/admin/user-model-discounts/:id", async (req: Request, res: Response) => {
  const ok = await deleteUserModelDiscount(String(req.params.id));
  if (!ok) {
    res.status(404).json({ success: false, message: "折扣不存在", code: "discount_not_found" });
    return;
  }
  res.json({ success: true, message: "折扣已删除" });
});

export default router;
