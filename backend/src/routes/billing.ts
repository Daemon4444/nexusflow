import { Router, Request, Response } from "express";
import { sanitizeError } from "../utils/sanitize-error";
import { validateSession } from "../data/users";
import { recharge, getTransactions, getBillingSummary, getMonthlyStats, getBillingUsageExport } from "../data/billing";
import { listUserModelDiscounts, UserModelDiscount } from "../data/user-discounts";
import {
  createPagePayment,
  createQrPayment,
  verifyAlipayNotify,
  queryTradeStatus,
  getAlipayConfigStatus,
  isMockPaymentAllowed,
} from "../services/alipay";
import {
  createPaymentOrder,
  getPaymentOrder,
  getPaymentOrderForUser,
  markOrderPaid,
  markOrderPending,
  setOrderStatus,
} from "../data/paymentOrders";

const router = Router();

/** Extract session token from request header and verify user */
async function requireAuth(req: Request, res: Response): Promise<string | null> {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    res.status(401).json({ success: false, message: "Not logged in" });
    return null;
  }
  const token = auth.slice(7).trim();
  const session = await validateSession(token);
  if (!session) {
    res.status(401).json({ success: false, message: "Session expired, please log in again" });
    return null;
  }
  return session.id;
}

function asAmount(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return NaN;
  return Math.round(parsed * 100) / 100;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  const formulaSafe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${formulaSafe.replace(/"/g, '""')}"`;
}

function toCsv(rows: Record<string, unknown>[]): string {
  const headers = [
    "invoice_period_start",
    "invoice_period_end",
    "usage_id",
    "occurred_at",
    "api_key_id",
    "api_key_name",
    "model_id",
    "model_name",
    "provider",
    "pricing_type",
    "status",
    "prompt_tokens",
    "completion_tokens",
    "total_tokens",
    "cached_tokens",
    "cache_creation_tokens",
    "tier_label",
    "tier_max_tokens",
    "prompt_unit_price_cny_per_1m_tokens",
    "completion_unit_price_cny_per_1m_tokens",
    "prompt_amount_cny",
    "completion_amount_cny",
    "list_amount_cny",
    "discount_rate",
    "discount_amount_cny",
    "billed_amount_cny",
    "recalculated_amount_cny",
    "rounding_delta_cny",
    "pricing_note",
  ];
  return [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
}

// GET /api/billing/summary — Billing overview
router.get("/summary", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const summary = await getBillingSummary(userId);
  res.json({ success: true, data: summary });
});

// GET /api/billing/transactions — Transaction history list
router.get("/transactions", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const offset = Number(req.query.offset) || 0;

  const { rows, total } = await getTransactions(userId, limit, offset);
  const discounts = await listUserModelDiscounts(userId);

  function findDiscount(desc: string): UserModelDiscount | null {
    const m = desc.match(/[:：]\s*([a-zA-Z0-9\-_.]+)/);
    if (!m) return null;
    const modelId = m[1];
    const exact = discounts.find((d) => d.model_id === modelId && d.is_enabled);
    if (exact) return exact;
    const prefixMatches = discounts
      .filter((d) => d.is_enabled && d.model_id.endsWith("*") && d.model_id !== "*" && modelId.startsWith(d.model_id.slice(0, -1)))
      .sort((a, b) => b.model_id.length - a.model_id.length);
    if (prefixMatches.length > 0) return prefixMatches[0];
    const global = discounts.find((d) => d.model_id === "*" && d.is_enabled);
    return global || null;
  }

  const enriched = rows.map((r) => {
    let discountRate: number | undefined;
    let discountAmountCny: number | undefined;
    if (r.type === "consumption" && r.discount_rate === null) {
      const d = findDiscount(r.description || "");
      if (d && d.discount_rate < 1) {
        discountRate = d.discount_rate;
        discountAmountCny = Math.round(((Number(r.amount) / discountRate) - Number(r.amount)) * 1_000_000) / 1_000_000;
      }
    }
    return {
      id: r.id,
      type: r.type,
      amount: r.amount,
      balanceAfter: r.balance_after,
      description: r.description,
      refId: r.ref_id,
      createdAt: r.created_at,
      discountRate: r.discount_rate !== null && r.discount_rate !== undefined ? Number(r.discount_rate) : discountRate,
      discountAmountCny: r.discount_amount_cny !== null && r.discount_amount_cny !== undefined ? Number(r.discount_amount_cny) : discountAmountCny,
    };
  });

  res.json({
    success: true,
    data: {
      rows: enriched,
      total,
      limit,
      offset,
    },
  });
});

// GET /api/billing/monthly — Monthly statistics
router.get("/monthly", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const stats = await getMonthlyStats(userId);
  res.json({ success: true, data: stats });
});

// GET /api/billing/export.csv — Billing usage detail CSV
router.get("/export.csv", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  try {
    const exportData = await getBillingUsageExport(userId, {
      startDate: typeof req.query.startDate === "string" ? req.query.startDate : undefined,
      endDate: typeof req.query.endDate === "string" ? req.query.endDate : undefined,
    });

    const rows = exportData.rows.map((row) => ({
      invoice_period_start: exportData.startDate,
      invoice_period_end: exportData.endDate,
      usage_id: row.usage_id,
      occurred_at: row.created_at,
      api_key_id: row.api_key_id,
      api_key_name: row.api_key_name,
      model_id: row.model,
      model_name: row.model_name,
      provider: row.provider,
      pricing_type: row.pricing_type,
      status: row.status,
      prompt_tokens: row.prompt_tokens,
      completion_tokens: row.completion_tokens,
      total_tokens: row.total_tokens,
      cached_tokens: row.cached_tokens,
      cache_creation_tokens: row.cache_creation_tokens,
      tier_label: row.tier_label,
      tier_max_tokens: row.tier_max_tokens,
      prompt_unit_price_cny_per_1m_tokens: row.prompt_unit_price_cny_per_1m,
      completion_unit_price_cny_per_1m_tokens: row.completion_unit_price_cny_per_1m,
      prompt_amount_cny: row.prompt_amount_cny,
      completion_amount_cny: row.completion_amount_cny,
      list_amount_cny: row.list_amount_cny,
      discount_rate: row.discount_rate,
      discount_amount_cny: row.discount_amount_cny,
      billed_amount_cny: row.billed_amount_cny,
      recalculated_amount_cny: row.recalculated_amount_cny,
      rounding_delta_cny: row.rounding_delta_cny,
      pricing_note: row.pricing_note,
    }));

    const csv = "\uFEFF" + toCsv(rows);
    const filename = `nexusflow-billing-${exportData.startDate.slice(0, 10)}-to-${exportData.endDate.slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ success: false, message: sanitizeError(error) });
  }
});

// GET /api/billing/payment/config — Payment configuration status (for frontend display)
router.get("/payment/config", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  const status = getAlipayConfigStatus();
  res.json({ success: true, data: status });
});

// POST /api/billing/recharge — Recharge (Alipay website payment)
router.post("/recharge", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { amount, method } = req.body;
  const normalizedAmount = asAmount(amount);
  if (!normalizedAmount || normalizedAmount <= 0) {
    res.status(400).json({ success: false, message: "Recharge amount must be greater than 0" });
    return;
  }
  if (normalizedAmount > 10000) {
    res.status(400).json({ success: false, message: "Single recharge amount cannot exceed 10000" });
    return;
  }

  // method: "page"(website payment) | "qr"(QR code payment) | "mock"(mock recharge)
  const payMethod = method || "page";

  if (payMethod === "mock") {
    if (!isMockPaymentAllowed()) {
      res.status(403).json({ success: false, message: "Mock recharge not allowed in current environment" });
      return;
    }
    // Mock recharge (for testing)
    const tx = await recharge(userId, normalizedAmount);
    if (!tx) {
      res.status(500).json({ success: false, message: "Recharge failed" });
      return;
    }
    res.json({
      success: true,
      data: {
        transactionId: tx.id,
        amount: tx.amount,
        balanceAfter: tx.balance_after,
        paymentType: "mock",
      },
      message: `Recharge successful, current balance ¥${tx.balance_after.toFixed(2)}`,
    });
    return;
  }

  // Alipay payment
  const createFn = payMethod === "qr" ? createQrPayment : createPagePayment;
  const result = await createFn(userId, normalizedAmount);

  if (!result.success) {
    res.status(503).json({
      success: false,
      message: result.message,
      code: "payment_not_configured",
      data: getAlipayConfigStatus(),
    });
    return;
  }

  // Mock mode (when Alipay is not configured) - direct credit
  if (result.data?.mockPaid) {
    const tx = await recharge(userId, normalizedAmount, `Recharge ¥${normalizedAmount.toFixed(2)} (mock payment)`);
    if (!tx) {
      res.status(500).json({ success: false, message: "Recharge failed" });
      return;
    }
    res.json({
      success: true,
      data: {
        transactionId: tx.id,
        amount: tx.amount,
        balanceAfter: tx.balance_after,
        paymentType: "mock",
      },
      message: `Recharge successful, current balance ¥${tx.balance_after.toFixed(2)}`,
    });
    return;
  }

  // Record persistent order
  await createPaymentOrder({
    orderNo: result.data!.orderNo,
    userId,
    amount: normalizedAmount,
    method: payMethod === "qr" ? "qr" : "page",
    channel: "alipay",
  });
  await markOrderPending(result.data!.orderNo);

  res.json({
    success: true,
    data: {
      orderNo: result.data!.orderNo,
      orderId: result.data!.orderNo,
      paymentForm: result.data?.paymentForm,
      payUrl: result.data?.paymentForm,
      qrCode: result.data?.qrCode,
      paymentType: payMethod,
    },
    message: result.message,
  });
});

// POST /api/billing/alipay/notify — Alipay async notification callback
router.post("/alipay/notify", async (req: Request, res: Response) => {
  const params = req.body as Record<string, string>;
  const outTradeNo = params.out_trade_no;
  const tradeStatus = params.trade_status;
  const totalAmount = asAmount(params.total_amount);

  console.log(`[ALIPAY-NOTIFY] Received callback: order=${outTradeNo}, status=${tradeStatus}, amount=${params.total_amount}, keys=${Object.keys(params).join(",")}`);

  if (!outTradeNo) {
    res.status(400).send("fail");
    return;
  }

  // 1. Verify signature
  if (!verifyAlipayNotify(params)) {
    console.error(`[ALIPAY-NOTIFY] Signature verification failed: order=${outTradeNo}, sign_type=${params.sign_type}, app_id=${params.app_id}`);
    res.status(400).send("fail");
    return;
  }

  // 1.1 App/merchant verification (optional strict verification)
  const expectedAppId = process.env.ALIPAY_EXPECT_APP_ID || process.env.ALIPAY_APP_ID;
  if (expectedAppId && params.app_id && params.app_id !== expectedAppId) {
    console.error(`[ALIPAY-NOTIFY] app_id mismatch: notify=${params.app_id}, expected=${expectedAppId}`);
    res.status(400).send("fail");
    return;
  }
  const expectedSellerId = process.env.ALIPAY_EXPECT_SELLER_ID;
  if (expectedSellerId && params.seller_id && params.seller_id !== expectedSellerId) {
    console.error(`[ALIPAY-NOTIFY] seller_id mismatch: notify=${params.seller_id}, expected=${expectedSellerId}`);
    res.status(400).send("fail");
    return;
  }

  // 2. Check trade status
  if (tradeStatus !== "TRADE_SUCCESS" && tradeStatus !== "TRADE_FINISHED") {
    if (tradeStatus === "TRADE_CLOSED") {
      await setOrderStatus(outTradeNo, "closed");
    }
    res.send("success");
    return;
  }

  // 3. Find order
  const order = await getPaymentOrder(outTradeNo);
  if (!order) {
    console.warn(`[ALIPAY-NOTIFY] Unknown order: ${outTradeNo}`);
    res.send("success");
    return;
  }

  // 4. Prevent duplicate processing
  if (order.status === "paid" && order.processed) {
    res.send("success");
    return;
  }

  // 5. Amount verification
  if (!Number.isFinite(totalAmount) || Math.abs(totalAmount - order.amount) > 0.01) {
    console.error(`[ALIPAY-NOTIFY] Amount mismatch: order=${order.amount}, payment=${totalAmount}`);
    res.status(400).send("fail");
    return;
  }

  // 6. Parse additional parameters to get userId
  let userId = order.user_id;
  if (params.passback_params) {
    try {
      const extra = JSON.parse(decodeURIComponent(params.passback_params));
      if (extra.userId) userId = extra.userId;
    } catch {}
  }

  // 7. Atomically mark order as paid (mutex: only one caller can succeed)
  const claimed = await markOrderPaid({
    orderNo: outTradeNo,
    providerTradeNo: params.trade_no,
    notifyPayload: JSON.stringify(params),
    processed: true,
  });
  if (!claimed) {
    console.log(`[ALIPAY-NOTIFY] Order already processed (skipping duplicate recharge): ${outTradeNo}`);
    res.send("success");
    return;
  }

  // 8. Execute recharge (markOrderPaid succeeded, this is the sole executor)
  const tx = await recharge(userId, totalAmount, `Alipay recharge ¥${totalAmount.toFixed(2)} (${outTradeNo})`);
  if (tx) {
    console.log(`[ALIPAY-NOTIFY] Recharge successful: user=${userId}, amount=¥${totalAmount}, order=${outTradeNo}`);
  } else {
    console.error(`[ALIPAY-NOTIFY] ⚠️ Order marked as paid but recharge failed, requires manual intervention: user=${userId}, amount=¥${totalAmount}, order=${outTradeNo}`);
    await setOrderStatus(outTradeNo, "failed");
  }

  // 9. Return success to notify Alipay to stop sending notifications
  res.send("success");
});

// GET /api/billing/order/status — Query payment order status
router.get("/order/status", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const orderNo = (req.query.orderNo || req.query.orderId) as string;
  if (!orderNo) {
    res.status(400).json({ success: false, message: "Missing order number" });
    return;
  }

  const order = await getPaymentOrderForUser(orderNo, userId);
  if (!order) {
    res.json({ success: true, data: { status: "unknown" } });
    return;
  }

  // If locally marked as paid
  if (order.status === "paid") {
    res.json({ success: true, data: { status: "paid" } });
    return;
  }

  // Proactively query Alipay
  const tradeResult = await queryTradeStatus(orderNo);
  if (tradeResult.success && tradeResult.status === "TRADE_SUCCESS") {
    // Payment successful but callback hasn't arrived yet, process manually
    if (!order.processed) {
      // Atomically mark order as paid (mutex: prevent concurrent recharge with notify callback)
      const claimed = await markOrderPaid({
        orderNo,
        providerTradeNo: tradeResult.tradeNo,
        notifyPayload: JSON.stringify(tradeResult.raw || {}),
        processed: true,
      });
      if (claimed) {
        const tx = await recharge(order.user_id, order.amount, `Alipay recharge ¥${order.amount.toFixed(2)} (${orderNo})`);
        if (tx) {
          console.log(`[ALIPAY-POLL] Recharge successful: user=${order.user_id}, amount=¥${order.amount}`);
        } else {
          console.error(`[ALIPAY-POLL] ⚠️ Order marked as paid but recharge failed, requires manual intervention: user=${order.user_id}, amount=¥${order.amount}`);
          await setOrderStatus(orderNo, "failed");
        }
      } else {
        console.log(`[ALIPAY-POLL] Order already processed via another path (skipping duplicate recharge): ${orderNo}`);
      }
    }
    res.json({ success: true, data: { status: "paid" } });
    return;
  }

  if (tradeResult.success && tradeResult.status === "TRADE_CLOSED") {
    await setOrderStatus(orderNo, "closed");
    res.json({ success: true, data: { status: "closed" } });
    return;
  }

  res.json({ success: true, data: { status: order.status || "pending" } });
});

export default router;
