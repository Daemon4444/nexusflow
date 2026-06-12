/**
 * Alipay payment service
 *
 * ====== Environment variables (.env) ======
 *
 * ALIPAY_APP_ID=your Alipay application AppID
 * ALIPAY_PRIVATE_KEY=your application private key (RSA2)
 * ALIPAY_PUBLIC_KEY=Alipay public key
 * ALIPAY_NOTIFY_URL=Async notification callback URL (e.g. https://api.nexusflow.io/api/billing/alipay/notify)
 * ALIPAY_RETURN_URL=Synchronous redirect URL (e.g. https://nexusflow.io/billing?pay=success)
 * ALIPAY_GATEWAY=Gateway URL (production: https://openapi.alipay.com/gateway.do, sandbox: https://openapi-sandbox.dl.alipaydev.com/gateway.do)
 *
 * ====== Alipay setup steps ======
 *
 * 1. Sign in to Alipay Open Platform https://open.alipay.com/
 * 2. Create an application -> Web/Mobile application
 * 3. Add the "PC website payment" capability (requires signing, requires business license)
 *    - Individual developers can use the sandbox environment for testing first
 * 4. Generate keys:
 *    - Download Alipay Open Platform Key Tool https://opendocs.alipay.com/common/02kipl
 *    - Generate an RSA2(SHA256) key pair
 *    - Upload the "application public key" to Alipay Open Platform
 *    - Obtain the "Alipay public key" (note: not the application public key)
 * 5. Put AppID, application private key, and Alipay public key in .env
 *
 * ====== Sandbox testing ======
 *
 * Sandbox: https://open.alipay.com/develop/sandbox/app
 *   - Set ALIPAY_GATEWAY=https://openapi-sandbox.dl.alipaydev.com/gateway.do
 *   - Use the sandbox AppID, keys, and account
 *
 * ====== Test payments ======
 *
 * Mock payment must be explicitly enabled with ENABLE_MOCK_PAYMENT=true and is never allowed in production.
 */

import { AlipaySdk } from "alipay-sdk";
import crypto from "crypto";

// ============ Alipay client ============

let alipayClient: InstanceType<typeof AlipaySdk> | null = null;

function isAlipayConfigured(): boolean {
  return !!(
    process.env.ALIPAY_APP_ID &&
    process.env.ALIPAY_PRIVATE_KEY &&
    process.env.ALIPAY_PUBLIC_KEY
  );
}

export function isMockPaymentAllowed(): boolean {
  return process.env.ENABLE_MOCK_PAYMENT === "true" && process.env.NODE_ENV !== "production";
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

/** Generate a unique order number */
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

// ============ Public API ============

export interface CreatePaymentResult {
  success: boolean;
  message: string;
  data?: {
    orderNo: string;
    /** PC website payment: returns an HTML form that the frontend submits to redirect */
    paymentForm?: string;
    /** Face-to-face payment: returns the QR code URL */
    qrCode?: string;
    /** Mock mode: returned as success directly */
    mockPaid?: boolean;
  };
}

/**
 * Create a PC website payment order (alipay.trade.page.pay).
 * After clicking, the user is redirected to the Alipay cashier page.
 */
export async function createPagePayment(
  userId: string,
  amount: number,
  subject: string = "nexusflow account recharge"
): Promise<CreatePaymentResult> {
  const orderNo = generateOrderNo();

  if (!isAlipayConfigured()) {
    if (isMockPaymentAllowed()) {
      console.log(`[ALIPAY-MOCK] mock payment: user=${userId}, amount=${amount}, order=${orderNo}`);
      return {
        success: true,
        message: "Mock payment successful (Alipay not configured, recharge credited immediately)",
        data: { orderNo, mockPaid: true },
      };
    }
    return { success: false, message: "Payment service is not configured, please retry later" };
  }

  try {
    const client = getAlipayClient();

    // PC website payment - returns the redirect URL (GET method)
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

    console.log(`[ALIPAY] payment order created: ${orderNo}, amount: $${amount}`);

    return {
      success: true,
      message: "Payment order created",
      data: { orderNo, paymentForm: result as string },
    };
  } catch (error: any) {
    console.error("[ALIPAY] failed to create payment:", error.message);
    return { success: false, message: "Failed to create payment order, please retry later" };
  }
}

/**
 * Create a face-to-face payment order (alipay.trade.precreate).
 * Returns the QR-code URL the user can scan to pay.
 */
export async function createQrPayment(
  userId: string,
  amount: number,
  subject: string = "nexusflow account recharge"
): Promise<CreatePaymentResult> {
  const orderNo = generateOrderNo();

  if (!isAlipayConfigured()) {
    if (isMockPaymentAllowed()) {
      console.log(`[ALIPAY-MOCK] mock payment: user=${userId}, amount=${amount}, order=${orderNo}`);
      return {
        success: true,
        message: "Mock payment successful (Alipay not configured, recharge credited immediately)",
        data: { orderNo, mockPaid: true },
      };
    }
    return { success: false, message: "Payment service is not configured, please retry later" };
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
        // Additional data
        passback_params: encodeURIComponent(JSON.stringify({ userId })),
      },
    });

    const responseData = result as any;
    if (responseData.code === "10000" && responseData.qrCode) {
      console.log(`[ALIPAY] QR-code order: ${orderNo}, amount: $${amount}`);
      return {
        success: true,
        message: "Payment QR code generated",
        data: { orderNo, qrCode: responseData.qrCode },
      };
    }

    console.error("[ALIPAY] QR-code payment failed:", responseData.subMsg || responseData.msg);
    return { success: false, message: responseData.subMsg || "Failed to create payment" };
  } catch (error: any) {
    console.error("[ALIPAY] QR-code payment exception:", error.message);
    return { success: false, message: "Failed to create payment order" };
  }
}

/**
 * Verify Alipay async notification signature
 */
export function verifyAlipayNotify(params: Record<string, string>): boolean {
  if (!isAlipayConfigured()) {
    console.error("[ALIPAY] verifyAlipayNotify: Alipay not configured");
    return false;
  }

  try {
    const client = getAlipayClient();
    // Use V2: express.urlencoded already decodes the POST body,
    // checkNotifySignV2 internally builds the verification string in raw mode to avoid double-decoding mismatching the signature.
    const result = client.checkNotifySignV2(params);
    if (!result) {
      console.error(`[ALIPAY] checkNotifySignV2 returned false, sign_type=${params.sign_type}, has_sign=${!!params.sign}, alipayPublicKey length=${process.env.ALIPAY_PUBLIC_KEY?.length}`);
    }
    return result;
  } catch (error: any) {
    console.error("[ALIPAY] signature verification exception:", error.message);
    return false;
  }
}

/**
 * Query payment order status
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
