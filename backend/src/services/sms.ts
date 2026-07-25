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
 * 非生产环境未设置变量时进入测试模式，并将随机验证码输出到控制台。
 * 生产环境未配置短信或 Redis 时一律拒绝发送和验证。
 */

import Dysmsapi20170525, * as $Dysmsapi20170525 from "@alicloud/dysmsapi20170525";
import * as $OpenApi from "@alicloud/openapi-client";
import crypto from "crypto";
import {
  cancelVerificationCode,
  reserveVerificationCode,
  type ReserveVerificationCodeResult,
  VerificationStoreUnavailableError,
  verifyVerificationCode,
} from "./verification-code-store";

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

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
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

  const isReal = isSmsConfigured();

  if (!isReal && isProduction()) {
    console.error("[SMS] 短信未配置，生产环境拒绝发送验证码");
    return { success: false, message: "验证码服务暂不可用，请稍后重试" };
  }

  const code = generateCode();
  let reserved: ReserveVerificationCodeResult;

  try {
    reserved = await reserveVerificationCode("sms", phone, code);
  } catch (error) {
    if (error instanceof VerificationStoreUnavailableError) {
      console.error("[SMS] 验证码存储不可用，拒绝发送");
    } else {
      console.error("[SMS] 验证码预占失败");
    }
    return { success: false, message: "验证码服务暂不可用，请稍后重试" };
  }

  if (!reserved.reserved) {
    return {
      success: false,
      message: `请${reserved.retryAfterSeconds}秒后重试`,
    };
  }

  if (isReal) {
    const sent = await sendAliyunSms(phone, code);
    if (!sent) {
      try {
        await cancelVerificationCode(reserved.reservation);
      } catch {
        console.error("[SMS] 短信发送失败后，验证码 challenge 清理失败");
      }
      return { success: false, message: "短信发送失败，请稍后重试" };
    }
  } else {
    console.log(`[SMS-TEST] 手机号: ${phone}, 验证码: ${code} (测试模式)`);
  }

  return {
    success: true,
    message: isReal ? "验证码已发送" : "验证码已发送（测试模式，请查看服务器日志）",
  };
}

/**
 * 验证验证码
 */
export async function verifyCode(phone: string, code: string): Promise<boolean> {
  try {
    return await verifyVerificationCode("sms", phone, code);
  } catch {
    console.error("[SMS] 验证码存储不可用，拒绝验证");
    return false;
  }
}
