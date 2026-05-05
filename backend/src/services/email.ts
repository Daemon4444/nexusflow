/**
 * 邮箱验证码服务 —— Nodemailer SMTP + Redis 存储
 *
 * ====== 环境变量配置（.env） ======
 *
 * SMTP_HOST=smtp.qq.com          # SMTP 服务器
 * SMTP_PORT=465                   # 端口（SSL: 465）
 * SMTP_USER=your@qq.com          # 发件邮箱
 * SMTP_PASS=abcdefghijklmnop     # 授权码
 * SMTP_FROM=Nexusflow <your@qq.com>  # 发件人显示名
 *
 * ====== Redis 存储 ======
 *
 * 验证码优先存储在 Redis（支持分布式），Redis 不可用时降级到内存
 *
 * ====== 未配置 SMTP 时的行为 ======
 *
 * 未设置 SMTP 环境变量时自动进入测试模式：
 *   - 控制台打印验证码
 */

import nodemailer from "nodemailer";
import crypto from "crypto";
import { getRedis } from "./redis";

// ============ 配置 ============

const CODE_EXPIRY_SEC = 300;           // 5 分钟（秒）
const CODE_EXPIRY_MS = 5 * 60 * 1000;  // 5 分钟（毫秒）
const SEND_INTERVAL_MS = 60 * 1000;    // 60 秒发送间隔
const MAX_ATTEMPTS = 5;                 // 最大验证尝试次数

// ============ 内存存储（Redis 不可用时的 fallback） ============

interface CodeEntry {
  code: string;
  expiresAt: number;
  attempts: number;
}

const memoryCodeStore = new Map<string, CodeEntry>();
const memorySendLimitStore = new Map<string, number>();

// ============ Redis 检测 ============

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
    console.warn("[EMAIL] Redis 存储失败，降级到内存");
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
    console.warn("[EMAIL] Redis 读取失败，降级到内存");
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

// ============ SMTP 客户端 ============

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

/** 生成 6 位随机验证码 */
function generateCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/** 发送验证码邮件 */
async function sendCodeEmail(email: string, code: string): Promise<boolean> {
  try {
    const transport = getTransporter();
    const from = process.env.SMTP_FROM || `Nexusflow <${process.env.SMTP_USER}>`;

    await transport.sendMail({
      from,
      to: email,
      subject: `Nexusflow 验证码: ${code}`,
      headers: {
        "X-AliDM-Mail-Settings": JSON.stringify({
          OpenTracking: { Enable: false },
          ClickTracking: { Enable: false },
        }),
      },
      html: `
        <div style="max-width:420px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#333;">
          <div style="padding:32px 24px;background:#f9fafb;border-radius:12px;border:1px solid #e5e7eb;">
            <h2 style="margin:0 0 16px;font-size:20px;color:#111;">Nexusflow 验证码</h2>
            <p style="margin:0 0 20px;font-size:14px;color:#666;line-height:1.6;">
              您正在登录 Nexusflow，验证码如下：
            </p>
            <div style="background:#111;color:#fff;font-size:28px;letter-spacing:8px;text-align:center;padding:16px;border-radius:8px;font-weight:700;">
              ${code}
            </div>
            <p style="margin:20px 0 0;font-size:12px;color:#999;line-height:1.6;">
              验证码 5 分钟内有效，请勿泄露给他人。<br/>
              如非本人操作，请忽略此邮件。
            </p>
          </div>
        </div>
      `,
    });

    console.log(`[EMAIL] 验证码已发送至 ${email}`);
    return true;
  } catch (error: any) {
    console.error("[EMAIL] 发送失败:", error.message);
    return false;
  }
}

// ============ 对外接口 ============

/** 发送邮箱验证码 */
export async function sendEmailCode(email: string): Promise<{ success: boolean; message: string }> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, message: "邮箱格式不正确" };
  }

  const key = email.toLowerCase();

  // 发送频率限制（优先 Redis）
  let lastSent: number | null = null;
  if (useRedis()) {
    lastSent = await redisGetSendLimit(key);
  } else {
    const memLastSent = memorySendLimitStore.get(key);
    lastSent = memLastSent !== undefined ? memLastSent : null;
  }

  if (lastSent && Date.now() - lastSent < SEND_INTERVAL_MS) {
    const remaining = Math.ceil((SEND_INTERVAL_MS - (Date.now() - lastSent)) / 1000);
    return { success: false, message: `请${remaining}秒后重试` };
  }

  const code = generateCode();
  const isReal = isSmtpConfigured();

  if (!isReal && isProduction()) {
    console.error("[EMAIL] SMTP 未配置，生产环境拒绝发送验证码");
    return { success: false, message: "验证码服务暂不可用，请稍后重试" };
  }

  if (isReal) {
    const sent = await sendCodeEmail(email, code);
    if (!sent) {
      return { success: false, message: "邮件发送失败，请稍后重试" };
    }
  } else {
    console.log(`[EMAIL-TEST] 邮箱: ${email}, 验证码: ${code} (测试模式)`);
  }

  // 存储验证码（优先 Redis）
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
    message: isReal ? "验证码已发送到您的邮箱" : "验证码已发送（测试模式，请查看服务器日志）",
  };
}

/** 验证邮箱验证码 */
export async function verifyEmailCode(email: string, code: string): Promise<boolean> {
  const key = email.toLowerCase();

  // 优先从 Redis 获取
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

  // 内存 fallback
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

// 内存定期清理（仅当 Redis 不可用时）
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
