import { getEffectiveRateLimit } from "../data/ratelimits";
import { checkRPM, checkTPM, reconcileTokensAsync } from "./rate-limiter";

type AccountScope = {
  userId: string;
  kind: "account" | "owner";
  qpm: number;
  tpm: number;
};

async function resolveScopes(params: {
  userId: string;
  parentUserId?: string | null;
  modelId: string;
}): Promise<AccountScope[]> {
  const individual = await getEffectiveRateLimit(params.userId, params.modelId);
  const scopes: AccountScope[] = [{
    userId: params.userId,
    kind: "account",
    qpm: individual.qpm,
    tpm: individual.tpm,
  }];
  if (params.parentUserId && params.parentUserId !== params.userId) {
    const owner = await getEffectiveRateLimit(params.parentUserId, params.modelId);
    scopes.push({
      userId: params.parentUserId,
      kind: "owner",
      qpm: owner.qpm,
      tpm: owner.tpm,
    });
  }
  return scopes;
}

export type AccountRateLimitResult =
  | { allowed: true; remaining?: number; resetMs?: number }
  | {
      allowed: false;
      kind: "account" | "owner";
      dimension: "qpm" | "tpm";
      limit: number;
      remaining?: number;
      resetMs?: number;
    };

/**
 * A sub-account keeps its own bucket and also consumes the main account's
 * existing bucket. Main-account traffic uses that same aggregate bucket, so
 * creating children cannot multiply the configured account throughput.
 */
export async function reserveAccountQpm(params: {
  userId: string;
  parentUserId?: string | null;
  modelId: string;
}): Promise<AccountRateLimitResult> {
  let remaining = Number.POSITIVE_INFINITY;
  let resetMs = 0;
  for (const scope of await resolveScopes(params)) {
    const result = await checkRPM(
      `user:${scope.userId}:${params.modelId}`,
      scope.qpm
    );
    if (!result.allowed) {
      return {
        allowed: false,
        kind: scope.kind,
        dimension: "qpm",
        limit: scope.qpm,
        resetMs: result.resetMs,
      };
    }
    remaining = Math.min(remaining, result.remaining);
    resetMs = Math.max(resetMs, result.resetMs);
  }
  return {
    allowed: true,
    remaining: Number.isFinite(remaining) ? remaining : 0,
    resetMs,
  };
}

export async function reserveAccountTpm(params: {
  userId: string;
  parentUserId?: string | null;
  modelId: string;
  estimatedTokens: number;
}): Promise<AccountRateLimitResult> {
  const reserved: AccountScope[] = [];
  for (const scope of await resolveScopes(params)) {
    const result = await checkTPM(
      `user:${scope.userId}:${params.modelId}`,
      scope.tpm,
      params.estimatedTokens
    );
    if (!result.allowed) {
      await Promise.all(
        reserved.map((item) =>
          reconcileTokensAsync(
            `user:${item.userId}:${params.modelId}`,
            params.estimatedTokens,
            0
          )
        )
      );
      return {
        allowed: false,
        kind: scope.kind,
        dimension: "tpm",
        limit: scope.tpm,
        remaining: result.remaining,
      };
    }
    reserved.push(scope);
  }
  return { allowed: true };
}

export async function reconcileAccountTpm(params: {
  userId: string;
  parentUserId?: string | null;
  modelId: string;
  reservedTokens: number;
  actualTokens: number;
}): Promise<void> {
  await Promise.all(
    (await resolveScopes(params)).map((scope) =>
      reconcileTokensAsync(
        `user:${scope.userId}:${params.modelId}`,
        params.reservedTokens,
        params.actualTokens
      )
    )
  );
}
