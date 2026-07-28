/**
 * 支付宝支付服务
 * 
 * ====== 环境变量配置（.env） ======
 * 
 * ALIPAY_APP_ID=你的支付宝应用 AppID
 * ALIPAY_PRIVATE_KEY=你的应用私钥（RSA2）
 * ALIPAY_PUBLIC_KEY=支付宝公钥
 * ALIPAY_NOTIFY_URL=异步通知回调地址（如 https://api.nexusflow.io/api/billing/alipay/notify）
 * ALIPAY_RETURN_URL=同步跳转地址（如 https://nexusflow.io/billing?pay=success）
 * ALIPAY_GATEWAY=网关地址（正式：https://openapi.alipay.com/gateway.do，沙箱：https://openapi-sandbox.dl.alipaydev.com/gateway.do）
 * 
 * ====== 支付宝开通流程 ======
 * 
 * 1. 登录支付宝开放平台 https://open.alipay.com/
 * 2. 创建应用 → 网页/移动应用
 * 3. 添加"电脑网站支付"能力（需签约，需营业执照）
 *    - 如果是个人开发者，可先用"沙箱环境"测试
 * 4. 生成密钥：
 *    - 下载支付宝开放平台密钥工具 https://opendocs.alipay.com/common/02kipl
 *    - 生成 RSA2(SHA256) 密钥对
 *    - 将"应用公钥"上传到支付宝开放平台
 *    - 获取"支付宝公钥"（注意不是应用公钥）
 * 5. 将 AppID、应用私钥、支付宝公钥填入 .env
 * 
 * ====== 沙箱测试 ======
 * 
 * 沙箱环境：https://open.alipay.com/develop/sandbox/app
 *   - 设置 ALIPAY_GATEWAY=https://openapi-sandbox.dl.alipaydev.com/gateway.do
 *   - 使用沙箱的 AppID、密钥、账号
 * 
 * ====== 测试支付 ======
 *
 * 模拟支付必须显式设置 ENABLE_MOCK_PAYMENT=true，且生产环境永不允许。
 */

import { AlipaySdk } from "alipay-sdk";
import crypto from "crypto";
import { isExplicitDevelopmentFeatureEnabled } from "../utils/runtime-safety";

// ============ 支付宝客户端 ============

let alipayClient: InstanceType<typeof AlipaySdk> | null = null;

function isAlipayConfigured(): boolean {
  return !!(
    process.env.ALIPAY_APP_ID &&
    process.env.ALIPAY_PRIVATE_KEY &&
    process.env.ALIPAY_PUBLIC_KEY
  );
}

export function isMockPaymentAllowed(): boolean {
  return isExplicitDevelopmentFeatureEnabled("ENABLE_MOCK_PAYMENT");
}

export function getAlipayConfigStatus() {
  const required = [
    "ALIPAY_APP_ID",
    "ALIPAY_PRIVATE_KEY",
    "ALIPAY_PUBLIC_KEY",
    "ALIPAY_NOTIFY_URL",
    "ALIPAY_RETURN_URL",
  ] as const;
  const missing = required.filter((k) => !process.env[k] || !String(process.env[k]).trim());
  return {
    configured: missing.length === 0,
    missing,
    gateway: process.env.ALIPAY_GATEWAY || "https://openapi.alipay.com/gateway.do",
    appId: process.env.ALIPAY_APP_ID || "",
    notifyUrl: process.env.ALIPAY_NOTIFY_URL || "",
    returnUrl: process.env.ALIPAY_RETURN_URL || "",
    mockEnabled: isMockPaymentAllowed(),
  };
}

function getAlipayClient(): InstanceType<typeof AlipaySdk> {
  if (!alipayClient) {
    alipayClient = new AlipaySdk({
      appId: process.env.ALIPAY_APP_ID!,
      privateKey: process.env.ALIPAY_PRIVATE_KEY!,
      alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY!,
      signType: "RSA2",
      gateway: process.env.ALIPAY_GATEWAY || "https://openapi.alipay.com/gateway.do",
    });
  }
  return alipayClient;
}

/** 生成唯一订单号 */
export function generateOrderNo(): string {
  const date = new Date();
  const dateStr = date.getFullYear().toString() +
    (date.getMonth() + 1).toString().padStart(2, "0") +
    date.getDate().toString().padStart(2, "0") +
    date.getHours().toString().padStart(2, "0") +
    date.getMinutes().toString().padStart(2, "0") +
    date.getSeconds().toString().padStart(2, "0");
  const random = crypto.randomInt(100000, 999999).toString();
  return `NF${dateStr}${random}`;
}

// ============ 对外接口 ============

export interface CreatePaymentResult {
  success: boolean;
  message: string;
  data?: {
    orderNo: string;
    /** 电脑网站支付：返回 HTML form，前端直接渲染跳转 */
    paymentForm?: string;
    /** 当面付：返回二维码链接 */
    qrCode?: string;
    /** 模拟模式：直接返回成功 */
    mockPaid?: boolean;
  };
}

/**
 * 创建电脑网站支付订单（alipay.trade.page.pay）
 * 用户点击后跳转到支付宝收银台页面
 */
export async function createPagePayment(
  userId: string,
  amount: number,
  subject: string = "nexusflow 账户充值"
): Promise<CreatePaymentResult> {
  const orderNo = generateOrderNo();

  if (!isAlipayConfigured()) {
    if (isMockPaymentAllowed()) {
      console.log(`[ALIPAY-MOCK] 模拟支付: 用户=${userId}, 金额=${amount}, 订单=${orderNo}`);
      return {
        success: true,
        message: "模拟支付成功（未配置支付宝，充值即时到账）",
        data: { orderNo, mockPaid: true },
      };
    }
    return { success: false, message: "支付服务暂未配置，请稍后重试" };
  }

  try {
    const client = getAlipayClient();

    // 电脑网站支付 - 返回跳转 URL（GET 方式）
    const result = await client.pageExec("alipay.trade.page.pay", {
      method: "GET",
      notify_url: process.env.ALIPAY_NOTIFY_URL,
      return_url: process.env.ALIPAY_RETURN_URL,
      bizContent: {
        out_trade_no: orderNo,
        total_amount: amount.toFixed(2),
        subject,
        product_code: "FAST_INSTANT_TRADE_PAY",
        timeout_express: "15m",
        passback_params: encodeURIComponent(JSON.stringify({ userId })),
      },
    });

    console.log(`[ALIPAY] 创建支付订单: ${orderNo}, 金额: ¥${amount}`);

    return {
      success: true,
      message: "支付订单已创建",
      data: { orderNo, paymentForm: result as string },
    };
  } catch (error: any) {
    console.error("[ALIPAY] 创建支付失败:", error.message);
    return { success: false, message: "创建支付订单失败，请稍后重试" };
  }
}

/**
 * 创建当面付订单（alipay.trade.precreate）
 * 返回二维码链接，用户扫码支付
 */
export async function createQrPayment(
  userId: string,
  amount: number,
  subject: string = "nexusflow 账户充值"
): Promise<CreatePaymentResult> {
  const orderNo = generateOrderNo();

  if (!isAlipayConfigured()) {
    if (isMockPaymentAllowed()) {
      console.log(`[ALIPAY-MOCK] 模拟支付: 用户=${userId}, 金额=${amount}, 订单=${orderNo}`);
      return {
        success: true,
        message: "模拟支付成功（未配置支付宝，充值即时到账）",
        data: { orderNo, mockPaid: true },
      };
    }
    return { success: false, message: "支付服务暂未配置，请稍后重试" };
  }

  try {
    const client = getAlipayClient();

    const result = await client.exec("alipay.trade.precreate", {
      notify_url: process.env.ALIPAY_NOTIFY_URL,
      bizContent: {
        out_trade_no: orderNo,
        total_amount: amount.toFixed(2),
        subject,
        timeout_express: "15m",
        // 附加数据
        passback_params: encodeURIComponent(JSON.stringify({ userId })),
      },
    });

    const responseData = result as any;
    if (responseData.code === "10000" && responseData.qrCode) {
      console.log(`[ALIPAY] 当面付订单: ${orderNo}, 金额: ¥${amount}`);
      return {
        success: true,
        message: "支付二维码已生成",
        data: { orderNo, qrCode: responseData.qrCode },
      };
    }

    console.error("[ALIPAY] 当面付失败:", responseData.subMsg || responseData.msg);
    return { success: false, message: responseData.subMsg || "创建支付失败" };
  } catch (error: any) {
    console.error("[ALIPAY] 当面付异常:", error.message);
    return { success: false, message: "创建支付订单失败" };
  }
}

/**
 * 验证支付宝异步通知签名
 */
export function verifyAlipayNotify(params: Record<string, string>): boolean {
  if (!isAlipayConfigured()) {
    console.error("[ALIPAY] verifyAlipayNotify: 支付宝未配置");
    return false;
  }

  try {
    const client = getAlipayClient();
    // 使用 V2 版本：express.urlencoded 已对 POST body 做了 decode，
    // checkNotifySignV2 内部用 raw 模式拼接验签字符串，避免二次 decode 导致签名不匹配
    const result = client.checkNotifySignV2(params);
    if (!result) {
      console.error(`[ALIPAY] checkNotifySignV2 返回 false, sign_type=${params.sign_type}, has_sign=${!!params.sign}, alipayPublicKey长度=${process.env.ALIPAY_PUBLIC_KEY?.length}`);
    }
    return result;
  } catch (error: any) {
    console.error("[ALIPAY] 签名验证异常:", error.message);
    return false;
  }
}

/**
 * 查询支付订单状态
 */
export async function queryTradeStatus(orderNo: string): Promise<{
  success: boolean;
  status?: string;
  amount?: number;
  tradeNo?: string;
  raw?: any;
}> {
  if (!isAlipayConfigured()) {
    return { success: false };
  }

  try {
    const client = getAlipayClient();
    const result = await client.exec("alipay.trade.query", {
      bizContent: { out_trade_no: orderNo },
    });

    const data = result as any;
    if (data.code === "10000") {
      const status = data.trade_status || data.tradeStatus;
      const amountRaw = data.total_amount || data.totalAmount;
      return {
        success: true,
        status,
        amount: parseFloat(amountRaw),
        tradeNo: data.trade_no || data.tradeNo,
        raw: data,
      };
    }
    return { success: false };
  } catch {
    return { success: false };
  }
}
