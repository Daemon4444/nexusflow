/**
 * Shared verification-code store for every application node.
 *
 * Production always uses Redis and fails closed when Redis is missing or
 * unavailable. A process-local implementation is kept only for development
 * and tests that intentionally run without Redis.
 */

import crypto from "crypto";
import { getRedis } from "./redis";

export const VERIFICATION_CODE_TTL_SECONDS = 300;
export const VERIFICATION_SEND_INTERVAL_SECONDS = 60;
export const VERIFICATION_SOURCE_MAX_ATTEMPTS = 3;
export const VERIFICATION_CHALLENGE_MAX_ATTEMPTS = 10;
export const VERIFICATION_RECIPIENT_MAX_ATTEMPTS = 10;

export type VerificationChannel = "email" | "sms";

export interface VerificationReservation {
  channel: VerificationChannel;
  identifier: string;
  token: string;
}

export type ReserveVerificationCodeResult =
  | {
      reserved: true;
      reservation: VerificationReservation;
    }
  | {
      reserved: false;
      retryAfterSeconds: number;
    };

interface MemoryCode {
  code: string;
  expiresAt: number;
  reservationToken: string;
}

interface MemorySendLock {
  token: string;
  expiresAt: number;
}

const memoryCodes = new Map<string, MemoryCode>();
const memorySendLocks = new Map<string, MemorySendLock>();
const memorySendBudgets = new Map<string, number[]>();
const memoryVerifyBudgets = new Map<string, { count: number; expiresAt: number }>();

const RESERVE_CODE_LUA = `
  local lockResult = redis.call(
    "SET",
    KEYS[1],
    ARGV[1],
    "NX",
    "EX",
    tonumber(ARGV[2])
  )

  if not lockResult then
    local retryAfter = redis.call("TTL", KEYS[1])
    if retryAfter < 1 then
      retryAfter = tonumber(ARGV[2])
    end
    return {0, retryAfter}
  end

  if ARGV[10] == "1" then
    local windowStart = tonumber(ARGV[5]) - tonumber(ARGV[7]) * 1000
    redis.call("ZREMRANGEBYSCORE", KEYS[3], 0, windowStart)
    redis.call("ZREMRANGEBYSCORE", KEYS[4], 0, windowStart)
    if redis.call("ZCARD", KEYS[3]) >= tonumber(ARGV[8])
      or redis.call("ZCARD", KEYS[4]) >= tonumber(ARGV[9]) then
      redis.call("DEL", KEYS[1])
      return {0, tonumber(ARGV[7])}
    end
    redis.call("ZADD", KEYS[3], tonumber(ARGV[5]), ARGV[6])
    redis.call("ZADD", KEYS[4], tonumber(ARGV[5]), ARGV[6])
    redis.call("EXPIRE", KEYS[3], tonumber(ARGV[7]) + 1)
    redis.call("EXPIRE", KEYS[4], tonumber(ARGV[7]) + 1)
  end

  redis.call(
    "HSET",
    KEYS[2],
    "code",
    ARGV[3],
    "reservationToken",
    ARGV[1]
  )
  redis.call("EXPIRE", KEYS[2], tonumber(ARGV[4]))

  return {1, tonumber(ARGV[2])}
`;

const VERIFY_CODE_LUA = `
  local storedCode = redis.call("HGET", KEYS[1], "code")
  if not storedCode then
    return {0, 0}
  end

  -- A holder of both bearer factors (challenge token + delivered code) must
  -- always be able to consume the challenge. Anonymous error budgets exist to
  -- bound guessing; letting them run before the comparison turns the global
  -- bucket into a low-rate login denial-of-service primitive.
  if storedCode == ARGV[1] then
    redis.call("DEL", KEYS[1])
    return {1, 0}
  end

  for i = 2, 6 do
    local keyType = redis.call("TYPE", KEYS[i])["ok"]
    if keyType ~= "none" and keyType ~= "string" then
      return redis.error_reply("invalid verification attempt counter")
    end
    local current = tonumber(redis.call("GET", KEYS[i]) or "0")
    if current == nil then
      return redis.error_reply("invalid verification attempt value")
    end
    if current >= tonumber(ARGV[i]) then
      return {0, 1}
    end
  end

  local sourceAttempts = redis.call("INCR", KEYS[2])
  local challengeAttempts = redis.call("INCR", KEYS[3])
  local recipientAttempts = redis.call("INCR", KEYS[4])
  local ipAttempts = redis.call("INCR", KEYS[5])
  local globalAttempts = redis.call("INCR", KEYS[6])
  if sourceAttempts == 1 then redis.call("EXPIRE", KEYS[2], tonumber(ARGV[7])) end
  if challengeAttempts == 1 then redis.call("EXPIRE", KEYS[3], tonumber(ARGV[7])) end
  if recipientAttempts == 1 then redis.call("EXPIRE", KEYS[4], tonumber(ARGV[7])) end
  if ipAttempts == 1 then redis.call("EXPIRE", KEYS[5], tonumber(ARGV[7])) end
  if globalAttempts == 1 then redis.call("EXPIRE", KEYS[6], tonumber(ARGV[7])) end

  if challengeAttempts >= tonumber(ARGV[3]) then
    redis.call("DEL", KEYS[1])
  end

  return {0, 0}
`;

const CANCEL_RESERVATION_LUA = `
  if redis.call("HGET", KEYS[1], "reservationToken") == ARGV[1] then
    redis.call("DEL", KEYS[1])
    return 1
  end

  return 0
`;

export class VerificationStoreUnavailableError extends Error {
  constructor() {
    super("Verification code store is unavailable");
    this.name = "VerificationStoreUnavailableError";
  }
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function hasRedisConfiguration(): boolean {
  return Boolean(process.env.REDIS_HOST?.trim());
}

function normalizeIdentifier(
  channel: VerificationChannel,
  identifier: string
): string {
  const trimmed = identifier.trim();
  return channel === "email" ? trimmed.toLowerCase() : trimmed;
}

function subjectDigest(
  channel: VerificationChannel,
  identifier: string
): string {
  return crypto
    .createHash("sha256")
    .update(`${channel}:${normalizeIdentifier(channel, identifier)}`)
    .digest("hex");
}

function keysFor(
  channel: VerificationChannel,
  identifier: string
): { lockKey: string; prefix: string; memoryKey: string } {
  const digest = subjectDigest(channel, identifier);
  // The hash tag keeps both keys in one Redis Cluster slot.
  const prefix = `nexusflow:verification:{${digest}}`;
  return {
    lockKey: `${prefix}:send-lock`,
    prefix,
    memoryKey: `${channel}:${digest}`,
  };
}

function challengeDigest(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function challengeKeys(
  channel: VerificationChannel,
  identifier: string,
  token: string,
  sourceIp = "unknown"
): {
  codeKey: string;
  sourceAttemptsKey: string;
  challengeAttemptsKey: string;
  recipientAttemptsKey: string;
  ipAttemptsKey: string;
  globalAttemptsKey: string;
  memoryCodeKey: string;
} {
  const { prefix, memoryKey } = keysFor(channel, identifier);
  const tokenHash = challengeDigest(token);
  const ipHash = challengeDigest(sourceIp);
  return {
    codeKey: `${prefix}:code:${tokenHash}`,
    sourceAttemptsKey: `${prefix}:attempts:${tokenHash}:source:${ipHash}`,
    challengeAttemptsKey: `${prefix}:attempts:${tokenHash}:challenge`,
    recipientAttemptsKey: `${prefix}:attempts:recipient`,
    ipAttemptsKey: `nexusflow:verification:verify-ip:${ipHash}`,
    globalAttemptsKey: "nexusflow:verification:verify-global",
    memoryCodeKey: `${memoryKey}:${tokenHash}`,
  };
}

function unavailable(cause: unknown): VerificationStoreUnavailableError {
  const error = new VerificationStoreUnavailableError();
  if (cause instanceof Error) {
    (error as Error & { cause?: Error }).cause = cause;
  }
  return error;
}

function useMemoryStore(): boolean {
  if (hasRedisConfiguration()) return false;
  if (isProduction()) throw unavailable(new Error("REDIS_HOST is not configured"));
  return true;
}

function reserveInMemory(
  channel: VerificationChannel,
  identifier: string,
  code: string,
  token: string,
  sourceIp?: string
): ReserveVerificationCodeResult {
  const { memoryKey } = keysFor(channel, identifier);
  const now = Date.now();
  const currentLock = memorySendLocks.get(memoryKey);

  if (currentLock && currentLock.expiresAt > now) {
    return {
      reserved: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((currentLock.expiresAt - now) / 1000)
      ),
    };
  }

  if (sourceIp) {
    const windowMs = 60_000;
    const ipKey = `email-ip:${sourceIp}`;
    const globalKey = "email-global";
    const ipEvents = (memorySendBudgets.get(ipKey) || [])
      .filter((timestamp) => timestamp > now - windowMs);
    const globalEvents = (memorySendBudgets.get(globalKey) || [])
      .filter((timestamp) => timestamp > now - windowMs);
    const ipLimit = Number(process.env.VERIFICATION_EMAIL_IP_PER_MINUTE || 5);
    const globalLimit = Number(process.env.VERIFICATION_EMAIL_GLOBAL_PER_MINUTE || 200);
    if (ipEvents.length >= ipLimit || globalEvents.length >= globalLimit) {
      return { reserved: false, retryAfterSeconds: 60 };
    }
    ipEvents.push(now);
    globalEvents.push(now);
    memorySendBudgets.set(ipKey, ipEvents);
    memorySendBudgets.set(globalKey, globalEvents);
  }

  memorySendLocks.set(memoryKey, {
    token,
    expiresAt: now + VERIFICATION_SEND_INTERVAL_SECONDS * 1000,
  });
  const { memoryCodeKey } = challengeKeys(
    channel,
    identifier,
    token,
    sourceIp
  );
  memoryCodes.set(memoryCodeKey, {
    code,
    expiresAt: now + VERIFICATION_CODE_TTL_SECONDS * 1000,
    reservationToken: token,
  });

  return {
    reserved: true,
    reservation: {
      channel,
      identifier: normalizeIdentifier(channel, identifier),
      token,
    },
  };
}

/**
 * Atomically reserves the per-recipient send interval and stores a fresh code.
 * The Redis script uses SET NX, so concurrent workers cannot both send.
 */
export async function reserveVerificationCode(
  channel: VerificationChannel,
  identifier: string,
  code: string,
  options: { sourceIp?: string } = {}
): Promise<ReserveVerificationCodeResult> {
  const normalizedIdentifier = normalizeIdentifier(channel, identifier);
  const token = crypto.randomBytes(24).toString("hex");

  if (useMemoryStore()) {
    return reserveInMemory(
      channel,
      normalizedIdentifier,
      code,
      token,
      options.sourceIp
    );
  }

  const { lockKey } = keysFor(channel, normalizedIdentifier);
  const { codeKey } = challengeKeys(
    channel,
    normalizedIdentifier,
    token,
    options.sourceIp
  );
  const sourceDigest = subjectDigest("email", options.sourceIp || "none");
  const ipBudgetKey = `nexusflow:verification:email-ip:${sourceDigest}`;
  const globalBudgetKey = "nexusflow:verification:email-global";
  const now = Date.now();

  try {
    const result = (await getRedis().eval(
      RESERVE_CODE_LUA,
      4,
      lockKey,
      codeKey,
      ipBudgetKey,
      globalBudgetKey,
      token,
      VERIFICATION_SEND_INTERVAL_SECONDS,
      code,
      VERIFICATION_CODE_TTL_SECONDS,
      now,
      `${now}:${token}`,
      60,
      Number(process.env.VERIFICATION_EMAIL_IP_PER_MINUTE || 5),
      Number(process.env.VERIFICATION_EMAIL_GLOBAL_PER_MINUTE || 200),
      options.sourceIp ? "1" : "0"
    )) as [number, number];

    if (Number(result[0]) !== 1) {
      return {
        reserved: false,
        retryAfterSeconds: Math.max(1, Number(result[1]) || 1),
      };
    }

    return {
      reserved: true,
      reservation: {
        channel,
        identifier: normalizedIdentifier,
        token,
      },
    };
  } catch (error) {
    throw unavailable(error);
  }
}

/**
 * Deletes only the matching challenge after delivery fails. The 60-second
 * send lock intentionally remains in place so an upstream outage cannot be
 * turned into a high-frequency retry or cost-amplification attack.
 */
export async function cancelVerificationCode(
  reservation: VerificationReservation
): Promise<void> {
  if (useMemoryStore()) {
    const { memoryCodeKey } = challengeKeys(
      reservation.channel,
      reservation.identifier,
      reservation.token
    );
    const code = memoryCodes.get(memoryCodeKey);

    if (code?.reservationToken === reservation.token) {
      memoryCodes.delete(memoryCodeKey);
    }
    return;
  }

  const { codeKey } = challengeKeys(
    reservation.channel,
    reservation.identifier,
    reservation.token
  );

  try {
    await getRedis().eval(
      CANCEL_RESERVATION_LUA,
      1,
      codeKey,
      reservation.token
    );
  } catch (error) {
    throw unavailable(error);
  }
}

function verifyInMemory(
  channel: VerificationChannel,
  identifier: string,
  submittedCode: string,
  challengeToken: string,
  sourceIp: string
): VerificationCodeResult {
  const keys = challengeKeys(
    channel,
    identifier,
    challengeToken,
    sourceIp
  );
  const stored = memoryCodes.get(keys.memoryCodeKey);

  if (!stored || stored.expiresAt <= Date.now()) {
    memoryCodes.delete(keys.memoryCodeKey);
    return "invalid";
  }

  const now = Date.now();
  const matches =
    stored.code.length === submittedCode.length &&
    crypto.timingSafeEqual(
      Buffer.from(stored.code),
      Buffer.from(submittedCode)
    );
  if (matches) {
    memoryCodes.delete(keys.memoryCodeKey);
    return "valid";
  }

  const config = verificationAttemptLimits();
  const dimensions = [
    [keys.sourceAttemptsKey, config.source],
    [keys.challengeAttemptsKey, config.challenge],
    [keys.recipientAttemptsKey, config.recipient],
    [keys.ipAttemptsKey, config.ip],
    [keys.globalAttemptsKey, config.global],
  ] as const;
  for (const [key, limit] of dimensions) {
    const current = memoryVerifyBudgets.get(key);
    const count = current && current.expiresAt > now ? current.count : 0;
    if (count >= limit) return "rate_limited";
  }
  for (const [key] of dimensions) {
    const current = memoryVerifyBudgets.get(key);
    memoryVerifyBudgets.set(key, {
      count: current && current.expiresAt > now ? current.count + 1 : 1,
      expiresAt: now + config.windowSeconds * 1000,
    });
  }

  const challengeAttempts = memoryVerifyBudgets.get(keys.challengeAttemptsKey)?.count || 0;
  if (challengeAttempts >= config.challenge) {
    memoryCodes.delete(keys.memoryCodeKey);
  }
  return "invalid";
}

export type VerificationCodeResult = "valid" | "invalid" | "rate_limited";

function positiveLimit(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function verificationAttemptLimits() {
  return {
    source: positiveLimit(
      "VERIFICATION_LOGIN_SOURCE_MAX_ATTEMPTS",
      VERIFICATION_SOURCE_MAX_ATTEMPTS
    ),
    challenge: positiveLimit(
      "VERIFICATION_LOGIN_CHALLENGE_MAX_ATTEMPTS",
      VERIFICATION_CHALLENGE_MAX_ATTEMPTS
    ),
    recipient: positiveLimit(
      "VERIFICATION_LOGIN_RECIPIENT_MAX_ATTEMPTS",
      VERIFICATION_RECIPIENT_MAX_ATTEMPTS
    ),
    ip: positiveLimit("VERIFICATION_LOGIN_IP_MAX_ATTEMPTS", 20),
    global: positiveLimit("VERIFICATION_LOGIN_GLOBAL_MAX_ATTEMPTS", 1000),
    windowSeconds: positiveLimit(
      "VERIFICATION_LOGIN_ATTEMPT_WINDOW_SECONDS",
      VERIFICATION_CODE_TTL_SECONDS
    ),
  };
}

/**
 * Atomically checks one high-entropy challenge. Random or missing challenge
 * tokens never mutate a recipient's real code. Wrong attempts are bounded by
 * challenge, recipient, source, IP and global budgets. The correct code can
 * consume its challenge even when anonymous-error budgets are exhausted.
 */
export async function verifyVerificationCode(
  channel: VerificationChannel,
  identifier: string,
  submittedCode: string,
  options: { challengeToken: string; sourceIp?: string }
): Promise<VerificationCodeResult> {
  const normalizedIdentifier = normalizeIdentifier(channel, identifier);
  if (!/^[a-f0-9]{48}$/i.test(options.challengeToken)) return "invalid";

  if (useMemoryStore()) {
    return verifyInMemory(
      channel,
      normalizedIdentifier,
      submittedCode,
      options.challengeToken,
      options.sourceIp || "unknown"
    );
  }

  const keys = challengeKeys(
    channel,
    normalizedIdentifier,
    options.challengeToken,
    options.sourceIp
  );
  const config = verificationAttemptLimits();

  try {
    const result = await getRedis().eval(
      VERIFY_CODE_LUA,
      6,
      keys.codeKey,
      keys.sourceAttemptsKey,
      keys.challengeAttemptsKey,
      keys.recipientAttemptsKey,
      keys.ipAttemptsKey,
      keys.globalAttemptsKey,
      submittedCode,
      config.source,
      config.challenge,
      config.recipient,
      config.ip,
      config.global,
      config.windowSeconds
    ) as [number, number];
    if (Number(result[0]) === 1) return "valid";
    return Number(result[1]) === 1 ? "rate_limited" : "invalid";
  } catch (error) {
    throw unavailable(error);
  }
}
