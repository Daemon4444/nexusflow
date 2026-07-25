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
 * 生产环境强制使用 Redis。发送频率预占和验证码写入是原子的，
 * 验证码校验也在 Redis Lua 脚本内原子完成。
 *
 * ====== 未配置 SMTP 时的行为 ======
 *
 * 未设置 SMTP 环境变量时自动进入测试模式：
 *   - 控制台打印验证码
 */

import nodemailer from "nodemailer";
import crypto from "crypto";
import {
  cancelVerificationCode,
  reserveVerificationCode,
  type ReserveVerificationCodeResult,
  VerificationStoreUnavailableError,
  verifyVerificationCode,
} from "./verification-code-store";

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

export type SendEmailCodeResult =
  | {
      success: true;
      message: string;
    }
  | {
      success: false;
      message: string;
      status: 400 | 429 | 502 | 503;
    };

/** 发送邮箱验证码 */
export async function sendEmailCode(email: string): Promise<SendEmailCodeResult> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, message: "邮箱格式不正确", status: 400 };
  }

  const key = email.toLowerCase();
  const isReal = isSmtpConfigured();

  if (!isReal && isProduction()) {
    console.error("[EMAIL] SMTP 未配置，生产环境拒绝发送验证码");
    return {
      success: false,
      message: "验证码服务暂不可用，请稍后重试",
      status: 503,
    };
  }

  const code = generateCode();
  let reserved: ReserveVerificationCodeResult;

  try {
    reserved = await reserveVerificationCode("email", key, code);
  } catch (error) {
    if (error instanceof VerificationStoreUnavailableError) {
      console.error("[EMAIL] 验证码存储不可用，拒绝发送");
    } else {
      console.error("[EMAIL] 验证码预占失败");
    }
    return {
      success: false,
      message: "验证码服务暂不可用，请稍后重试",
      status: 503,
    };
  }

  if (!reserved.reserved) {
    return {
      success: false,
      message: `请${reserved.retryAfterSeconds}秒后重试`,
      status: 429,
    };
  }

  if (isReal) {
    const sent = await sendCodeEmail(email, code);
    if (!sent) {
      try {
        await cancelVerificationCode(reserved.reservation);
      } catch {
        console.error("[EMAIL] 邮件发送失败后，验证码 challenge 清理失败");
      }
      return {
        success: false,
        message: "邮件发送失败，请稍后重试",
        status: 502,
      };
    }
  } else {
    console.log(`[EMAIL-TEST] 邮箱: ${email}, 验证码: ${code} (测试模式)`);
  }

  return {
    success: true,
    message: isReal ? "验证码已发送到您的邮箱" : "验证码已发送（测试模式，请查看服务器日志）",
  };
}

/** 验证邮箱验证码 */
export async function verifyEmailCode(email: string, code: string): Promise<boolean> {
  try {
    return await verifyVerificationCode("email", email, code);
  } catch {
    console.error("[EMAIL] 验证码存储不可用，拒绝验证");
    return false;
  }
}
