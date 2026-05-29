import { Router, Request, Response } from "express";
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

function sanitizeError(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as any;
    if (e.name === "AbortError" || e.code === "ABORT_ERR") return "Request timed out.";
    if (e.code === "ECONNREFUSED") return "Service unavailable.";
    if (e.code === "ENOTFOUND") return "Service unreachable.";
  }
  return "An internal error occurred. Please try again.";
}

/** 从请求头提取 session token 并验证用户 */
async function requireAuth(req: Request, res: Response): Promise<string | null> {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    res.status(401).json({ success: false, message: "未登录" });
    return null;
  }
  const token = auth.slice(7).trim();
  const session = await validateSession(token);
  if (!session) {
    res.status(401).json({ success: false, message: "登录已过期，请重新登录" });
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

// GET /api/billing/summary — 账单概览
router.get("/summary", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const summary = await getBillingSummary(userId);
  res.json({ success: true, data: summary });
});

// GET /api/billing/transactions — 交易记录列表
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

// GET /api/billing/monthly — 月度统计
router.get("/monthly", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const stats = await getMonthlyStats(userId);
  res.json({ success: true, data: stats });
});

// GET /api/billing/export.csv — 账单用量明细 CSV
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

// GET /api/billing/payment/config — 支付配置状态（用于前端提示）
router.get("/payment/config", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  const status = getAlipayConfigStatus();
  res.json({ success: true, data: status });
});

// POST /api/billing/recharge — 充值（支付宝电脑网站支付）
router.post("/recharge", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { amount, method } = req.body;
  const normalizedAmount = asAmount(amount);
  if (!normalizedAmount || normalizedAmount <= 0) {
    res.status(400).json({ success: false, message: "充值金额必须大于 0" });
    return;
  }
  if (normalizedAmount > 10000) {
    res.status(400).json({ success: false, message: "单次充值金额不能超过 10000 元" });
    return;
  }

  // method: "page"(电脑网站支付) | "qr"(当面付扫码) | "mock"(模拟充值)
  const payMethod = method || "page";

  if (payMethod === "mock") {
    if (!isMockPaymentAllowed()) {
      res.status(403).json({ success: false, message: "当前环境不允许模拟充值" });
      return;
    }
    // 模拟充值（测试用）
    const tx = await recharge(userId, normalizedAmount);
    if (!tx) {
      res.status(500).json({ success: false, message: "充值失败" });
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
      message: `充值成功，当前余额 ¥${tx.balance_after.toFixed(2)}`,
    });
    return;
  }

  // 支付宝支付
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

  // 模拟模式（未配置支付宝时）直接到账
  if (result.data?.mockPaid) {
    const tx = await recharge(userId, normalizedAmount, `充值 ¥${normalizedAmount.toFixed(2)}（模拟支付）`);
    if (!tx) {
      res.status(500).json({ success: false, message: "充值失败" });
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
      message: `充值成功，当前余额 ¥${tx.balance_after.toFixed(2)}`,
    });
    return;
  }

  // 记录持久化订单
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

// POST /api/billing/alipay/notify — 支付宝异步通知回调
router.post("/alipay/notify", async (req: Request, res: Response) => {
  const params = req.body as Record<string, string>;
  const outTradeNo = params.out_trade_no;
  const tradeStatus = params.trade_status;
  const totalAmount = asAmount(params.total_amount);

  console.log(`[ALIPAY-NOTIFY] 收到回调: order=${outTradeNo}, status=${tradeStatus}, amount=${params.total_amount}, keys=${Object.keys(params).join(",")}`);

  if (!outTradeNo) {
    res.status(400).send("fail");
    return;
  }

  // 1. 验签
  if (!verifyAlipayNotify(params)) {
    console.error(`[ALIPAY-NOTIFY] 签名验证失败: order=${outTradeNo}, sign_type=${params.sign_type}, app_id=${params.app_id}`);
    res.status(400).send("fail");
    return;
  }

  // 1.1 应用/商户校验（可选强校验）
  const expectedAppId = process.env.ALIPAY_EXPECT_APP_ID || process.env.ALIPAY_APP_ID;
  if (expectedAppId && params.app_id && params.app_id !== expectedAppId) {
    console.error(`[ALIPAY-NOTIFY] app_id 不匹配: notify=${params.app_id}, expected=${expectedAppId}`);
    res.status(400).send("fail");
    return;
  }
  const expectedSellerId = process.env.ALIPAY_EXPECT_SELLER_ID;
  if (expectedSellerId && params.seller_id && params.seller_id !== expectedSellerId) {
    console.error(`[ALIPAY-NOTIFY] seller_id 不匹配: notify=${params.seller_id}, expected=${expectedSellerId}`);
    res.status(400).send("fail");
    return;
  }

  // 2. 检查交易状态
  if (tradeStatus !== "TRADE_SUCCESS" && tradeStatus !== "TRADE_FINISHED") {
    if (tradeStatus === "TRADE_CLOSED") {
      await setOrderStatus(outTradeNo, "closed");
    }
    res.send("success");
    return;
  }

  // 3. 查找订单
  const order = await getPaymentOrder(outTradeNo);
  if (!order) {
    console.warn(`[ALIPAY-NOTIFY] 未知订单: ${outTradeNo}`);
    res.send("success");
    return;
  }

  // 4. 防止重复处理
  if (order.status === "paid" && order.processed) {
    res.send("success");
    return;
  }

  // 5. 金额校验
  if (!Number.isFinite(totalAmount) || Math.abs(totalAmount - order.amount) > 0.01) {
    console.error(`[ALIPAY-NOTIFY] 金额不匹配: 订单=${order.amount}, 支付=${totalAmount}`);
    res.status(400).send("fail");
    return;
  }

  // 6. 解析附加参数获取 userId
  let userId = order.user_id;
  if (params.passback_params) {
    try {
      const extra = JSON.parse(decodeURIComponent(params.passback_params));
      if (extra.userId) userId = extra.userId;
    } catch {}
  }

  // 7. 原子标记订单为已支付（互斥门：只有一个调用者能成功）
  const claimed = await markOrderPaid({
    orderNo: outTradeNo,
    providerTradeNo: params.trade_no,
    notifyPayload: JSON.stringify(params),
    processed: true,
  });
  if (!claimed) {
    console.log(`[ALIPAY-NOTIFY] 订单已被处理（跳过重复充值）: ${outTradeNo}`);
    res.send("success");
    return;
  }

  // 8. 执行充值（markOrderPaid 已成功，此处为唯一执行者）
  const tx = await recharge(userId, totalAmount, `支付宝充值 ¥${totalAmount.toFixed(2)} (${outTradeNo})`);
  if (tx) {
    console.log(`[ALIPAY-NOTIFY] 充值成功: 用户=${userId}, 金额=¥${totalAmount}, 订单=${outTradeNo}`);
  } else {
    console.error(`[ALIPAY-NOTIFY] ⚠️ 订单已标记支付但充值失败，需人工介入: 用户=${userId}, 金额=¥${totalAmount}, 订单=${outTradeNo}`);
    await setOrderStatus(outTradeNo, "failed");
  }

  // 9. 返回 success 告知支付宝停止通知
  res.send("success");
});

// GET /api/billing/order/status — 查询支付订单状态
router.get("/order/status", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const orderNo = (req.query.orderNo || req.query.orderId) as string;
  if (!orderNo) {
    res.status(400).json({ success: false, message: "缺少订单号" });
    return;
  }

  const order = await getPaymentOrderForUser(orderNo, userId);
  if (!order) {
    res.json({ success: true, data: { status: "unknown" } });
    return;
  }

  // 如果本地已标记为已支付
  if (order.status === "paid") {
    res.json({ success: true, data: { status: "paid" } });
    return;
  }

  // 主动查询支付宝
  const tradeResult = await queryTradeStatus(orderNo);
  if (tradeResult.success && tradeResult.status === "TRADE_SUCCESS") {
    // 支付成功但回调还没到，手动处理
    if (!order.processed) {
      // 原子标记订单为已支付（互斥门：防止与 notify 回调并发充值）
      const claimed = await markOrderPaid({
        orderNo,
        providerTradeNo: tradeResult.tradeNo,
        notifyPayload: JSON.stringify(tradeResult.raw || {}),
        processed: true,
      });
      if (claimed) {
        const tx = await recharge(order.user_id, order.amount, `支付宝充值 ¥${order.amount.toFixed(2)} (${orderNo})`);
        if (tx) {
          console.log(`[ALIPAY-POLL] 充值成功: 用户=${order.user_id}, 金额=¥${order.amount}`);
        } else {
          console.error(`[ALIPAY-POLL] ⚠️ 订单已标记支付但充值失败，需人工介入: 用户=${order.user_id}, 金额=¥${order.amount}`);
          await setOrderStatus(orderNo, "failed");
        }
      } else {
        console.log(`[ALIPAY-POLL] 订单已被其他路径处理（跳过重复充值）: ${orderNo}`);
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
