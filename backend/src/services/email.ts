/**
 * Email verification code service - Nodemailer SMTP + Redis storage
 *
 * ====== Environment variables (.env) ======
 *
 * SMTP_HOST=smtp.qq.com          # SMTP server
 * SMTP_PORT=465                   # Port (SSL: 465)
 * SMTP_USER=your@qq.com          # Sender mailbox
 * SMTP_PASS=abcdefghijklmnop     # Authorization code
 * SMTP_FROM=Nexusflow <your@qq.com>  # Sender display name
 *
 * ====== Redis storage ======
 *
 * Codes are stored in Redis preferentially (distributed-friendly); when Redis is unavailable, fall back to memory.
 *
 * ====== Behavior when SMTP is not configured ======
 *
 * Without SMTP environment variables, the service automatically enters test mode:
 *   - Prints the verification code to the console
 */

import nodemailer from "nodemailer";
import crypto from "crypto";
import { getRedis } from "./redis";

// ============ Configuration ============

const CODE_EXPIRY_SEC = 300;           // 5 minutes (seconds)
const CODE_EXPIRY_MS = 5 * 60 * 1000;  // 5 minutes (milliseconds)
const SEND_INTERVAL_MS = 60 * 1000;    // 60 seconds send interval
const MAX_ATTEMPTS = 5;                 // Maximum verification attempts

// ============ In-memory storage (fallback when Redis is unavailable) ============

interface CodeEntry {
  code: string;
  expiresAt: number;
  attempts: number;
}

const memoryCodeStore = new Map<string, CodeEntry>();
const memorySendLimitStore = new Map<string, number>();

// ============ Redis detection ============

function useRedis(): boolean {
  return !!process.env.REDIS_HOST && process.env.REDIS_HOST !== "";
}

async function redisSetCode(email: string, code: string): Promise<void> {
  if (!useRedis()) return;
  try {
    const client = getRedis();
    const key = `email:code:${email.toLowerCase()}`;
    const data = JSON.stringify({ code, attempts: 0 });
    await client.set(key, data, "EX", CODE_EXPIRY_SEC);
  } catch {
    console.warn("[EMAIL] Redis set failed, falling back to memory");
  }
}

async function redisGetCode(email: string): Promise<{ code: string; attempts: number } | null> {
  if (!useRedis()) return null;
  try {
    const client = getRedis();
    const key = `email:code:${email.toLowerCase()}`;
    const data = await client.get(key);
    if (data) {
      return JSON.parse(data);
    }
  } catch {
    console.warn("[EMAIL] Redis get failed, falling back to memory");
  }
  return null;
}

async function redisDeleteCode(email: string): Promise<void> {
  if (!useRedis()) return;
  try {
    const client = getRedis();
    const key = `email:code:${email.toLowerCase()}`;
    await client.del(key);
  } catch {}
}

async function redisIncrementAttempts(email: string): Promise<number> {
  if (!useRedis()) return 0;
  try {
    const client = getRedis();
    const key = `email:code:${email.toLowerCase()}`;
    const data = await client.get(key);
    if (data) {
      const parsed = JSON.parse(data);
      parsed.attempts++;
      await client.set(key, JSON.stringify(parsed), "KEEPTTL");
      return parsed.attempts;
    }
  } catch {}
  return 0;
}

async function redisSetSendLimit(email: string): Promise<void> {
  if (!useRedis()) return;
  try {
    const client = getRedis();
    const key = `email:limit:${email.toLowerCase()}`;
    await client.set(key, Date.now().toString(), "EX", Math.ceil(SEND_INTERVAL_MS / 1000) + 10);
  } catch {}
}

async function redisGetSendLimit(email: string): Promise<number | null> {
  if (!useRedis()) return null;
  try {
    const client = getRedis();
    const key = `email:limit:${email.toLowerCase()}`;
    const data = await client.get(key);
    if (data) {
      return parseInt(data);
    }
  } catch {}
  return null;
}

// ============ SMTP client ============

let transporter: nodemailer.Transporter | null = null;

function isSmtpConfigured(): boolean {
  return !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 465;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

/** Generate a 6-digit random verification code */
function generateCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/** Send verification code email */
async function sendCodeEmail(email: string, code: string): Promise<boolean> {
  try {
    const transport = getTransporter();
    const from = process.env.SMTP_FROM || `Nexusflow <${process.env.SMTP_USER}>`;

    await transport.sendMail({
      from,
      to: email,
      subject: `Your NexusFlow verification code: ${code}`,
      headers: {
        "X-AliDM-Mail-Settings": JSON.stringify({
          OpenTracking: { Enable: false },
          ClickTracking: { Enable: false },
        }),
      },
      html: `
        <div style="max-width:420px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#333;">
          <div style="padding:32px 24px;background:#f9fafb;border-radius:12px;border:1px solid #e5e7eb;">
            <h2 style="margin:0 0 16px;font-size:20px;color:#111;">NexusFlow verification code</h2>
            <p style="margin:0 0 20px;font-size:14px;color:#666;line-height:1.6;">
              You are signing in to NexusFlow. Your verification code is:
            </p>
            <div style="background:#111;color:#fff;font-size:28px;letter-spacing:8px;text-align:center;padding:16px;border-radius:8px;font-weight:700;">
              ${code}
            </div>
            <p style="margin:20px 0 0;font-size:12px;color:#999;line-height:1.6;">
              This code is valid for 5 minutes. Do not share it.<br/>
              If this wasn't you, please ignore this email.
            </p>
          </div>
        </div>
      `,
    });

    console.log(`[EMAIL] Verification code sent to ${email}`);
    return true;
  } catch (error: any) {
    console.error("[EMAIL] Send failed:", error.message);
    return false;
  }
}

// ============ Public API ============

/** Send email verification code */
export async function sendEmailCode(email: string): Promise<{ success: boolean; message: string }> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, message: "Invalid email format" };
  }

  const key = email.toLowerCase();

  // Send-rate limiting (Redis preferred)
  let lastSent: number | null = null;
  if (useRedis()) {
    lastSent = await redisGetSendLimit(key);
  } else {
    const memLastSent = memorySendLimitStore.get(key);
    lastSent = memLastSent !== undefined ? memLastSent : null;
  }

  if (lastSent && Date.now() - lastSent < SEND_INTERVAL_MS) {
    const remaining = Math.ceil((SEND_INTERVAL_MS - (Date.now() - lastSent)) / 1000);
    return { success: false, message: `Please retry in ${remaining} seconds` };
  }

  const code = generateCode();
  const isReal = isSmtpConfigured();

  if (!isReal && isProduction()) {
    console.error("[EMAIL] SMTP not configured; refusing to send code in production");
    return { success: false, message: "Verification service is unavailable, please retry later" };
  }

  if (isReal) {
    const sent = await sendCodeEmail(email, code);
    if (!sent) {
      return { success: false, message: "Failed to send email, please retry later" };
    }
  } else {
    console.log(`[EMAIL-TEST] email: ${email}, code: ${code} (test mode)`);
  }

  // Store the code (Redis preferred)
  if (useRedis()) {
    await redisSetCode(key, code);
    await redisSetSendLimit(key);
  } else {
    memoryCodeStore.set(key, {
      code,
      expiresAt: Date.now() + CODE_EXPIRY_MS,
      attempts: 0,
    });
    memorySendLimitStore.set(key, Date.now());
  }

  return {
    success: true,
    message: isReal ? "Verification code has been sent to your email" : "Verification code sent (test mode, see server logs)",
  };
}

/** Verify email verification code */
export async function verifyEmailCode(email: string, code: string): Promise<boolean> {
  const key = email.toLowerCase();

  // Prefer Redis
  if (useRedis()) {
    const stored = await redisGetCode(key);
    if (!stored) return false;

    const attempts = await redisIncrementAttempts(key);
    if (attempts > MAX_ATTEMPTS) {
      await redisDeleteCode(key);
      return false;
    }

    if (stored.code === code) {
      await redisDeleteCode(key);
      return true;
    }

    return false;
  }

  // Memory fallback
  const stored = memoryCodeStore.get(key);
  if (!stored) return false;

  if (Date.now() > stored.expiresAt) {
    memoryCodeStore.delete(key);
    return false;
  }

  if (stored.attempts >= MAX_ATTEMPTS) {
    memoryCodeStore.delete(key);
    return false;
  }

  stored.attempts++;

  if (stored.code === code) {
    memoryCodeStore.delete(key);
    return true;
  }

  return false;
}

// Periodic memory cleanup (only when Redis is unavailable)
if (!useRedis()) {
  setInterval(() => {
    const now = Date.now();
    for (const [key, data] of memoryCodeStore) {
      if (now > data.expiresAt) memoryCodeStore.delete(key);
    }
    for (const [key, time] of memorySendLimitStore) {
      if (now - time > SEND_INTERVAL_MS * 2) memorySendLimitStore.delete(key);
    }
  }, 60 * 1000);
}
