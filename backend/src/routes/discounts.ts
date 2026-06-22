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
    res.status(400).json({ success: false, message: "Missing userId or modelId" });
    return;
  }
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    res.status(400).json({ success: false, message: "discountRate must be between 0 and 1" });
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
  res.json({ success: true, data: row, message: "User model discount saved" });
});

router.delete("/admin/user-model-discounts/:id", async (req: Request, res: Response) => {
  const ok = await deleteUserModelDiscount(String(req.params.id));
  res.json({ success: ok, message: ok ? "Discount deleted" : "Discount not found" });
});

export default router;
