/**
 * 短信验证码服务 —— 阿里云短信 SDK
 * 
 * ====== 环境变量配置（.env） ======
 * 
 * SMS_ACCESS_KEY_ID=你的阿里云 AccessKey ID
 * SMS_ACCESS_KEY_SECRET=你的阿里云 AccessKey Secret
 * SMS_SIGN_NAME=你的短信签名（如：nexusflow）
 * SMS_TEMPLATE_CODE=你的短信模板 Code（如：SMS_123456789）
 * 
 * ====== 阿里云开通流程 ======
 * 
 * 1. 登录阿里云控制台 → 短信服务 https://dysms.console.aliyun.com/
 * 2. 创建短信签名（需审核，一般1个工作日）
 * 3. 创建短信模板，内容示例：
 *      您的验证码为：${code}，5分钟内有效，请勿泄露。
 *    模板变量名必须为 code
 * 4. 获取 AccessKey：https://ram.console.aliyun.com/manage/ak
 *    建议使用 RAM 子账号，仅授予 AliyunDysmsFullAccess 权限
 * 5. 将上述信息填入 .env 文件
 * 
 * ====== 未配置时的行为 ======
 * 
 * 未设置环境变量时自动进入测试模式：
 *   - 控制台打印验证码
 *   - 固定码 8888 始终可用
 */

import Dysmsapi20170525, * as $Dysmsapi20170525 from "@alicloud/dysmsapi20170525";
import * as $OpenApi from "@alicloud/openapi-client";
import crypto from "crypto";

// ============ 验证码存储 ============

interface CodeEntry {
  code: string;
  expiresAt: number;
  attempts: number;
}

const codeStore = new Map<string, CodeEntry>();
const sendLimitStore = new Map<string, number>();

const CODE_EXPIRY_MS = 5 * 60 * 1000;  // 5 分钟
const SEND_INTERVAL_MS = 60 * 1000;    // 60 秒发送间隔
const MAX_ATTEMPTS = 5;                  // 最大验证尝试次数

// ============ 阿里云 SMS 客户端 ============

let smsClient: Dysmsapi20170525 | null = null;

function isSmsConfigured(): boolean {
  return !!(
    process.env.SMS_ACCESS_KEY_ID &&
    process.env.SMS_ACCESS_KEY_SECRET &&
    process.env.SMS_SIGN_NAME &&
    process.env.SMS_TEMPLATE_CODE
  );
}

function getSmsClient(): Dysmsapi20170525 {
  if (!smsClient) {
    const config = new $OpenApi.Config({
      accessKeyId: process.env.SMS_ACCESS_KEY_ID,
      accessKeySecret: process.env.SMS_ACCESS_KEY_SECRET,
      endpoint: "dysmsapi.aliyuncs.com",
    });
    smsClient = new Dysmsapi20170525(config);
  }
  return smsClient;
}

/** 生成 6 位随机验证码 */
function generateCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * 通过阿里云 SDK 发送短信
 */
async function sendAliyunSms(phone: string, code: string): Promise<boolean> {
  try {
    const client = getSmsClient();
    const request = new $Dysmsapi20170525.SendSmsRequest({
      phoneNumbers: phone,
      signName: process.env.SMS_SIGN_NAME!,
      templateCode: process.env.SMS_TEMPLATE_CODE!,
      templateParam: JSON.stringify({ code }),
    });

    const response = await client.sendSms(request);
    const body = response.body!;

    if (body.code === "OK") {
      console.log(`[SMS] 验证码已发送至 ${phone.slice(0, 3)}****${phone.slice(-4)}`);
      return true;
    }

    console.error(`[SMS] 发送失败: ${body.code} - ${body.message}`);
    return false;
  } catch (error: any) {
    console.error("[SMS] 发送异常:", error.message);
    if (error.data?.Recommend) {
      console.log("[SMS] 诊断建议:", error.data.Recommend);
    }
    return false;
  }
}

// ============ 对外接口 ============

/**
 * 发送验证码
 */
export async function sendVerificationCode(phone: string): Promise<{ success: boolean; message: string }> {
  if (!/^1\d{10}$/.test(phone)) {
    return { success: false, message: "手机号格式不正确" };
  }

  // 发送频率限制
  const lastSent = sendLimitStore.get(phone);
  if (lastSent && Date.now() - lastSent < SEND_INTERVAL_MS) {
    const remaining = Math.ceil((SEND_INTERVAL_MS - (Date.now() - lastSent)) / 1000);
    return { success: false, message: `请${remaining}秒后重试` };
  }

  const code = generateCode();
  const isReal = isSmsConfigured();

  if (isReal) {
    const sent = await sendAliyunSms(phone, code);
    if (!sent) {
      return { success: false, message: "短信发送失败，请稍后重试" };
    }
  } else {
    console.log(`[SMS-TEST] 手机号: ${phone}, 验证码: ${code} (测试模式，也可用 8888)`);
  }

  codeStore.set(phone, {
    code,
    expiresAt: Date.now() + CODE_EXPIRY_MS,
    attempts: 0,
  });
  sendLimitStore.set(phone, Date.now());

  return {
    success: true,
    message: isReal ? "验证码已发送" : `验证码已发送（测试模式，验证码: ${code}，也可用 8888）`,
  };
}

/**
 * 验证验证码
 */
export function verifyCode(phone: string, code: string): boolean {
  // 测试模式兜底
  if (!isSmsConfigured() && code === "8888") {
    return true;
  }

  const stored = codeStore.get(phone);
  if (!stored) return false;

  if (Date.now() > stored.expiresAt) {
    codeStore.delete(phone);
    return false;
  }

  if (stored.attempts >= MAX_ATTEMPTS) {
    codeStore.delete(phone);
    return false;
  }

  stored.attempts++;

  if (stored.code === code) {
    codeStore.delete(phone);
    return true;
  }

  return false;
}

// 定期清理过期数据
setInterval(() => {
  const now = Date.now();
  for (const [phone, data] of codeStore) {
    if (now > data.expiresAt) codeStore.delete(phone);
  }
  for (const [phone, time] of sendLimitStore) {
    if (now - time > SEND_INTERVAL_MS * 2) sendLimitStore.delete(phone);
  }
}, 60 * 1000);
