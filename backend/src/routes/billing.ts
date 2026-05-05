import { Router, Request, Response } from "express";
import { validateSession } from "../data/users";
import { recharge, getTransactions, getBillingSummary, getMonthlyStats } from "../data/billing";
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
  res.json({
    success: true,
    data: {
      rows: rows.map((r) => ({
        id: r.id,
        type: r.type,
        amount: r.amount,
        balanceAfter: r.balance_after,
        description: r.description,
        refId: r.ref_id,
        createdAt: r.created_at,
      })),
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

  if (!outTradeNo) {
    res.status(400).send("fail");
    return;
  }

  // 1. 验签
  if (!verifyAlipayNotify(params)) {
    console.error("[ALIPAY-NOTIFY] 签名验证失败");
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

  // 7. 执行充值
  const tx = await recharge(userId, totalAmount, `支付宝充值 ¥${totalAmount.toFixed(2)} (${outTradeNo})`);
  if (tx) {
    await markOrderPaid({
      orderNo: outTradeNo,
      providerTradeNo: params.trade_no,
      notifyPayload: JSON.stringify(params),
      processed: true,
    });
    console.log(`[ALIPAY-NOTIFY] 充值成功: 用户=${userId}, 金额=¥${totalAmount}, 订单=${outTradeNo}`);
  } else {
    await setOrderStatus(outTradeNo, "failed");
    console.error(`[ALIPAY-NOTIFY] 充值失败: 用户=${userId}, 订单=${outTradeNo}`);
  }

  // 8. 返回 success 告知支付宝停止通知
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
      const tx = await recharge(order.user_id, order.amount, `支付宝充值 ¥${order.amount.toFixed(2)} (${orderNo})`);
      if (tx) {
        await markOrderPaid({
          orderNo,
          providerTradeNo: tradeResult.tradeNo,
          notifyPayload: JSON.stringify(tradeResult.raw || {}),
          processed: true,
        });
        console.log(`[ALIPAY-POLL] 充值成功: 用户=${order.user_id}, 金额=¥${order.amount}`);
      } else {
        await setOrderStatus(orderNo, "failed");
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
