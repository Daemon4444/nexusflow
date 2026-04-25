/**
 * Webhook Service
 *
 * 实现：
 * - 异步任务完成通知
 * - 用户配置回调地址
 * - 重试机制
 */

import dotenv from "dotenv";
import { getWebhooksByUser } from "../db/pg";

dotenv.config();

const WEBHOOK_TIMEOUT = parseInt(process.env.WEBHOOK_TIMEOUT || "5000");
const WEBHOOK_RETRY_COUNT = parseInt(process.env.WEBHOOK_RETRY_COUNT || "3");

// ============================================================
// Webhook 发送
// ============================================================

interface WebhookPayload {
  event: string;
  taskId: string;
  userId: string;
  model: string;
  type: string; // 'image' | 'video'
  status: string;
  output?: any;
  error?: string;
  timestamp: number;
}

interface WebhookResult {
  success: boolean;
  webhookId: string;
  url: string;
  statusCode?: number;
  error?: string;
  attempts: number;
}

/**
 * 发送 Webhook 通知
 */
export async function sendWebhook(
  webhookId: string,
  url: string,
  secret: string | null,
  payload: WebhookPayload
): Promise<WebhookResult> {
  let attempts = 0;
  let lastError: string | undefined = undefined;
  let lastStatusCode: number | undefined = undefined;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Quadrant-Event": payload.event,
    "X-Quadrant-Delivery": webhookId,
  };

  // 如果有密钥，添加签名
  if (secret) {
    const signature = generateSignature(payload, secret);
    headers["X-Quadrant-Signature"] = signature;
  }

  // 重试发送
  while (attempts < WEBHOOK_RETRY_COUNT) {
    attempts++;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT),
      });

      lastStatusCode = response.status;

      if (response.ok) {
        // 发送成功
        return {
          success: true,
          webhookId,
          url,
          statusCode: response.status,
          attempts,
        };
      }

      // 非 2xx 状态码
      const body = await response.text();
      lastError = `HTTP ${response.status}: ${body.slice(0, 200)}`;

      // 对于 4xx 错误，不再重试（客户端错误）
      if (response.status >= 400 && response.status < 500) {
        break;
      }

    } catch (err: any) {
      lastError = err.message;

      // 网络错误，等待后重试
      if (attempts < WEBHOOK_RETRY_COUNT) {
        await sleep(1000 * attempts); // 递增延迟
      }
    }
  }

  // 所有重试都失败
  return {
    success: false,
    webhookId,
    url,
    statusCode: lastStatusCode,
    error: lastError,
    attempts,
  };
}

/**
 * 批量发送 Webhook（通知所有订阅的用户）
 */
export async function notifyTaskCompletion(params: {
  taskId: string;
  userId: string;
  model: string;
  type: string;
  status: string;
  output?: any;
  error?: string;
}): Promise<WebhookResult[]> {
  const results: WebhookResult[] = [];

  // 获取用户的所有 Webhook 配置
  const webhooks = await getWebhooksByUser(params.userId);

  if (webhooks.length === 0) {
    return results; // 用户没有配置 Webhook
  }

  // 构造 payload
  const payload: WebhookPayload = {
    event: params.status === "succeeded" ? "task.completed" : "task.failed",
    taskId: params.taskId,
    userId: params.userId,
    model: params.model,
    type: params.type,
    status: params.status,
    output: params.output,
    error: params.error,
    timestamp: Date.now(),
  };

  // 发送所有 Webhook
  for (const webhook of webhooks) {
    // 检查事件是否匹配
    if (!webhook.events.includes(payload.event)) {
      continue;
    }

    const result = await sendWebhook(
      webhook.id,
      webhook.url,
      webhook.secret,
      payload
    );

    results.push(result);

    // 记录发送结果
    await logWebhookDelivery(webhook.id, payload.event, result);
  }

  return results;
}

// ============================================================
// 签名生成
// ============================================================

import { createHmac } from "crypto";

/**
 * 生成 Webhook 签名（防止伪造请求）
 */
function generateSignature(payload: WebhookPayload, secret: string): string {
  const data = JSON.stringify(payload);
  const hmac = createHmac("sha256", secret);
  hmac.update(data);
  return `sha256=${hmac.digest("hex")}`;
}

/**
 * 验证 Webhook 签名（接收端使用）
 */
export function verifySignature(
  payload: WebhookPayload,
  signature: string,
  secret: string
): boolean {
  const expected = generateSignature(payload, secret);
  return signature === expected;
}

// ============================================================
// 发送记录
// ============================================================

interface DeliveryLog {
  id: number;
  webhookId: string;
  eventType: string;
  payload: string;
  status: string;
  responseCode: number | undefined;
  responseBody: string | undefined;
  attempts: number;
  deliveredAt: Date | null;
  createdAt: Date;
}

// 发送记录存储（内存，生产环境应存数据库）
const DELIVERY_LOGS: DeliveryLog[] = [];
const MAX_LOGS = 1000;

async function logWebhookDelivery(
  webhookId: string,
  eventType: string,
  result: WebhookResult
): Promise<void> {
  const log: DeliveryLog = {
    id: DELIVERY_LOGS.length + 1,
    webhookId,
    eventType,
    payload: JSON.stringify(result),
    status: result.success ? "success" : "failed",
    responseCode: result.statusCode,
    responseBody: result.error,
    attempts: result.attempts,
    deliveredAt: result.success ? new Date() : null,
    createdAt: new Date(),
  };

  DELIVERY_LOGS.push(log);

  // 限制日志数量
  if (DELIVERY_LOGS.length > MAX_LOGS) {
    DELIVERY_LOGS.shift();
  }
}

/**
 * 获取 Webhook 发送记录
 */
export function getDeliveryLogs(webhookId?: string, limit: number = 50): DeliveryLog[] {
  let logs = DELIVERY_LOGS;

  if (webhookId) {
    logs = logs.filter((l) => l.webhookId === webhookId);
  }

  return logs.slice(-limit);
}

// ============================================================
// Webhook 管理 API
// ============================================================

/**
 * 创建 Webhook 配置（简化版，实际应由 API 路由调用）
 */
export async function createWebhookConfig(
  userId: string,
  url: string,
  secret?: string,
  events?: string[]
): Promise<{ id: string; url: string }> {
  const id = `wh-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // 这里应该调用 pg.ts 的 createWebhook
  // 实际实现时由路由处理

  return { id, url };
}

// ============================================================
// 辅助函数
// ============================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================
// 导出
// ============================================================

export default {
  sendWebhook,
  notifyTaskCompletion,
  verifySignature,
  getDeliveryLogs,
  createWebhookConfig,
};