/**
 * Webhook Service
 *
 * Implements:
 * - Async task completion notifications
 * - User-configured callback URLs
 * - Retry mechanism
 */

import dotenv from "dotenv";
import { getWebhooksByUser } from "../db/pg";

dotenv.config();

const WEBHOOK_TIMEOUT = parseInt(process.env.WEBHOOK_TIMEOUT || "5000");
const WEBHOOK_RETRY_COUNT = parseInt(process.env.WEBHOOK_RETRY_COUNT || "3");

// ============================================================
// Webhook delivery
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
 * Send a webhook notification
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

  // Add signature if a secret is configured
  if (secret) {
    const signature = generateSignature(payload, secret);
    headers["X-Quadrant-Signature"] = signature;
  }

  // Retry sending
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
        // Sent successfully
        return {
          success: true,
          webhookId,
          url,
          statusCode: response.status,
          attempts,
        };
      }

      // Non-2xx status code
      const body = await response.text();
      lastError = `HTTP ${response.status}: ${body.slice(0, 200)}`;

      // Do not retry 4xx (client errors)
      if (response.status >= 400 && response.status < 500) {
        break;
      }

    } catch (err: any) {
      lastError = err.message;

      // Network error, wait and retry
      if (attempts < WEBHOOK_RETRY_COUNT) {
        await sleep(1000 * attempts); // increasing delay
      }
    }
  }

  // All retries failed
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
 * Send webhooks to all subscribed users in a batch
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

  // Fetch all webhook configurations for the user
  const webhooks = await getWebhooksByUser(params.userId);

  if (webhooks.length === 0) {
    return results; // user has no webhook configured
  }

  // Build payload
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

  // Deliver all webhooks
  for (const webhook of webhooks) {
    // Check if the event matches
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

    // Record the delivery result
    await logWebhookDelivery(webhook.id, payload.event, result);
  }

  return results;
}

// ============================================================
// Signature generation
// ============================================================

import { createHmac } from "crypto";

/**
 * Generate a webhook signature (prevents request forgery)
 */
function generateSignature(payload: WebhookPayload, secret: string): string {
  const data = JSON.stringify(payload);
  const hmac = createHmac("sha256", secret);
  hmac.update(data);
  return `sha256=${hmac.digest("hex")}`;
}

/**
 * Verify a webhook signature (used by receivers)
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
// Delivery records
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

// Delivery log storage (in-memory; production should persist to DB)
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

  // Cap log count
  if (DELIVERY_LOGS.length > MAX_LOGS) {
    DELIVERY_LOGS.shift();
  }
}

/**
 * Get webhook delivery records
 */
export function getDeliveryLogs(webhookId?: string, limit: number = 50): DeliveryLog[] {
  let logs = DELIVERY_LOGS;

  if (webhookId) {
    logs = logs.filter((l) => l.webhookId === webhookId);
  }

  return logs.slice(-limit);
}

// ============================================================
// Webhook management API
// ============================================================

/**
 * Create webhook configuration (simplified; route handlers should call the real implementation)
 */
export async function createWebhookConfig(
  userId: string,
  url: string,
  secret?: string,
  events?: string[]
): Promise<{ id: string; url: string }> {
  const id = `wh-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // In real use, call pg.ts createWebhook from the route handler.

  return { id, url };
}

// ============================================================
// Helpers
// ============================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================
// Exports
// ============================================================

export default {
  sendWebhook,
  notifyTaskCompletion,
  verifySignature,
  getDeliveryLogs,
  createWebhookConfig,
};
