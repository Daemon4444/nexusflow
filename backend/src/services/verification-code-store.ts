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
export const VERIFICATION_MAX_ATTEMPTS = 5;

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
  attempts: number;
  expiresAt: number;
  reservationToken: string;
}

interface MemorySendLock {
  token: string;
  expiresAt: number;
}

const memoryCodes = new Map<string, MemoryCode>();
const memorySendLocks = new Map<string, MemorySendLock>();

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

  redis.call("DEL", KEYS[2])
  redis.call(
    "HSET",
    KEYS[2],
    "code",
    ARGV[3],
    "attempts",
    "0",
    "reservationToken",
    ARGV[1]
  )
  redis.call("EXPIRE", KEYS[2], tonumber(ARGV[4]))

  return {1, tonumber(ARGV[2])}
`;

const VERIFY_CODE_LUA = `
  local storedCode = redis.call("HGET", KEYS[1], "code")
  if not storedCode then
    return 0
  end

  local attempts = tonumber(redis.call("HGET", KEYS[1], "attempts") or "0")
  local maxAttempts = tonumber(ARGV[2])

  if attempts >= maxAttempts then
    redis.call("DEL", KEYS[1])
    return 0
  end

  attempts = attempts + 1

  if storedCode == ARGV[1] then
    redis.call("DEL", KEYS[1])
    return 1
  end

  if attempts >= maxAttempts then
    redis.call("DEL", KEYS[1])
  else
    redis.call("HSET", KEYS[1], "attempts", attempts)
  end

  return 0
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
): { lockKey: string; codeKey: string; memoryKey: string } {
  const digest = subjectDigest(channel, identifier);
  // The hash tag keeps both keys in one Redis Cluster slot.
  const prefix = `nexusflow:verification:{${digest}}`;
  return {
    lockKey: `${prefix}:send-lock`,
    codeKey: `${prefix}:code`,
    memoryKey: `${channel}:${digest}`,
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
  token: string
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

  memorySendLocks.set(memoryKey, {
    token,
    expiresAt: now + VERIFICATION_SEND_INTERVAL_SECONDS * 1000,
  });
  memoryCodes.set(memoryKey, {
    code,
    attempts: 0,
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
  code: string
): Promise<ReserveVerificationCodeResult> {
  const normalizedIdentifier = normalizeIdentifier(channel, identifier);
  const token = crypto.randomBytes(24).toString("hex");

  if (useMemoryStore()) {
    return reserveInMemory(channel, normalizedIdentifier, code, token);
  }

  const { lockKey, codeKey } = keysFor(channel, normalizedIdentifier);

  try {
    const result = (await getRedis().eval(
      RESERVE_CODE_LUA,
      2,
      lockKey,
      codeKey,
      token,
      VERIFICATION_SEND_INTERVAL_SECONDS,
      code,
      VERIFICATION_CODE_TTL_SECONDS
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
    const { memoryKey } = keysFor(
      reservation.channel,
      reservation.identifier
    );
    const code = memoryCodes.get(memoryKey);

    if (code?.reservationToken === reservation.token) {
      memoryCodes.delete(memoryKey);
    }
    return;
  }

  const { codeKey } = keysFor(
    reservation.channel,
    reservation.identifier
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
  submittedCode: string
): boolean {
  const { memoryKey } = keysFor(channel, identifier);
  const stored = memoryCodes.get(memoryKey);

  if (!stored || stored.expiresAt <= Date.now()) {
    memoryCodes.delete(memoryKey);
    return false;
  }

  if (stored.attempts >= VERIFICATION_MAX_ATTEMPTS) {
    memoryCodes.delete(memoryKey);
    return false;
  }

  stored.attempts += 1;
  const matches =
    stored.code.length === submittedCode.length &&
    crypto.timingSafeEqual(
      Buffer.from(stored.code),
      Buffer.from(submittedCode)
    );

  if (matches || stored.attempts >= VERIFICATION_MAX_ATTEMPTS) {
    memoryCodes.delete(memoryKey);
  }

  return matches;
}

/**
 * Atomically consumes one attempt. A correct code succeeds only once, and the
 * code is deleted after five total attempts or after its first success.
 */
export async function verifyVerificationCode(
  channel: VerificationChannel,
  identifier: string,
  submittedCode: string
): Promise<boolean> {
  const normalizedIdentifier = normalizeIdentifier(channel, identifier);

  if (useMemoryStore()) {
    return verifyInMemory(channel, normalizedIdentifier, submittedCode);
  }

  const { codeKey } = keysFor(channel, normalizedIdentifier);

  try {
    const result = await getRedis().eval(
      VERIFY_CODE_LUA,
      1,
      codeKey,
      submittedCode,
      VERIFICATION_MAX_ATTEMPTS
    );
    return Number(result) === 1;
  } catch (error) {
    throw unavailable(error);
  }
}
