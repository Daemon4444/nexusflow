import { Router, Request, Response } from "express";
import { requireAdmin } from "../middleware/admin";
import {
  deleteUserModelDiscount,
  listUserModelDiscounts,
  upsertUserModelDiscount,
} from "../data/user-discounts";

const router = Router();

router.use("/admin", requireAdmin);

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
  res.json({ success: ok, message: ok ? "折扣已删除" : "折扣不存在" });
});

export default router;
