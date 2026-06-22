/**
 * SMS Verification Code Service — Alibaba Cloud SMS SDK
 * 
 * ====== Environment Variable Configuration (.env) ======
 * 
 * SMS_ACCESS_KEY_ID=Your Alibaba Cloud AccessKey ID
 * SMS_ACCESS_KEY_SECRET=Your Alibaba Cloud AccessKey Secret
 * SMS_SIGN_NAME=Your SMS signature (e.g. nexusflow)
 * SMS_TEMPLATE_CODE=Your SMS template Code (e.g. SMS_123456789)
 * 
 * ====== Alibaba Cloud Setup Process ======
 * 
 * 1. Log in to Alibaba Cloud Console → SMS Service https://dysms.console.aliyun.com/
 * 2. Create SMS signature (requires review, typically 1 business day)
 * 3. Create SMS template, content example:
 *      Your verification code is: ${code}, valid for 5 minutes, do not share with others.
 *    Template variable name must be code
 * 4. Obtain AccessKey: https://ram.console.aliyun.com/manage/ak
 *    Recommend using a RAM sub-account with only AliyunDysmsFullAccess permission
 * 5. Fill in the above information in the .env file
 * 
 * ====== Behavior When Not Configured ======
 * 
 * When environment variables are not set, the service automatically enters test mode:
 *   - Verification codes are printed to the console
 *   - Fixed code 8888 is always accepted
 */

import Dysmsapi20170525, * as $Dysmsapi20170525 from "@alicloud/dysmsapi20170525";
import * as $OpenApi from "@alicloud/openapi-client";
import crypto from "crypto";

// ============ Verification Code Storage ============

interface CodeEntry {
  code: string;
  expiresAt: number;
  attempts: number;
}

const codeStore = new Map<string, CodeEntry>();
const sendLimitStore = new Map<string, number>();

const CODE_EXPIRY_MS = 5 * 60 * 1000;  // 5 minutes
const SEND_INTERVAL_MS = 60 * 1000;    // 60 seconds send interval
const MAX_ATTEMPTS = 5;                  // Maximum verification attempts

// ============ Alibaba Cloud SMS Client ============

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

/** Generate 6-digit random verification code */
function generateCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Send SMS via Alibaba Cloud SDK
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
      console.log(`[SMS] Verification code sent to ${phone.slice(0, 3)}****${phone.slice(-4)}`);
      return true;
    }

    console.error(`[SMS] Send failed: ${body.code} - ${body.message}`);
    return false;
  } catch (error: any) {
    console.error("[SMS] Send exception:", error.message);
    if (error.data?.Recommend) {
      console.log("[SMS] Diagnostic suggestion:", error.data.Recommend);
    }
    return false;
  }
}

// ============ Public Interface ============

/**
 * Send verification code
 */
export async function sendVerificationCode(phone: string): Promise<{ success: boolean; message: string }> {
  if (!/^1\d{10}$/.test(phone)) {
    return { success: false, message: "Invalid phone number format" };
  }

  // Send rate limit
  const lastSent = sendLimitStore.get(phone);
  if (lastSent && Date.now() - lastSent < SEND_INTERVAL_MS) {
    const remaining = Math.ceil((SEND_INTERVAL_MS - (Date.now() - lastSent)) / 1000);
    return { success: false, message: `Please retry in ${remaining} seconds` };
  }

  const code = generateCode();
  const isReal = isSmsConfigured();

  if (isReal) {
    const sent = await sendAliyunSms(phone, code);
    if (!sent) {
      return { success: false, message: "SMS sending failed, please try again later" };
    }
  } else {
    console.log(`[SMS-TEST] Phone: ${phone}, Code: ${code} (test mode, also accept 8888)`);
  }

  codeStore.set(phone, {
    code,
    expiresAt: Date.now() + CODE_EXPIRY_MS,
    attempts: 0,
  });
  sendLimitStore.set(phone, Date.now());

  return {
    success: true,
    message: isReal ? "Verification code sent" : `Verification code sent (test mode, code: ${code}, also accept 8888)`,
  };
}

/**
 * Verify verification code
 */
export function verifyCode(phone: string, code: string): boolean {
  // Test mode fallback
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

// Periodic cleanup of expired data
setInterval(() => {
  const now = Date.now();
  for (const [phone, data] of codeStore) {
    if (now > data.expiresAt) codeStore.delete(phone);
  }
  for (const [phone, time] of sendLimitStore) {
    if (now - time > SEND_INTERVAL_MS * 2) sendLimitStore.delete(phone);
  }
}, 60 * 1000);
